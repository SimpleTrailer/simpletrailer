/**
 * SimpleTrailer: Newsletter-Subscribe (Double-Opt-In)
 *
 * POST { email, source? } -> erstellt pending-Eintrag mit Token,
 * sendet Confirmation-Mail.
 * User klickt Link -> /api/newsletter-confirm?token=...
 *
 * DSGVO-konform: keine Mails ohne explizite Bestaetigung.
 */
const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');
const crypto = require('crypto');
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
  const source = String(body.source || 'website').slice(0, 50);

  if (!email || !email.includes('@') || !email.includes('.')) {
    return res.status(400).json({ error: 'Invalid email' });
  }

  try {
    const token = crypto.randomBytes(32).toString('hex');

    // Existiert schon?
    const { data: existing } = await supabase
      .from('newsletter_subscribers')
      .select('status')
      .eq('email', email)
      .maybeSingle();

    if (existing?.status === 'confirmed') {
      return res.status(200).json({ ok: true, already_subscribed: true });
    }

    // Upsert (ueberschreibt Token bei pending)
    const { error } = await supabase
      .from('newsletter_subscribers')
      .upsert({
        email,
        status: 'pending',
        confirmation_token: token,
        source,
      }, { onConflict: 'email' });

    if (error) {
      if (/relation .* does not exist/i.test(error.message || '')) {
        return res.status(503).json({ error: 'newsletter_subscribers table missing', skipped: true });
      }
      throw error;
    }

    const confirmUrl = `https://simpletrailer.de/api/newsletter-confirm?token=${token}`;

    await resend.emails.send({
      from: 'SimpleTrailer <buchung@simpletrailer.de>',
      reply_to: 'info@simpletrailer.de',
      to: email,
      subject: '✉️ Bitte bestätige deine Newsletter-Anmeldung',
      html: T.layout({
        heading: 'Bestätige deine Anmeldung 👋',
        preheader: 'Ein Klick noch, dann bist du dabei.',
        bodyHtml:
          T.p('Du hast dich für den SimpleTrailer-Newsletter angemeldet. Klick auf den Button, um die Anmeldung abzuschließen — sonst passiert nichts und du bekommst keine Mails von uns.') +
          T.cta(T.btn('Anmeldung bestätigen ✓', confirmUrl)) +
          T.p(`<span style="font-size:13px;color:#8A857D;">Falls der Button nicht funktioniert:<br><a href="${confirmUrl}" style="color:#E85D00;word-break:break-all;">${confirmUrl}</a></span>`) +
          T.callout('Falls du diese Mail nicht angefordert hast, ignorier sie einfach. Wir speichern keine Daten, wenn du nicht bestätigst.', 'grey')
      })
    });

    return res.status(200).json({ ok: true, confirmation_sent: true });
  } catch (err) {
    console.error('newsletter-subscribe:', err);
    return res.status(500).json({ error: err.message });
  }
};
