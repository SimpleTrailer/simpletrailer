/**
 * SimpleTrailer: Notify-when-available Endpoint
 *
 * POST { email, trailer_type } -> speichert in notify_when_available.
 * User kriegt Bestaetigung. Wenn Anhaenger verfuegbar wird, schicken
 * wir manuell oder via Cron eine Mail an die Liste.
 */
const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

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
  const trailerType = String(body.trailer_type || '').trim();

  if (!email || !email.includes('@') || !email.includes('.')) {
    return res.status(400).json({ error: 'Invalid email' });
  }
  if (!['Autotransporter', 'Kofferanhaenger', 'PKW-Plane'].includes(trailerType)) {
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
      const labelMap = { Autotransporter: 'Autotransporter', Kofferanhaenger: 'Kofferanhänger', 'PKW-Plane': 'PKW-Anhänger mit Plane' };
      await resend.emails.send({
        from: 'SimpleTrailer <buchung@simpletrailer.de>',
        reply_to: 'info@simpletrailer.de',
        to: email,
        subject: `✅ Wir benachrichtigen dich, sobald der ${labelMap[trailerType]} da ist`,
        html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0D0D0D;font-family:system-ui,sans-serif;color:#fff;">
          <div style="max-width:600px;margin:0 auto;padding:32px 20px;">
            <div style="text-align:center;margin-bottom:24px;">
              <span style="font-size:1.4rem;font-weight:800;">Simple</span><span style="font-size:1.4rem;font-weight:800;color:#E85D00;">Trailer</span>
            </div>
            <div style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:14px;padding:24px;">
              <h1 style="font-size:1.2rem;margin:0 0 12px;">Du bist auf der Liste! 🎉</h1>
              <p style="color:#bbb;font-size:.9rem;line-height:1.6;margin:0 0 16px;">
                Sobald der <strong>${labelMap[trailerType]}</strong> in Bremen verfügbar ist, schicken wir dir sofort eine Mail mit dem direkten Buchungs-Link.
              </p>
              <p style="color:#888;font-size:.82rem;margin:0;">Bis dahin: ein PKW-Anhänger mit Plane ist schon jetzt buchbar — falls du auch damit fahren kannst, schau gern auf <a href="https://simpletrailer.de" style="color:#E85D00;">simpletrailer.de</a> vorbei.</p>
            </div>
            <p style="font-size:.72rem;color:#555;text-align:center;margin:24px 0 0;">SimpleTrailer GbR · Waltjenstr. 96, 28237 Bremen · info@simpletrailer.de</p>
          </div>
        </body></html>`
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
