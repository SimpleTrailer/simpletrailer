/**
 * Storno-Endpoint für Mieter (Self-Service im Kundenkonto)
 *
 * Logik:
 *   - Mit "Kostenlose Stornierung"-Add-On gebucht: 100 % Mietpreis-Refund bis ZUM Buchungsbeginn
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
const { setCors } = require('./_cors');

const supabase     = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const supabaseAuth = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);
const T = require('./_email-template');

const fmt = d => new Date(d).toLocaleString('de-DE', {
  day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin'
});

module.exports = async (req, res) => {
  setCors(req, res);
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

    if (hasCp && minutesUntilStart > 0) {
      // Add-On greift: voller Mietpreis-Refund bis zum Mietbeginn, Add-On-Pramie behalten wir
      refundAmount = baseAmount;
      refundReason = 'Kostenlose Stornierung — voller Mietpreis erstattet, Storno-Schutz-Prämie nicht erstattbar';
    } else if (!hasCp && minutesUntilStart > 0) {
      // Kein Schutz → 90 % Gebühr, 10 % zurück
      refundAmount = totalPaid * 0.10;
      refundReason = 'Reguläre Storno-Gebühr 90 % (kein Add-On gebucht)';
    } else {
      return res.status(400).json({ error: 'Mietbeginn ist erreicht — Stornierung nicht mehr möglich.' });
    }

    // Atomic Concurrency-Lock OHNE Schema-Erweiterung:
    // Wir setzen cancelled_at NUR wenn es noch NULL ist. Bei parallelen Klicks
    // gewinnt nur einer (rowcount=1), der andere bekommt rowcount=0 + 409.
    // Status bleibt vorerst confirmed/active — erst nach Refund-Erfolg auf 'cancelled'.
    const lockTs = new Date().toISOString();
    const { data: locked, error: lockErr } = await supabase
      .from('bookings')
      .update({ cancelled_at: lockTs })
      .eq('id', booking.id)
      .is('cancelled_at', null)
      .select('id')
      .maybeSingle();
    if (lockErr || !locked) {
      return res.status(409).json({ error: 'Stornierung läuft bereits oder ist bereits abgeschlossen.' });
    }

    // Wenn Refund fällig wäre aber kein PaymentIntent vorhanden ist (z.B. Legacy/Test-Buchungen):
    // explizit fehlerschlagen + Lock zurücksetzen, statt stillem Skip → User würde sonst denken
    // er hätte Storno bekommen ohne dass Geld zurück fließt.
    if (refundAmount > 0 && !booking.stripe_payment_intent_id) {
      await supabase.from('bookings').update({ cancelled_at: null }).eq('id', booking.id);
      console.error('Cancel ohne PaymentIntent', { booking_id: booking.id, refund_amount: refundAmount });
      return res.status(500).json({ error: 'Buchung ohne hinterlegte Zahlung — Storno bitte bei info@simpletrailer.de anfragen.' });
    }

    // Refund via Stripe — Idempotency-Key gegen Doppel-Refund auch bei Stripe-Retries
    let refundId = null;
    if (refundAmount > 0 && booking.stripe_payment_intent_id) {
      try {
        const refund = await stripe.refunds.create({
          payment_intent: booking.stripe_payment_intent_id,
          amount: Math.round(refundAmount * 100),
          reason: 'requested_by_customer',
          metadata: { booking_id: booking.id }
        }, { idempotencyKey: `refund-${booking.id}` });
        refundId = refund.id;
      } catch (refundErr) {
        // Lock zurücksetzen damit der User retryen kann
        await supabase.from('bookings').update({ cancelled_at: null }).eq('id', booking.id);
        console.error('Stripe-Refund-Fehler', {
          code: refundErr.code, type: refundErr.type, booking_id: booking.id
        });
        return res.status(500).json({ error: 'Rückerstattung fehlgeschlagen — bitte info@simpletrailer.de kontaktieren.' });
      }
    }

    // Finaler Status-Update — Fehler MUSS gefangen werden sonst hängt Buchung im Limbo
    const { error: finalErr } = await supabase.from('bookings').update({
      status: 'cancelled',
      cancellation_refund_amount: refundAmount,
      cancellation_refund_id: refundId
    }).eq('id', booking.id);
    if (finalErr) {
      // Refund ist schon gemacht — wir loggen CRITICAL aber lassen den User-Flow durch,
      // weil das Geld ist zurück. Status wird per Hand nachgepflegt.
      console.error('CRITICAL: cancel final status update failed', {
        booking_id: booking.id, refund_id: refundId, err: finalErr.message
      });
    }

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
        html: T.layout({
          heading: 'Stornierung bestätigt',
          preheader: `Buchung #${booking.id.slice(0,8).toUpperCase()} storniert`,
          replyNote: 'Fragen? Antworte auf diese Mail oder schreib an info@simpletrailer.de.',
          bodyHtml:
            T.p(`Buchung <strong>#${booking.id.slice(0,8).toUpperCase()}</strong> · ${T.esc(booking.trailers?.name || 'Anhänger')}`) +
            T.rows([
              ['Mietbeginn (geplant)', fmt(booking.start_time)],
              ['Gezahlt', `${totalPaid.toFixed(2).replace('.',',')} €`],
              ['Erstattung', refundAmount > 0 ? `<span style="color:#15803D;font-weight:700;">${refundAmount.toFixed(2).replace('.',',')} €</span>` : 'Keine Erstattung']
            ]) +
            T.callout(`${T.esc(refundReason)}<br><br>Die Erstattung wird automatisch auf deine Zahlungsmethode zurückgebucht (3–5 Werktage).`, 'green')
        })
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
