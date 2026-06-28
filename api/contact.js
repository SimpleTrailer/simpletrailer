/**
 * Kontaktformular-Endpoint — sendet Anfragen von der Startseite per Resend
 * an info@simpletrailer.de. Vorher ging das Formular ins Leere (UI-only).
 */
const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

const rateLimit = new Map();
function isRateLimited(ip) {
  const now = Date.now();
  const arr = (rateLimit.get(ip) || []).filter(t => now - t < 60_000);
  if (arr.length >= 3) return true;
  arr.push(now);
  rateLimit.set(ip, arr);
  if (rateLimit.size > 500) {
    for (const [k, v] of rateLimit) if (!v.some(t => now - t < 60_000)) rateLimit.delete(k);
  }
  return false;
}
const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const ip = (req.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim();
  if (isRateLimited(ip)) return res.status(429).json({ error: 'Zu viele Anfragen — bitte kurz warten.' });

  try {
    // Honeypot: echte Nutzer füllen dieses Feld nie aus → Spam-Bot, still verwerfen
    // (200 ok, damit der Bot zufrieden ist und nicht erneut probiert — aber keine Mail)
    if (String(req.body?.hp_field || '').trim()) {
      console.log('contact: honeypot hit', ip);
      return res.status(200).json({ ok: true });
    }

    const name    = String(req.body?.name || '').trim().slice(0, 120);
    const email   = String(req.body?.email || '').trim().slice(0, 200);
    const phone   = String(req.body?.phone || '').trim().slice(0, 40);
    const message = String(req.body?.message || '').trim().slice(0, 4000);

    const validMail  = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
    const validPhone = /^[\d\s+()\/-]{6,20}$/.test(phone);
    if (!name || !message || (!validMail && !validPhone)) {
      return res.status(400).json({ error: 'Bitte Name, Nachricht und eine gültige E-Mail oder Telefonnummer angeben.' });
    }

    await resend.emails.send({
      from: 'SimpleTrailer <buchung@simpletrailer.de>',
      to: ['info@simpletrailer.de'],
      reply_to: validMail ? email : undefined,
      subject: phone ? `📞 Rückruf-Bitte von ${name}` : `Kontaktanfrage von ${name}`,
      text: `Name: ${name}\nE-Mail: ${email}${phone ? `\nTelefon: ${phone}` : ''}\n\n${message}`,
      html: `<div style="font-family:system-ui,sans-serif;max-width:560px;">
        <h2 style="margin:0 0 12px;">Kontaktanfrage über simpletrailer.de</h2>
        <p><strong>Name:</strong> ${esc(name)}<br><strong>E-Mail:</strong> <a href="mailto:${esc(email)}">${esc(email)}</a>${phone ? `<br><strong>Telefon:</strong> <a href="tel:${esc(phone.replace(/\s/g, ''))}">${esc(phone)}</a>` : ''}</p>
        <div style="background:#f5f5f5;border-radius:8px;padding:14px 16px;white-space:pre-wrap;">${esc(message)}</div>
      </div>`
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('contact:', err.message);
    return res.status(500).json({ error: 'Senden fehlgeschlagen — bitte direkt an info@simpletrailer.de mailen.' });
  }
};
