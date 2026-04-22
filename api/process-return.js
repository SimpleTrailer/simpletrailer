const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { booking_id, return_token, photo_url } = req.body;

    const { data: booking, error } = await supabase
      .from('bookings').select('*, trailers(name, late_fee_per_hour)')
      .eq('id', booking_id).eq('return_token', return_token).single();

    if (error || !booking) return res.status(404).json({ error: 'Buchung nicht gefunden' });
    if (booking.status === 'returned') return res.status(400).json({ error: 'Buchung bereits abgeschlossen' });

    const now = new Date();
    const expectedEnd = new Date(booking.end_time);
    const lateMs = now - expectedEnd;
    const lateHours = Math.max(0, Math.ceil(lateMs / (1000 * 60 * 60)));
    const lateFeePerHour = booking.trailers?.late_fee_per_hour || 5;
    const lateFeeAmount = lateHours * lateFeePerHour;

    let lateFeePaymentIntentId = null;
    let lateFeeCharged = false;

    if (lateFeeAmount > 0 && booking.stripe_payment_method_id && booking.stripe_customer_id) {
      try {
        const latePi = await stripe.paymentIntents.create({
          amount: Math.round(lateFeeAmount * 100), currency: 'eur',
          customer: booking.stripe_customer_id,
          payment_method: booking.stripe_payment_method_id,
          confirm: true, off_session: true,
          receipt_email: booking.customer_email,
          description: `SimpleTrailer – Verspätung ${lateHours}h`,
          metadata: { booking_id, type: 'late_fee' }
        });
        lateFeePaymentIntentId = latePi.id;
        lateFeeCharged = true;
      } catch (stripeErr) {
        console.error('Verspätungsaufpreis fehlgeschlagen:', stripeErr.message);
      }
    }

    await supabase.from('bookings').update({
      status: 'returned', actual_return_time: now.toISOString(),
      return_photo_url: photo_url || null,
      late_fee_amount: lateFeeAmount,
      late_fee_payment_intent_id: lateFeePaymentIntentId
    }).eq('id', booking_id);

    await supabase.from('trailers').update({ is_available: true }).eq('id', booking.trailer_id);

    const total = booking.total_amount + lateFeeAmount;
    const bookingRef = booking_id.slice(0, 8).toUpperCase();

    const lateBlock = lateFeeAmount > 0
      ? `<div style="background:#1a0d00;border:1.5px solid #E85D00;border-radius:12px;padding:20px;margin-bottom:20px;">
           <p style="color:#E85D00;font-size:.68rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin:0 0 4px;">Verspätungsaufpreis</p>
           <p style="margin:0 0 4px;font-size:.9rem;">${lateHours} Stunde${lateHours > 1 ? 'n' : ''} × ${lateFeePerHour.toFixed(2)} € = <strong>${lateFeeAmount.toFixed(2)} €</strong></p>
           <p style="color:#888;font-size:.78rem;margin:0;">${lateFeeCharged ? '✓ Automatisch abgebucht.' : '⚠ Automatische Abbuchung fehlgeschlagen. Wir melden uns.'}</p>
         </div>`
      : `<div style="background:#0a1f0a;border:1.5px solid #22c55e;border-radius:12px;padding:16px 20px;margin-bottom:20px;">
           <p style="color:#4ade80;font-weight:700;margin:0;">✓ Pünktlich zurückgegeben – danke!</p>
         </div>`;

    await resend.emails.send({
      from: 'SimpleTrailer <buchung@simpletrailer.de>',
      to: booking.customer_email,
      subject: `Rückgabe bestätigt #${bookingRef} – SimpleTrailer`,
      html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0D0D0D;font-family:system-ui,sans-serif;color:#fff;">
        <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
          <div style="text-align:center;margin-bottom:32px;">
            <span style="font-size:1.5rem;font-weight:800;">Simple</span><span style="font-size:1.5rem;font-weight:800;color:#E85D00;">Trailer</span>
          </div>
          <div style="background:#1A1A1A;border-radius:16px;padding:32px;border:1px solid #383838;">
            <h1 style="margin:0 0 8px;font-size:1.4rem;">Rückgabe bestätigt</h1>
            <p style="color:#888;margin:0 0 24px;">Hallo ${booking.customer_name}, hier deine Abrechnung.</p>
            ${lateBlock}
            <table style="width:100%;border-collapse:collapse;">
              <tr><td style="color:#888;padding:9px 0;border-bottom:1px solid #2a2a2a;font-size:.88rem;">Buchung</td><td style="text-align:right;padding:9px 0;border-bottom:1px solid #2a2a2a;font-size:.88rem;">#${bookingRef}</td></tr>
              <tr><td style="color:#888;padding:9px 0;border-bottom:1px solid #2a2a2a;font-size:.88rem;">Mietbetrag</td><td style="text-align:right;padding:9px 0;border-bottom:1px solid #2a2a2a;font-size:.88rem;">${booking.total_amount.toFixed(2)} €</td></tr>
              ${lateFeeAmount > 0 ? `<tr><td style="color:#888;padding:9px 0;border-bottom:1px solid #2a2a2a;font-size:.88rem;">Verspätung</td><td style="text-align:right;padding:9px 0;border-bottom:1px solid #2a2a2a;color:#E85D00;font-size:.88rem;">+ ${lateFeeAmount.toFixed(2)} €</td></tr>` : ''}
              <tr><td style="color:#888;padding:9px 0;font-size:.88rem;font-weight:700;">Gesamt</td><td style="text-align:right;padding:9px 0;font-weight:800;font-size:1.05rem;">${total.toFixed(2)} €</td></tr>
            </table>
          </div>
          <p style="color:#444;font-size:.72rem;text-align:center;margin-top:24px;">SimpleTrailer · Bremen · info@simpletrailer.de</p>
        </div>
      </body></html>`
    });

    return res.status(200).json({
      success: true, late_hours: lateHours,
      late_fee: lateFeeAmount, late_fee_charged: lateFeeCharged, total
    });

  } catch (err) {
    console.error('process-return:', err);
    return res.status(500).json({ error: err.message });
  }
};
