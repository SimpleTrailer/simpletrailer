/**
 * Storno-Endpoint für Mieter (Self-Service im Kundenkonto)
 *
 * Logik:
 *   - Mit "Kostenlose Stornierung"-Add-On gebucht: 100 % Mietpreis-Refund bis 30 Min vor Mietbeginn
 *     (Add-On-Prämie wird NICHT erstattet)
 *   - Ohne Add-On gebucht: 90 % Storno-Gebühr → 10 % refunded (sehr wenig, motiviert das Add-On)
 *   - Nach Mietbeginn: KEINE Stornierung mehr möglich
 *   - Bereits returned/cancelled: kein Storno mehr
 *
 * Refund läuft über Stripe — wir nutzen die hinterlegte PaymentIntent für den Rückerstattungs-Call.
 */
const { createClient } = require('@supabase/supabase-js');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { Resend } = require('resend');

const supabase     = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const supabaseAuth = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

const fmt = d => new Date(d).toLocaleString('de-DE', {
  day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin'
});

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  // Auth
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Nicht autorisiert' });
  const { data: { user }, error: authErr } = await supabaseAuth.auth.getUser(auth.replace('Bearer ', ''));
  if (authErr || !user) return res.status(401).json({ error: 'Ungültiger Token' });

  try {
    const { booking_id } = req.body || {};
    if (!booking_id) return res.status(400).json({ error: 'booking_id fehlt' });

    // Buchung laden + Ownership prüfen
    const { data: booking, error: bErr } = await supabase
      .from('bookings')
      .select('*, trailers(name)')
      .eq('id', booking_id)
      .single();
    if (bErr || !booking) return res.status(404).json({ error: 'Buchung nicht gefunden' });
    if (booking.user_id !== user.id && booking.customer_email !== user.email) {
      return res.status(403).json({ error: 'Diese Buchung gehört nicht zu deinem Konto.' });
    }

    if (['returned', 'cancelled'].includes(booking.status)) {
      return res.status(400).json({ error: 'Diese Buchung wurde bereits abgeschlossen oder storniert.' });
    }
    if (booking.precheck_completed_at) {
      return res.status(400).json({ error: 'Der Anhänger wurde bereits abgeholt — Stornierung nicht mehr möglich.' });
    }

    const nowMs   = Date.now();
    const startMs = new Date(booking.start_time).getTime();
    const minutesUntilStart = (startMs - nowMs) / 60000;

    // Berechnung der Erstattung
    const hasCp = !!booking.cancellation_protection;
    const cpFee = Number(booking.cancellation_protection_fee || 0);
    const totalPaid = Number(booking.total_amount || 0);
    // Mietpreis ohne Stornoschutz-Add-On
    const baseAmount = totalPaid - cpFee;

    let refundAmount = 0;
    let refundReason = '';

    if (hasCp && minutesUntilStart >= 30) {
      // Add-On greift: voller Mietpreis-Refund, Add-On-Prämie behalten wir
      refundAmount = baseAmount;
      refundReason = 'Kostenlose Stornierung — voller Mietpreis erstattet, Storno-Schutz-Prämie nicht erstattbar';
    } else if (hasCp && minutesUntilStart < 30 && minutesUntilStart > 0) {
      // Add-On Frist abgelaufen → regulärer Storno
      refundAmount = totalPaid * 0.10;
      refundReason = 'Storno innerhalb 30 Min vor Mietbeginn — 90 % Storno-Gebühr (Add-On-Frist abgelaufen)';
    } else if (!hasCp && minutesUntilStart > 0) {
      // Kein Schutz → 90 % Gebühr, 10 % zurück
      refundAmount = totalPaid * 0.10;
      refundReason = 'Reguläre Storno-Gebühr 90 % (kein Add-On gebucht)';
    } else {
      return res.status(400).json({ error: 'Mietbeginn ist erreicht — Stornierung nicht mehr möglich.' });
    }

    // Refund via Stripe ausführen
    let refundId = null;
    if (refundAmount > 0 && booking.stripe_payment_intent_id) {
      try {
        const refund = await stripe.refunds.create({
          payment_intent: booking.stripe_payment_intent_id,
          amount: Math.round(refundAmount * 100),
          reason: 'requested_by_customer',
          metadata: { booking_id: booking.id }
        });
        refundId = refund.id;
      } catch (refundErr) {
        console.error('Stripe-Refund-Fehler:', refundErr.message);
        return res.status(500).json({ error: 'Rückerstattung fehlgeschlagen — bitte info@simpletrailer.de kontaktieren.' });
      }
    }

    // Buchung in DB als cancelled markieren
    await supabase.from('bookings').update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancellation_refund_amount: refundAmount,
      cancellation_refund_id: refundId
    }).eq('id', booking.id);

    // Bestätigungs-Mail an Mieter
    try {
      await resend.emails.send({
        from: 'SimpleTrailer <buchung@simpletrailer.de>',
        reply_to: 'info@simpletrailer.de',
        to: booking.customer_email,
        subject: `Stornierung bestätigt — Buchung #${booking.id.slice(0,8).toUpperCase()}`,
        text: `Deine Buchung wurde storniert.

Buchungsnummer: #${booking.id.slice(0,8).toUpperCase()}
Anhänger: ${booking.trailers?.name || 'PKW-Anhänger'}
Mietbeginn (geplant): ${fmt(booking.start_time)} Uhr
Storno-Grund: ${refundReason}

Gezahlt: ${totalPaid.toFixed(2).replace('.',',')} €
Erstattung: ${refundAmount.toFixed(2).replace('.',',')} €
Erstattung erfolgt automatisch über deine Zahlungsmethode (3-5 Werktage).

— SimpleTrailer GbR
info@simpletrailer.de`,
        html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0D0D0D;font-family:system-ui,sans-serif;color:#fff;">
          <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
            <div style="text-align:center;margin-bottom:24px;">
              <span style="font-size:1.5rem;font-weight:800;">Simple</span><span style="font-size:1.5rem;font-weight:800;color:#E85D00;">Trailer</span>
            </div>
            <div style="background:#1A1A1A;border-radius:16px;padding:30px;border:1px solid #383838;">
              <h1 style="margin:0 0 6px;font-size:1.3rem;">Stornierung bestätigt</h1>
              <p style="color:#888;margin:0 0 22px;">Buchung #${booking.id.slice(0,8).toUpperCase()} · ${booking.trailers?.name || 'Anhänger'}</p>
              <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
                <tr><td style="color:#888;padding:7px 0;border-bottom:1px solid #2a2a2a;font-size:.86rem;">Mietbeginn (geplant)</td><td style="text-align:right;padding:7px 0;border-bottom:1px solid #2a2a2a;font-size:.86rem;">${fmt(booking.start_time)}</td></tr>
                <tr><td style="color:#888;padding:7px 0;border-bottom:1px solid #2a2a2a;font-size:.86rem;">Gezahlt</td><td style="text-align:right;padding:7px 0;border-bottom:1px solid #2a2a2a;font-size:.86rem;">${totalPaid.toFixed(2).replace('.',',')} €</td></tr>
                <tr><td style="color:#888;padding:7px 0;font-size:.86rem;">Erstattung</td><td style="text-align:right;padding:7px 0;color:#22c55e;font-weight:700;font-size:1rem;">${refundAmount.toFixed(2).replace('.',',')} €</td></tr>
              </table>
              <div style="background:#0a1f0a;border:1px solid #22c55e;border-radius:10px;padding:14px 18px;color:#86efac;font-size:.84rem;">
                ${refundReason}<br><br>
                Die Erstattung wird automatisch auf deine Zahlungsmethode zurückgebucht (3-5 Werktage).
              </div>
              <p style="color:#666;font-size:.78rem;margin:18px 0 0;line-height:1.5;text-align:center;">
                Fragen? Antworte auf diese Mail oder schreib an info@simpletrailer.de.
              </p>
            </div>
          </div>
        </body></html>`
      });
    } catch (mailErr) {
      console.error('Storno-Mail fehlgeschlagen:', mailErr.message);
    }

    return res.status(200).json({
      ok: true,
      refund_amount: refundAmount,
      refund_reason: refundReason,
      refund_id: refundId
    });

  } catch (err) {
    console.error('cancel-booking:', err);
    return res.status(500).json({ error: err.message });
  }
};
