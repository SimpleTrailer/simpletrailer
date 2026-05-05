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

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

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
      html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0D0D0D;font-family:system-ui,sans-serif;color:#fff;">
        <div style="max-width:600px;margin:0 auto;padding:32px 20px;">
          <div style="text-align:center;margin-bottom:24px;">
            <span style="font-size:1.4rem;font-weight:800;">Simple</span><span style="font-size:1.4rem;font-weight:800;color:#E85D00;">Trailer</span>
          </div>
          <div style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:14px;padding:24px;">
            <h1 style="font-size:1.2rem;margin:0 0 12px;">Bestätige deine Anmeldung 👋</h1>
            <p style="color:#bbb;font-size:.9rem;line-height:1.6;margin:0 0 20px;">
              Du hast dich für den SimpleTrailer-Newsletter angemeldet. Klick auf den Button um die Anmeldung abzuschließen — sonst passiert nichts und du bekommst keine Mails von uns.
            </p>
            <div style="text-align:center;margin:24px 0;">
              <a href="${confirmUrl}" style="display:inline-block;background:#E85D00;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;">Anmeldung bestätigen ✓</a>
            </div>
            <p style="color:#666;font-size:.78rem;margin:0;">Falls der Button nicht funktioniert: <br><a href="${confirmUrl}" style="color:#E85D00;word-break:break-all;">${confirmUrl}</a></p>
          </div>
          <p style="font-size:.72rem;color:#555;text-align:center;margin:24px 0 0;">Falls du diese Mail nicht angefordert hast, ignorier sie einfach. Wir speichern keine Daten, wenn du nicht bestätigst.</p>
          <p style="font-size:.72rem;color:#555;text-align:center;margin:8px 0 0;">SimpleTrailer GbR · Waltjenstr. 96, 28237 Bremen · info@simpletrailer.de</p>
        </div>
      </body></html>`
    });

    return res.status(200).json({ ok: true, confirmation_sent: true });
  } catch (err) {
    console.error('newsletter-subscribe:', err);
    return res.status(500).json({ error: err.message });
  }
};
