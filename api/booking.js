const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');
const crypto = require('crypto');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

const fmt = (d) => new Date(d).toLocaleString('de-DE', {
  day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin'
});

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    const { id, token } = req.query;
    if (!id || !token) return res.status(400).json({ error: 'Fehlende Parameter' });

    try {
      const { data: booking, error } = await supabase
        .from('bookings').select('*, trailers(name, late_fee_per_hour)')
        .eq('id', id).eq('return_token', token).single();

      if (error || !booking) return res.status(404).json({ error: 'Buchung nicht gefunden' });

      const { stripe_payment_method_id, stripe_customer_id, return_token, ...safe } = booking;
      return res.status(200).json(safe);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'POST') {
    try {
      const { payment_intent_id } = req.body;

      const pi = await stripe.paymentIntents.retrieve(payment_intent_id);
      if (pi.status !== 'succeeded') {
        return res.status(400).json({ error: 'Zahlung noch nicht abgeschlossen' });
      }

      const { data: existing } = await supabase
        .from('bookings').select('id, access_code, return_token, precheck_token')
        .eq('stripe_payment_intent_id', payment_intent_id).maybeSingle();

      if (existing) {
        const siteUrlEx = process.env.SITE_URL || 'https://simpletrailer.de';
        const precheckUrlEx = existing.precheck_token
          ? `${siteUrlEx}/precheck?id=${existing.id}&token=${existing.precheck_token}`
          : null;
        return res.status(200).json({
          booking_id: existing.id, already_confirmed: true,
          precheck_url: precheckUrlEx,
          return_token: existing.return_token,
          start_time: null, end_time: null, amount: 0
        });
      }

      const meta = pi.metadata;
      const amount = pi.amount / 100;
      const return_token    = crypto.randomBytes(32).toString('hex');
      const precheck_token  = crypto.randomBytes(32).toString('hex');
      const access_code     = Math.floor(100000 + Math.random() * 900000).toString();

      const insType   = meta.insurance_type   || 'none';
      const insAmount = parseFloat(meta.insurance_amount || '0') || 0;

      const { data: booking, error: bookingError } = await supabase
        .from('bookings').insert({
          trailer_id: meta.trailer_id, customer_name: meta.customer_name,
          customer_email: meta.customer_email, customer_phone: meta.customer_phone || null,
          start_time: meta.start_time, end_time: meta.end_time,
          pricing_type: meta.pricing_type, total_amount: amount,
          insurance_type: insType, insurance_amount: insAmount,
          customer_address: meta.customer_address || null,
          user_id: meta.user_id || null,
          stripe_payment_intent_id: payment_intent_id,
          stripe_customer_id: pi.customer, stripe_payment_method_id: pi.payment_method,
          status: 'confirmed', access_code, return_token, precheck_token,
          agb_version:     meta.agb_version || null,
          agb_accepted_at: meta.agb_accepted_at || null,
          agb_accepted_ip: meta.agb_accepted_ip || null
        }).select('*, trailers(name)').single();

      if (bookingError) throw bookingError;

      await supabase.from('trailers').update({ is_available: false }).eq('id', meta.trailer_id);

      const siteUrl     = process.env.SITE_URL || 'https://simpletrailer.de';
      const returnUrl   = `${siteUrl}/return.html?id=${booking.id}&token=${return_token}`;
      const precheckUrl = `${siteUrl}/precheck?id=${booking.id}&token=${precheck_token}`;

      try { await resend.emails.send({
        from: 'SimpleTrailer <buchung@simpletrailer.de>',
        to: meta.customer_email,
        subject: `✅ Buchung bestätigt #${booking.id.slice(0, 8).toUpperCase()} – SimpleTrailer`,
        html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0D0D0D;font-family:system-ui,sans-serif;color:#fff;">
          <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
            <div style="text-align:center;margin-bottom:32px;">
              <span style="font-size:1.5rem;font-weight:800;">Simple</span><span style="font-size:1.5rem;font-weight:800;color:#E85D00;">Trailer</span>
            </div>
            <div style="background:#1A1A1A;border-radius:16px;padding:32px;border:1px solid #383838;">
              <h1 style="margin:0 0 8px;font-size:1.4rem;">Buchung bestätigt! 🎉</h1>
              <p style="color:#888;margin:0 0 28px;">Hallo ${meta.customer_name}, dein Anhänger ist reserviert.</p>
              <div style="background:#111;border-radius:10px;padding:16px 20px;margin-bottom:20px;">
                <p style="color:#E85D00;font-size:0.68rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin:0 0 4px;">Buchungsnummer</p>
                <p style="font-weight:800;font-size:1.1rem;margin:0;">#${booking.id.slice(0, 8).toUpperCase()}</p>
              </div>
              <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
                <tr><td style="color:#888;padding:9px 0;border-bottom:1px solid #2a2a2a;font-size:.88rem;">Anhänger</td><td style="text-align:right;padding:9px 0;border-bottom:1px solid #2a2a2a;font-size:.88rem;">${booking.trailers?.name || 'PKW-Anhänger'}</td></tr>
                <tr><td style="color:#888;padding:9px 0;border-bottom:1px solid #2a2a2a;font-size:.88rem;">Mietdauer</td><td style="text-align:right;padding:9px 0;border-bottom:1px solid #2a2a2a;font-size:.88rem;">${meta.pricing_type || '–'}</td></tr>
                <tr><td style="color:#888;padding:9px 0;border-bottom:1px solid #2a2a2a;font-size:.88rem;">Schutzpaket</td><td style="text-align:right;padding:9px 0;border-bottom:1px solid #2a2a2a;font-size:.88rem;">${insType === 'none' ? 'Kein Schutz' : insType === 'basis' ? 'Basis Schutz (500 € SB)' : 'Premium Schutz (50 € SB)'}</td></tr>
                <tr><td style="color:#888;padding:9px 0;border-bottom:1px solid #2a2a2a;font-size:.88rem;">Von</td><td style="text-align:right;padding:9px 0;border-bottom:1px solid #2a2a2a;font-size:.88rem;">${fmt(meta.start_time)}</td></tr>
                <tr><td style="color:#888;padding:9px 0;border-bottom:1px solid #2a2a2a;font-size:.88rem;">Bis</td><td style="text-align:right;padding:9px 0;border-bottom:1px solid #2a2a2a;font-size:.88rem;">${fmt(meta.end_time)}</td></tr>
                <tr><td style="color:#888;padding:9px 0;font-size:.88rem;">Bezahlt</td><td style="text-align:right;padding:9px 0;color:#E85D00;font-weight:700;font-size:1rem;">${amount.toFixed(2)} €</td></tr>
              </table>
              <div style="background:#0a1f0a;border:1.5px solid #22c55e;border-radius:12px;padding:20px;margin-bottom:20px;">
                <p style="color:#4ade80;font-size:.68rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin:0 0 6px;">Schritt 1 – Vor Abholung</p>
                <p style="margin:0 0 12px;font-size:.9rem;">Mache ein <strong>Foto des Anhängers</strong> und bestätige den Zustand – erst dann wird dir der Zugangscode für das Schloss angezeigt.</p>
                <a href="${precheckUrl}" style="display:inline-block;background:#22c55e;color:#000;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:700;font-size:.9rem;">📷 Vorab-Check starten →</a>
              </div>
              <div style="background:#1a1a1a;border:1px solid #383838;border-radius:12px;padding:16px 20px;margin-bottom:20px;text-align:center;">
                <p style="color:#888;font-size:.78rem;margin:0 0 4px;">Schritt 2 – Nach der Nutzung</p>
                <a href="${returnUrl}" style="color:#E85D00;font-size:.85rem;font-weight:600;text-decoration:none;">Rückgabe bestätigen →</a>
              </div>
              <div style="background:#111;border-radius:10px;padding:16px 20px;margin-bottom:16px;">
                <p style="color:#888;font-size:.78rem;margin:0 0 6px;">Alle Infos auf einen Blick:</p>
                <p style="font-size:.85rem;margin:0;">Buchungsdetails, Schutzpaket, Vorab-Check und Rückgabe findest du jederzeit in deinem <a href="${siteUrl}/account" style="color:#E85D00;text-decoration:none;font-weight:600;">Kundenbereich →</a></p>
              </div>
              <p style="color:#555;font-size:.75rem;text-align:center;margin:0;">Beide Links bitte aufbewahren.</p>
            </div>
            <p style="color:#444;font-size:.72rem;text-align:center;margin-top:24px;">SimpleTrailer · Bremen · info@simpletrailer.de</p>
          </div>
        </body></html>`
      }); } catch(emailErr) { console.error('E-Mail Fehler:', emailErr.message); }

      return res.status(200).json({
        booking_id: booking.id, return_token, precheck_url: precheckUrl,
        start_time: meta.start_time, end_time: meta.end_time,
        amount, trailer_name: 'PKW-Anhänger mit Plane'
      });

    } catch (err) {
      console.error('booking POST:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
};
