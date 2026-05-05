/**
 * SimpleTrailer: Newsletter-Confirm Endpoint (Double-Opt-In Schritt 2)
 *
 * GET /api/newsletter-confirm?token=... -> setzt Status auf 'confirmed'.
 * Liefert HTML-Erfolgsseite zurueck.
 */
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const successHtml = (email) => `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Newsletter bestätigt — SimpleTrailer</title>
<style>body{margin:0;padding:0;background:#0D0D0D;font-family:system-ui,sans-serif;color:#fff;min-height:100vh;display:flex;align-items:center;justify-content:center;}.box{max-width:480px;padding:40px 28px;text-align:center;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:14px;}h1{font-size:1.4rem;margin:0 0 12px;}p{color:#bbb;font-size:.9rem;line-height:1.6;}a{display:inline-block;margin-top:20px;background:#E85D00;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;}</style>
</head><body><div class="box">
<div style="font-size:2.5rem;margin-bottom:14px;">✅</div>
<h1>Anmeldung bestätigt!</h1>
<p>${email ? email + ' ist jetzt' : 'Du bist jetzt'} im SimpleTrailer-Newsletter.<br>Wir schicken dir nur, wenn wir wirklich was zu sagen haben — nie Spam.</p>
<a href="https://simpletrailer.de">Zur Startseite →</a>
</div></body></html>`;

const errorHtml = (msg) => `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><title>Fehler</title>
<style>body{margin:0;padding:0;background:#0D0D0D;font-family:system-ui,sans-serif;color:#fff;min-height:100vh;display:flex;align-items:center;justify-content:center;}.box{max-width:480px;padding:40px 28px;text-align:center;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:14px;}h1{font-size:1.4rem;margin:0 0 12px;color:#ef4444;}p{color:#bbb;font-size:.9rem;line-height:1.6;}a{display:inline-block;margin-top:20px;background:#E85D00;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;}</style>
</head><body><div class="box">
<div style="font-size:2.5rem;margin-bottom:14px;">⚠️</div>
<h1>Bestätigung fehlgeschlagen</h1>
<p>${msg}</p>
<a href="https://simpletrailer.de">Zur Startseite →</a>
</div></body></html>`;

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  if (req.method !== 'GET') {
    res.status(405).end(errorHtml('Methode nicht erlaubt.'));
    return;
  }

  const token = String(req.query?.token || '').trim();
  if (!token || token.length < 32) {
    res.status(400).end(errorHtml('Ungültiger Bestätigungs-Link.'));
    return;
  }

  try {
    const { data: sub, error: selErr } = await supabase
      .from('newsletter_subscribers')
      .select('id, email, status')
      .eq('confirmation_token', token)
      .maybeSingle();

    if (selErr || !sub) {
      res.status(404).end(errorHtml('Link unbekannt oder abgelaufen. Bitte erneut anmelden.'));
      return;
    }

    if (sub.status === 'confirmed') {
      res.status(200).end(successHtml(sub.email));
      return;
    }

    const { error: updErr } = await supabase
      .from('newsletter_subscribers')
      .update({
        status: 'confirmed',
        confirmed_at: new Date().toISOString(),
        confirmation_token: null,
      })
      .eq('id', sub.id);

    if (updErr) throw updErr;

    res.status(200).end(successHtml(sub.email));
  } catch (err) {
    console.error('newsletter-confirm:', err);
    res.status(500).end(errorHtml('Es gab ein technisches Problem. Versuch es später nochmal.'));
  }
};
