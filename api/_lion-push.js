/**
 * SimpleTrailer Lion-Push Helper
 *
 * Zentrales Modul für Notifications an Lion / info@simpletrailer.de.
 * Unterstrich-Prefix => Vercel exponiert das nicht als Route.
 *
 * Strategie: Mail-only (User-Entscheidung 2026-05-06: ein System für alles).
 *
 * Verwendung in Cron-Jobs:
 *   const { pushLion } = require('./_lion-push.js');
 *   await pushLion({
 *     severity: 'critical' | 'red' | 'yellow' | 'info' | 'green',
 *     title: 'Kurzer Betreff',
 *     body: 'Plain-Text-Inhalt',
 *     htmlBody: '<p>HTML-Inhalt</p>',  // optional
 *     link: 'https://...',              // optional, wird angehängt
 *   });
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

/**
 * @param {Object} opts
 * @param {string} opts.severity - 'critical'|'red'|'yellow'|'info'|'green'
 * @param {string} opts.title - Subject-Titel
 * @param {string} [opts.body] - Plain text content
 * @param {string} [opts.htmlBody] - HTML content (preferred)
 * @param {string} [opts.link] - Action-Link
 * @param {string} [opts.category] - 'alert'|'routine'|'briefing'|'approval' - bestimmt Subject-Prefix
 *                                    Default: 'alert' bei critical/red, 'routine' bei rest
 */
async function pushLion({ severity = 'info', title, body, htmlBody, link, category }) {
  if (!title) throw new Error('pushLion: title required');
  const icon = ICONS[severity] || '•';

  // Subject-Prefix für Mail-Filter
  if (!category) {
    category = (severity === 'critical' || severity === 'red') ? 'alert' : 'routine';
  }
  const PREFIX = {
    alert:    '[ST-Alert]',
    routine:  '[ST-Routine]',
    briefing: '[ST-Briefing]',
    approval: '[ST-Approval]',
  };
  const prefix = PREFIX[category] || '[ST]';

  const linkBlock = link
    ? `<div style="margin-top:18px;text-align:center;"><a href="${link}" style="display:inline-block;background:#E85D00;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Direkt öffnen →</a></div>`
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

  return resend.emails.send({
    from: 'SimpleTrailer <buchung@simpletrailer.de>',
    reply_to: 'info@simpletrailer.de',
    to: 'info@simpletrailer.de',
    subject: `${prefix} ${icon} ${title}`,
    html: finalHtml,
  });
}

module.exports = { pushLion };
