/**
 * SimpleTrailer Lion-Push Helper
 *
 * Zentrales Modul für Notifications an Lion.
 * Unterstrich-Prefix => Vercel exponiert das nicht als Route.
 *
 * Routing-Strategie (2026-05-06):
 *   - urgent   → LION_URGENT_EMAIL    (Bremen-Termin, Stripe-Fehler, kritische Bugs)
 *   - briefing → LION_BRIEFING_EMAIL  (Tagesplan, Wochen-Report, Mid-Week)
 *   - approval → LION_APPROVAL_EMAIL  (Insta-Posts, Content-Drafts zum Genehmigen)
 *   - routine  → LION_ROUTINE_EMAIL   (Konkurrenz, Legal-Audit, andere Reports)
 *
 * Jede ENV ist optional → Fallback ist info@simpletrailer.de.
 * So bleibt das System out-of-the-box funktional, und Lion kann später
 * je nach Bedürfnis eigene Postfächer einrichten (z.B. routine@... oder
 * Plus-Adressing wie info+routine@simpletrailer.de).
 *
 * Bei urgent: kann auch Komma-Liste mehrerer Adressen sein (z.B.
 * "info@simpletrailer.de,lion-privat@gmail.com"), Resend akzeptiert array.
 *
 * Verwendung in Cron-Jobs:
 *   const { pushLion, getLionEmail } = require('./_lion-push.js');
 *   await pushLion({ severity: 'critical', category: 'urgent', title, htmlBody, link });
 *   // ODER bei direkten resend.emails.send:
 *   resend.emails.send({ to: getLionEmail('briefing'), ... })
 */
const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

const ICONS = {
  critical: '🚨',
  red:      '🔴',
  yellow:   '🟡',
  info:     'ℹ️',
  green:    '🟢',
};

const PREFIX = {
  urgent:   '[ST-Urgent]',
  alert:    '[ST-Alert]',     // Alias für urgent (backward-compat)
  briefing: '[ST-Briefing]',
  approval: '[ST-Approval]',
  routine:  '[ST-Routine]',
};

/**
 * Liefert die Empfänger-Adresse(n) für eine Kategorie.
 * Komma-getrennte ENV → Array (Resend kann beides).
 *
 * @param {string} category - 'urgent'|'briefing'|'approval'|'routine'
 * @returns {string|string[]} Empfänger
 */
function getLionEmail(category = 'routine') {
  const envMap = {
    urgent:   process.env.LION_URGENT_EMAIL,
    alert:    process.env.LION_URGENT_EMAIL,   // Alias
    briefing: process.env.LION_BRIEFING_EMAIL,
    approval: process.env.LION_APPROVAL_EMAIL,
    routine:  process.env.LION_ROUTINE_EMAIL,
  };
  const raw = envMap[category];
  if (!raw) return 'info@simpletrailer.de';
  // Komma-Liste → Array
  const list = raw.split(',').map(s => s.trim()).filter(Boolean);
  return list.length === 1 ? list[0] : list;
}

/**
 * @param {Object} opts
 * @param {string} opts.severity - 'critical'|'red'|'yellow'|'info'|'green'
 * @param {string} opts.title - Subject-Titel
 * @param {string} [opts.body] - Plain text content
 * @param {string} [opts.htmlBody] - HTML content (preferred)
 * @param {string} [opts.link] - Action-Link
 * @param {string} [opts.category] - 'urgent'|'briefing'|'approval'|'routine'
 *                                    Default: 'urgent' bei critical/red, 'routine' sonst
 *                                    'alert' wird auf 'urgent' gemappt (backward-compat)
 */
async function pushLion({ severity = 'info', title, body, htmlBody, link, category }) {
  if (!title) throw new Error('pushLion: title required');
  const icon = ICONS[severity] || '•';

  if (!category) {
    category = (severity === 'critical' || severity === 'red') ? 'urgent' : 'routine';
  }
  if (category === 'alert') category = 'urgent'; // backward-compat
  const prefix = PREFIX[category] || '[ST]';
  const to = getLionEmail(category);

  const linkBlock = link
    ? `<div style="margin-top:18px;text-align:center;"><a href="${link}" style="display:inline-block;background:#E85D00;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:1rem;">Direkt öffnen →</a></div>`
    : '';

  const finalHtml = htmlBody
    ? `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0D0D0D;font-family:system-ui,sans-serif;color:#fff;">
        <div style="max-width:600px;margin:0 auto;padding:32px 20px;">
          <div style="text-align:center;margin-bottom:20px;">
            <span style="font-size:1.4rem;font-weight:800;">Simple</span><span style="font-size:1.4rem;font-weight:800;color:#E85D00;">Trailer</span>
          </div>
          <div style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:14px;padding:22px;color:#ddd;line-height:1.6;font-size:.92rem;">
            <h2 style="font-size:1.1rem;margin:0 0 14px;">${icon} ${title}</h2>
            ${htmlBody}
            ${linkBlock}
          </div>
        </div>
      </body></html>`
    : `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0D0D0D;font-family:system-ui,sans-serif;color:#fff;">
        <div style="max-width:600px;margin:0 auto;padding:32px 20px;">
          <div style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:14px;padding:22px;color:#ddd;">
            <h2 style="font-size:1.1rem;margin:0 0 14px;">${icon} ${title}</h2>
            <p style="line-height:1.6;font-size:.92rem;">${body || ''}</p>
            ${linkBlock}
          </div>
        </div>
      </body></html>`;

  // Bei urgent zusätzlich High-Priority-Header → mehrere Mail-Clients zeigen
  // den Mail prominenter / sofort als Push auf Handy.
  const headers = (category === 'urgent')
    ? { 'X-Priority': '1', 'X-MSMail-Priority': 'High', 'Importance': 'High' }
    : undefined;

  return resend.emails.send({
    from: 'SimpleTrailer <buchung@simpletrailer.de>',
    reply_to: 'info@simpletrailer.de',
    to,
    subject: `${prefix} ${icon} ${title}`,
    html: finalHtml,
    headers,
  });
}

module.exports = { pushLion, getLionEmail };
