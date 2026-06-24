/**
 * SimpleTrailer: Notify-when-available Endpoint
 *
 * POST { email, trailer_type } -> speichert in notify_when_available.
 * User kriegt Bestaetigung. Wenn Anhaenger verfuegbar wird, schicken
 * wir manuell oder via Cron eine Mail an die Liste.
 */
const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');
const { isRateLimited } = require('./_rate-limit');
const T = require('./_email-template');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  // Rate-Limit: max 5/Stunde, max 2/Minute pro IP — verhindert Mail-Spam.
  if (isRateLimited(req, { maxPerHour: 5, maxPerMinute: 2 })) {
    return res.status(429).json({ error: 'Zu viele Anfragen. Bitte später erneut versuchen.' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  body = body || {};

  const email = String(body.email || '').trim().toLowerCase().slice(0, 254);
  const trailerType = String(body.trailer_type || '').trim();

  if (!email || !email.includes('@') || !email.includes('.')) {
    return res.status(400).json({ error: 'Invalid email' });
  }
  if (!['Autotransporter', 'Kofferanhaenger', 'PKW-Plane', 'Hochplane', 'Pferdeanhaenger', 'Rueckwaertskipper'].includes(trailerType)) {
    return res.status(400).json({ error: 'Invalid trailer_type' });
  }

  try {
    const { error } = await supabase
      .from('notify_when_available')
      .upsert({ email, trailer_type: trailerType }, { onConflict: 'email,trailer_type' });

    if (error) {
      if (/relation .* does not exist/i.test(error.message || '')) {
        return res.status(503).json({ error: 'notify_when_available table missing', skipped: true });
      }
      throw error;
    }

    // Bestaetigungsmail
    try {
      const labelMap = { Autotransporter: 'Autotransporter', Kofferanhaenger: 'Kofferanhänger', 'PKW-Plane': 'PKW-Anhänger mit Plane', Hochplane: 'Hochplanen-Anhänger', Pferdeanhaenger: 'Pferdeanhänger', Rueckwaertskipper: 'Rückwärtskipper' };
      const label = labelMap[trailerType];
      await resend.emails.send({
        from: 'SimpleTrailer <buchung@simpletrailer.de>',
        reply_to: 'info@simpletrailer.de',
        to: email,
        subject: `✅ Wir benachrichtigen dich, sobald der ${label} da ist`,
        html: T.layout({
          heading: 'Du bist auf der Liste 🎉',
          preheader: `Wir melden uns, sobald der ${label} in Bremen verfügbar ist.`,
          replyNote: 'Fragen? Antworte einfach auf diese Mail.',
          bodyHtml:
            T.p('Hallo,') +
            T.p(`sobald der <strong>${T.esc(label)}</strong> in Bremen verfügbar ist, schicken wir dir sofort eine Mail mit dem direkten Buchungs-Link.`) +
            T.callout('Schon jetzt buchbar: unser <strong>PKW-Anhänger mit Plane</strong> — falls du auch damit fahren kannst.', 'grey') +
            T.cta(T.btn('Zu simpletrailer.de →', 'https://simpletrailer.de'))
        })
      });
    } catch (e) { /* Mail-Fail ist nicht kritisch */ }

    // Mail an Lion
    try {
      await resend.emails.send({
        from: 'SimpleTrailer Notify <buchung@simpletrailer.de>',
        reply_to: 'info@simpletrailer.de',
        to: 'info@simpletrailer.de',
        subject: `👀 Neue Notify-Anmeldung: ${trailerType}`,
        html: `<p style="font-family:system-ui;">Neue Anmeldung fuer Benachrichtigung wenn <strong>${trailerType}</strong> verfuegbar:</p><p style="font-family:system-ui;font-size:.9rem;color:#666;">${email}</p>`
      });
    } catch (e) { /* ignore */ }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('notify-when-available:', err);
    return res.status(500).json({ error: err.message });
  }
};
