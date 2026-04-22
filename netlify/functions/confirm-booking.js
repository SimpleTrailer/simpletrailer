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

const PRICING_LABEL = { '3h': '3 Stunden', day: 'Ganzer Tag', weekend: 'Wochenende' };

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };

  try {
    const { payment_intent_id } = JSON.parse(event.body);

    // Zahlung bei Stripe prüfen
    const pi = await stripe.paymentIntents.retrieve(payment_intent_id);
    if (pi.status !== 'succeeded') {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Zahlung noch nicht abgeschlossen' }) };
    }

    // Doppelte Bestätigung verhindern
    const { data: existing } = await supabase
      .from('bookings')
      .select('id, access_code, return_token')
      .eq('stripe_payment_intent_id', payment_intent_id)
      .maybeSingle();

    if (existing) {
      return { statusCode: 200, headers, body: JSON.stringify({ booking_id: existing.id, access_code: existing.access_code, already_confirmed: true }) };
    }

    const meta = pi.metadata;
    const amount = pi.amount / 100;
    const return_token = crypto.randomBytes(32).toString('hex');
    const access_code = Math.floor(100000 + Math.random() * 900000).toString();

    // Buchung in Supabase anlegen
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .insert({
        trailer_id: meta.trailer_id,
        customer_name: meta.customer_name,
        customer_email: meta.customer_email,
        customer_phone: meta.customer_phone || null,
        start_time: meta.start_time,
        end_time: meta.end_time,
        pricing_type: meta.pricing_type,
        total_amount: amount,
        stripe_payment_intent_id: payment_intent_id,
        stripe_customer_id: pi.customer,
        stripe_payment_method_id: pi.payment_method,
        status: 'confirmed',
        access_code,
        return_token
      })
      .select()
      .single();

    if (bookingError) throw bookingError;

    // Anhänger als besetzt markieren
    await supabase.from('trailers').update({ is_available: false }).eq('id', meta.trailer_id);

    const siteUrl = process.env.SITE_URL || 'https://simpletrailer.de';
    const returnUrl = `${siteUrl}/return.html?id=${booking.id}&token=${return_token}`;

    // Bestätigungs-E-Mail senden
    await resend.emails.send({
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
              <tr><td style="color:#888;padding:9px 0;border-bottom:1px solid #2a2a2a;font-size:.88rem;">Anhänger</td><td style="text-align:right;padding:9px 0;border-bottom:1px solid #2a2a2a;font-size:.88rem;">PKW-Anhänger mit Plane</td></tr>
              <tr><td style="color:#888;padding:9px 0;border-bottom:1px solid #2a2a2a;font-size:.88rem;">Tarif</td><td style="text-align:right;padding:9px 0;border-bottom:1px solid #2a2a2a;font-size:.88rem;">${PRICING_LABEL[meta.pricing_type]}</td></tr>
              <tr><td style="color:#888;padding:9px 0;border-bottom:1px solid #2a2a2a;font-size:.88rem;">Von</td><td style="text-align:right;padding:9px 0;border-bottom:1px solid #2a2a2a;font-size:.88rem;">${fmt(meta.start_time)}</td></tr>
              <tr><td style="color:#888;padding:9px 0;border-bottom:1px solid #2a2a2a;font-size:.88rem;">Bis</td><td style="text-align:right;padding:9px 0;border-bottom:1px solid #2a2a2a;font-size:.88rem;">${fmt(meta.end_time)}</td></tr>
              <tr><td style="color:#888;padding:9px 0;font-size:.88rem;">Bezahlt</td><td style="text-align:right;padding:9px 0;color:#E85D00;font-weight:700;font-size:1rem;">${amount.toFixed(2)} €</td></tr>
            </table>

            <div style="background:#1a0d00;border:1.5px solid #E85D00;border-radius:12px;padding:20px;margin-bottom:24px;text-align:center;">
              <p style="color:#E85D00;font-size:.68rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin:0 0 6px;">Zugangscode Schloss</p>
              <p style="font-weight:800;font-size:2.2rem;letter-spacing:.2em;margin:0;">${access_code}</p>
              <p style="color:#888;font-size:.78rem;margin:8px 0 0;">Diesen Code am Zahlenschloss des Anhängers eingeben.</p>
            </div>

            <a href="${returnUrl}" style="display:block;text-align:center;background:#E85D00;color:#fff;text-decoration:none;padding:14px 20px;border-radius:8px;font-weight:700;font-size:.95rem;margin-bottom:12px;">Rückgabe bestätigen →</a>
            <p style="color:#555;font-size:.75rem;text-align:center;margin:0;">Diesen Link bitte aufbewahren – du brauchst ihn bei der Rückgabe.</p>
          </div>
          <p style="color:#444;font-size:.72rem;text-align:center;margin-top:24px;">SimpleTrailer · Bremen · info@simpletrailer.de</p>
        </div>
      </body></html>`
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        booking_id: booking.id,
        access_code,
        return_token,
        start_time: meta.start_time,
        end_time: meta.end_time,
        amount,
        trailer_name: 'PKW-Anhänger mit Plane'
      })
    };

  } catch (err) {
    console.error('confirm-booking:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
