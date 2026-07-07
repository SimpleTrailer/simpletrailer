const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { resolveDiscount, isRedeemed } = require('./_discounts');

// ── Rabattcode-Vorabprüfung ──────────────────────────────────────────────
// Leichter Endpoint, damit ein Rabattcode SCHON VOR der Führerschein-Verifizierung
// (und vor dem Login) eingegeben und geprüft werden kann. Gibt nur percent + scope
// zurück — keine sensiblen Daten, daher kein Auth-/Führerschein-Gate.
// Verbindlich abgezogen wird der Rabatt weiterhin ausschließlich in
// create-payment-intent.js (Single Source of Truth für den Stripe-Betrag).

const rateLimit = new Map();
function isRateLimited(ip) {
  const now = Date.now();
  const arr = (rateLimit.get(ip) || []).filter(t => now - t < 60_000);
  if (arr.length >= 20) return true;
  arr.push(now);
  rateLimit.set(ip, arr);
  return false;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const ip = (req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.connection?.remoteAddress || '')
    .split(',')[0].trim() || 'unknown';
  if (isRateLimited(ip)) return res.status(429).json({ valid: false, error: 'Zu viele Versuche — bitte kurz warten.' });

  const disc = resolveDiscount((req.body && req.body.discount_code) || '');
  if (disc.error)  return res.status(200).json({ valid: false, error: disc.error });
  if (!disc.code)  return res.status(200).json({ valid: false, error: 'Bitte einen Code eingeben.' });
  // Single-Use-Codes schon hier ehrlich melden, damit der Kunde nicht erst beim Bezahlen scheitert.
  if (disc.singleUse && await isRedeemed(stripe, disc.code)) {
    return res.status(200).json({ valid: false, error: 'Dieser Code wurde bereits eingelöst.' });
  }
  return res.status(200).json({ valid: true, code: disc.code, percent: disc.percent, scope: disc.scope });
};
