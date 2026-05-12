/**
 * In-Memory Rate-Limiter pro IP für SimpleTrailer-API.
 *
 * Verhindert Mail-Spam / Quota-Erschöpfung auf Endpoints wie:
 *  - /api/newsletter-subscribe
 *  - /api/notify-when-available
 *  - /api/chat (optional)
 *
 * Funktioniert auf Vercel-Serverless mit Vorbehalt: jeder Function-Container
 * hat eigenes Memory, also schützt es vor "ein Bot hämmert dieselbe Instanz",
 * nicht vor verteilten Angriffen. Für unsere Größenordnung (< 1k Reqs/Tag)
 * vollkommen ausreichend.
 */

const hits = new Map();

function getIp(req) {
  return (req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '')
    .split(',')[0].trim() || 'unknown';
}

/**
 * @param {object} req — Vercel Request
 * @param {object} opts — { maxPerHour: 5, maxPerMinute: 3 }
 * @returns {boolean} true wenn LIMIT erreicht (sperren), false wenn ok
 */
function isRateLimited(req, opts = {}) {
  const maxPerHour   = opts.maxPerHour   || 5;
  const maxPerMinute = opts.maxPerMinute || Math.max(1, Math.floor(maxPerHour / 5));
  const ip   = getIp(req);
  const now  = Date.now();
  const hour = now - 3600000;
  const min  = now -   60000;

  // Alte Hits aller IPs ausmisten (max alle ~10 Minuten ein Cleanup)
  if (Math.random() < 0.01) {
    for (const [k, arr] of hits.entries()) {
      const fresh = arr.filter(t => t > hour);
      if (fresh.length === 0) hits.delete(k);
      else hits.set(k, fresh);
    }
  }

  const recent = (hits.get(ip) || []).filter(t => t > hour);
  const lastMinute = recent.filter(t => t > min).length;
  if (recent.length >= maxPerHour || lastMinute >= maxPerMinute) {
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);
  return false;
}

module.exports = { isRateLimited, getIp };
