/**
 * "Nicht fahrtauglich"-Meldung — wird vom Pre-Check ausgelöst wenn Mieter feststellt
 * dass der Anhänger einen kritischen Schaden hat (Reifen, Beleuchtung, Bremse, etc.)
 *
 * Setzt bookings.refund_status = 'pending' und schickt Admin-Alert per Mail.
 * Auto-Refund passiert NICHT — Lion muss im Admin-Cockpit manuell freigeben.
 *
 * Auth: precheck_token muss zur booking_id passen (gleiche Mechanik wie Pre-Check).
 */
const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');
const { setCors } = require('./_cors');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

const fmt = d => new Date(d).toLocaleString('de-DE', {
  day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin'
});

module.exports = async (req, res) => {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { booking_id, precheck_token, photo_url, description } = req.body || {};
    if (!booking_id || !precheck_token) return res.status(400).json({ error: 'booking_id + precheck_token erforderlich' });

    const { data: booking, error } = await supabase
      .from('bookings')
      .select('*, trailers(name)')
      .eq('id', booking_id).eq('precheck_token', precheck_token).maybeSingle();
    if (error || !booking) return res.status(404).json({ error: 'Buchung nicht gefunden' });

    // Status setzen — bei fehlender Spalte (Migration ausstehend) fallback
    const upd = {
      not_drivable_reported_at: new Date().toISOString(),
      not_drivable_photo_url:   photo_url || null,
      not_drivable_description: description || null,
      refund_status:            'pending'
    };
    const { error: updErr } = await supabase.from('bookings').update(upd).eq('id', booking_id);
    if (updErr && !/column .* does not exist/i.test(updErr.message || '')) {
      console.error('not-drivable update fehlgeschlagen:', updErr.message);
    }

    // Admin-Mail
    try {
      await resend.emails.send({
        from: 'SimpleTrailer Cockpit <buchung@simpletrailer.de>',
        reply_to: 'info@simpletrailer.de',
        to: 'info@simpletrailer.de',
        subject: `[ST-Alert] 🛑 Anhänger nicht fahrtauglich — Refund prüfen #${booking.id.slice(0,8).toUpperCase()}`,
        text: `Mieter meldet beim Pre-Check: Anhänger nicht fahrtauglich.

Buchung: #${booking.id.slice(0,8).toUpperCase()}
Anhänger: ${booking.trailers?.name || 'Anhänger'}
Mieter: ${booking.customer_name} <${booking.customer_email}>
Mietbeginn: ${fmt(booking.start_time)} Uhr
Mietpreis: ${(booking.total_amount || 0).toFixed(2).replace('.', ',')} €

Beschreibung des Schadens:
${description || '(leer)'}

${photo_url ? 'Foto: ' + photo_url : '(kein Foto)'}

Aktion: Im Admin-Dashboard → Cockpit → "Refund freigeben" oder "Ablehnen".
https://simpletrailer.de/admin`,
        html: `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;background:#0D0D0D;color:#fff;margin:0;padding:30px 20px;">
          <div style="max-width:560px;margin:0 auto;background:#1A1A1A;border:1.5px solid #dc2626;border-radius:14px;padding:28px;">
            <div style="text-align:center;margin-bottom:18px;">
              <div style="font-size:2rem;margin-bottom:8px;">🛑</div>
              <h1 style="font-size:1.2rem;margin:0;color:#fca5a5;">Anhänger nicht fahrtauglich</h1>
              <p style="color:#888;font-size:.82rem;margin:4px 0 0;">Refund-Freigabe erforderlich</p>
            </div>
            <table style="width:100%;border-collapse:collapse;font-size:.86rem;margin-bottom:16px;">
              <tr><td style="color:#888;padding:7px 0;border-bottom:1px solid #2a2a2a;">Buchung</td><td style="text-align:right;padding:7px 0;border-bottom:1px solid #2a2a2a;"><strong>#${booking.id.slice(0,8).toUpperCase()}</strong></td></tr>
              <tr><td style="color:#888;padding:7px 0;border-bottom:1px solid #2a2a2a;">Anhänger</td><td style="text-align:right;padding:7px 0;border-bottom:1px solid #2a2a2a;">${booking.trailers?.name || '–'}</td></tr>
              <tr><td style="color:#888;padding:7px 0;border-bottom:1px solid #2a2a2a;">Mieter</td><td style="text-align:right;padding:7px 0;border-bottom:1px solid #2a2a2a;">${booking.customer_name}</td></tr>
              <tr><td style="color:#888;padding:7px 0;border-bottom:1px solid #2a2a2a;">Mietbeginn</td><td style="text-align:right;padding:7px 0;border-bottom:1px solid #2a2a2a;">${fmt(booking.start_time)}</td></tr>
              <tr><td style="color:#888;padding:7px 0;">Refund-Höhe</td><td style="text-align:right;padding:7px 0;color:#fca5a5;font-weight:700;">${(booking.total_amount || 0).toFixed(2).replace('.', ',')} €</td></tr>
            </table>
            <div style="background:#0d0d0d;border:1px solid #2a2a2a;border-radius:10px;padding:14px;margin-bottom:16px;">
              <p style="color:#fbbf24;font-size:.72rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;margin:0 0 6px;">Beschreibung</p>
              <p style="font-size:.86rem;color:#ddd;line-height:1.5;margin:0;">${description || '<em>leer</em>'}</p>
            </div>
            ${photo_url ? `<p style="text-align:center;margin:0 0 16px;"><a href="${photo_url}" target="_blank" style="color:#E85D00;font-size:.86rem;font-weight:600;text-decoration:none;">📷 Foto anschauen →</a></p>` : ''}
            <p style="text-align:center;margin:18px 0 0;">
              <a href="https://simpletrailer.de/admin" style="display:inline-block;background:#E85D00;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:700;">Im Cockpit prüfen →</a>
            </p>
          </div>
        </body></html>`
      });
    } catch (mailErr) {
      console.error('not-drivable mail fehlgeschlagen:', mailErr.message);
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('report-not-drivable:', err);
    return res.status(500).json({ error: err.message });
  }
};
