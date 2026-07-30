/**
 * Mollie-Webhook — die EINZIGE verbindliche Quelle fuer den Zahlungsstatus.
 *
 * Wie Mollie-Webhooks funktionieren (anders als bei Stripe!):
 *  - Mollie schickt NUR die Payment-ID im Body (`id=tr_...`), keine Zahlungsdaten.
 *  - Wir muessen die Zahlung selbst per API abrufen. Genau das ist die Absicherung:
 *    ein gefaelschter Webhook-Aufruf bringt nichts, weil der echte Status immer
 *    frisch bei Mollie geholt wird. Deshalb braucht es hier auch keine Signatur.
 *  - Mollie erwartet HTTP 200. Bei allem anderen wird der Webhook wiederholt.
 *    -> Bei internen Fehlern geben wir bewusst 500 zurueck, damit Mollie es
 *       erneut versucht. Bei "nicht bezahlt" geben wir 200 (nichts zu tun).
 *
 * Aufgaben:
 *  1. Zahlung verifizieren
 *  2. Buchung anlegen (ueber den bestehenden /api/booking-Endpoint, damit
 *     Mails, PDFs und Double-Booking-Schutz identisch bleiben)
 *  3. Bereits angelegte Buchung auf 'confirmed' setzen
 *  4. Rueckbuchungen (Chargebacks) sichtbar machen
 */

const { createClient } = require('@supabase/supabase-js');
const { getPayment, isPaid } = require('./_mollie');
const { Resend } = require('resend');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const resend   = new Resend(process.env.RESEND_API_KEY);
const SITE_URL = process.env.SITE_URL || 'https://www.simpletrailer.de';

// Zahlungen, die KEINE Buchung erzeugen, sondern eine Nachbelastung sind (api/_charge.js).
const CHARGE_TYPES = ['late_fee', 'return_extra_fee', 'extension', 'damage'];
const CHARGE_LABELS = {
  late_fee:         'Verspätungsgebühr',
  return_extra_fee: 'Rückgabe-Aufpreis',
  extension:        'Verlängerung',
  damage:           'Schadensersatz'
};

/**
 * Endstatus einer Nachbelastung verarbeiten.
 * Eine 'recurring'-Zahlung startet als 'open' — erst hier steht fest, ob das Geld
 * wirklich kam. Bei Fehlschlag muss Lion es erfahren, sonst bleibt die Forderung
 * unbemerkt offen.
 */
async function handleChargeResult(payment) {
  const meta      = payment.metadata || {};
  const type      = meta.type;
  const bookingId = meta.booking_id;
  const label     = CHARGE_LABELS[type] || type;
  const value     = parseFloat(payment.amount?.value || '0') || 0;
  const ref       = bookingId ? `#${String(bookingId).slice(0, 8).toUpperCase()}` : '(ohne Buchung)';

  // ── Rueckbuchung auf eine Nachbelastung ──────────────────────────────────
  // MUSS vor der 'paid'-Pruefung stehen: eine zurueckgebuchte Zahlung hat
  // weiterhin status 'paid'. Ohne diesen Zweig gilt die Forderung intern als
  // bezahlt, Lion erfaehrt nichts, und die Rueckbuchung zaehlt still gegen die
  // Quote — genau das Muster, das das Stripe-Konto gekostet hat.
  const chargedBack = parseFloat(payment.amountChargedBack?.value || '0') > 0;
  if (chargedBack) {
    console.warn(`mollie-webhook: RUECKBUCHUNG auf ${label} ${ref} (${payment.id}).`);
    try {
      await resend.emails.send({
        from: 'SimpleTrailer <buchung@simpletrailer.de>',
        reply_to: 'info@simpletrailer.de',
        to: 'info@simpletrailer.de',
        subject: `🚨 RÜCKBUCHUNG auf ${label}: ${value.toFixed(2)} € — ${ref}`,
        text: `Eine bereits eingezogene Nachbelastung wurde vom Kunden zurückgebucht.\n\nAnlass:  ${label}\nBetrag:  ${value.toFixed(2)} €\nBuchung: ${ref}\nZahlung: ${payment.id}\n\nAnsehen: https://my.mollie.com/dashboard/payments/${payment.id}\n\nWICHTIG: Rückbuchung NICHT akzeptieren. Entweder mit Beweisen bestreiten (Mietvertrag, Rückgabe-Protokoll, Fotos, GPS) oder von dir aus erstatten — akzeptieren zählt als verloren und belastet die Quote.`
      });
    } catch (e) { console.error('mollie-webhook: Chargeback-Mail (Nachbelastung):', e.message); }
    return;
  }

  if (payment.status === 'paid') {
    console.log(`mollie-webhook: ${label} ${value.toFixed(2)} € für ${ref} eingezogen.`);
    return;
  }
  if (!['failed', 'canceled', 'expired'].includes(payment.status)) return;   // noch unterwegs

  console.error(`mollie-webhook: ${label} für ${ref} FEHLGESCHLAGEN (${payment.status}).`);

  // Als offene Forderung markieren, damit sie im Admin auffällt.
  // Fuer late_fee gibt es eine eigene Spalte; alle anderen Anlaesse landen im
  // Notizfeld, damit sie nicht nur in einer einzelnen Mail existieren.
  if (bookingId) {
    try {
      if (type === 'late_fee') {
        await supabase.from('bookings')
          .update({ late_fee_payment_intent_id: 'FAILED:offsession' })
          .eq('id', bookingId);
      } else {
        const note = `OFFEN: ${label} ${value.toFixed(2)} EUR nicht eingezogen (${payment.id}, ${new Date().toISOString().slice(0,10)})`;
        const { error } = await supabase.from('bookings')
          .update({ admin_note: note })
          .eq('id', bookingId);
        // Spalte fehlt? Dann bleibt es bei der Mail — nicht den Webhook killen.
        if (error) console.warn('mollie-webhook: admin_note nicht schreibbar:', error.message);
      }
    } catch (e) { console.error('mollie-webhook: Markieren fehlgeschlagen:', e.message); }
  }

  try {
    await resend.emails.send({
      from: 'SimpleTrailer <buchung@simpletrailer.de>',
      reply_to: 'info@simpletrailer.de',
      to: 'info@simpletrailer.de',
      subject: `⚠ OFFENE FORDERUNG: ${value.toFixed(2)} € ${label} NICHT eingezogen — ${ref}`,
      text: `Die Nachbelastung wurde zwar angestoßen, ist bei der Bank aber endgültig fehlgeschlagen.\n\nAnlass:  ${label}\nBetrag:  ${value.toFixed(2)} €\nBuchung: ${ref}\nStatus:  ${payment.status}\nZahlung: ${payment.id}\n\nEinziehen: Mollie-Dashboard → Zahlungslinks → ${value.toFixed(2)} € → Link an den Mieter schicken.`
    });
  } catch (e) { console.error('mollie-webhook: Alarm-Mail fehlgeschlagen:', e.message); }
}

module.exports = async (req, res) => {
  // Mollie ruft ausschliesslich per POST mit application/x-www-form-urlencoded auf.
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  // Vercel parst den Body je nach Content-Type unterschiedlich — beide Faelle abdecken.
  let paymentId = req.body?.id;
  if (!paymentId && typeof req.body === 'string') {
    paymentId = new URLSearchParams(req.body).get('id');
  }
  if (!paymentId) {
    console.error('mollie-webhook: keine Payment-ID im Body', typeof req.body);
    return res.status(200).send('ok'); // kein Retry — der Aufruf ist unbrauchbar
  }

  try {
    // Status IMMER frisch bei Mollie holen (siehe Kopfkommentar).
    const payment = await getPayment(paymentId);
    const status  = payment.status;

    console.log(`mollie-webhook: ${paymentId} -> ${status}`);

    // ── Nachbelastung (Verspaetung, Aufpreis, Verlaengerung) ─────────────────
    // Diese Zahlungen gehoeren zu einer BESTEHENDEN Buchung — hier darf auf
    // keinen Fall eine neue angelegt werden.
    if (CHARGE_TYPES.includes(payment.metadata?.type)) {
      await handleChargeResult(payment);
      return res.status(200).send('ok');
    }

    // ── Rueckbuchung/Erstattung: Buchung markieren, Lion informieren ──────────
    const refunded    = parseFloat(payment.amountRefunded?.value || '0') > 0;
    const chargedBack = parseFloat(payment.amountChargedBack?.value || '0') > 0;
    if (chargedBack) {
      // NICHT status='disputed' setzen: der CHECK-Constraint auf bookings.status
      // kennt den Wert nicht, das Update scheitert still und die Rueckbuchung
      // bliebe unsichtbar. Eigene Spalten, und der Fehler wird ausgewertet.
      const { error: cbErr } = await supabase.from('bookings')
        .update({
          chargeback_at: new Date().toISOString(),
          chargeback_amount: parseFloat(payment.amountChargedBack?.value || '0') || null
        })
        .eq('stripe_payment_intent_id', paymentId);
      if (cbErr) console.error('mollie-webhook: Rueckbuchung nicht markierbar:', cbErr.message);
      console.warn(`⚠ Rueckbuchung bei ${paymentId} vermerkt.`);
      // Rueckbuchungen haben das Stripe-Konto gekostet — hier darf nichts unbemerkt bleiben.
      // Merke: NIE akzeptieren, sondern selbst erstatten oder mit Beweisen bestreiten.
      try {
        await resend.emails.send({
          from: 'SimpleTrailer <buchung@simpletrailer.de>',
          reply_to: 'info@simpletrailer.de',
          to: 'info@simpletrailer.de',
          subject: `🚨 RÜCKBUCHUNG (Chargeback) — ${paymentId}`,
          text: `Ein Kunde hat eine Zahlung zurückgebucht.\n\nZahlung: ${paymentId}\nBetrag:  ${payment.amount?.value || '?'} €\nKunde:   ${payment.metadata?.customer_email || 'unbekannt'}\n\nSOFORT ANSEHEN: https://my.mollie.com/dashboard/payments/${paymentId}\n\nWICHTIG: Rückbuchung NICHT einfach akzeptieren. Entweder mit Beweisen (Mietvertrag, Fotos, Protokoll) bestreiten oder von dir aus erstatten — akzeptieren zählt als verloren und belastet die Quote.`
        });
      } catch (e) { console.error('mollie-webhook: Chargeback-Mail fehlgeschlagen:', e.message); }
      return res.status(200).send('ok');
    }

    // ── Nicht (mehr) bezahlt: nichts anlegen ─────────────────────────────────
    if (!isPaid(payment)) {
      // canceled / expired / failed sind Endzustaende — die pending-Buchung
      // (falls vorhanden) bleibt einfach liegen und laeuft nie auf 'confirmed'.
      if (['canceled', 'expired', 'failed'].includes(status)) {
        await supabase.from('bookings')
          .update({ status: 'cancelled' })
          .eq('stripe_payment_intent_id', paymentId)
          .eq('status', 'pending');
      }
      if (refunded) {
        console.warn(`mollie-webhook: ${paymentId} ist erstattet — keine Buchung.`);
      }
      return res.status(200).send('ok');
    }

    // ── Bezahlt ──────────────────────────────────────────────────────────────
    // 1) Existiert die Buchung schon? Dann nur bestaetigen.
    const { data: row } = await supabase
      .from('bookings')
      .select('id, status')
      .eq('stripe_payment_intent_id', paymentId)
      .maybeSingle();

    if (row) {
      if (row.status === 'pending') {
        await supabase.from('bookings')
          .update({ status: 'confirmed' })
          .eq('id', row.id);
        console.log(`mollie-webhook: Buchung ${row.id} bestaetigt.`);
      }
      return res.status(200).send('ok');
    }

    // 2) Noch keine Buchung -> ueber den bestehenden Endpoint anlegen.
    //    Wichtig: /api/booking ist idempotent. Falls der Browser des Kunden
    //    parallel dieselbe Buchung anlegt, gewinnt einer und der andere
    //    bekommt die bestehende zurueck.
    const r = await fetch(`${SITE_URL}/api/booking`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mollie_payment_id: paymentId })
    });

    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      // 409 = Double-Booking abgefangen (Kunde wurde erstattet + informiert).
      // Das ist ein erledigter Vorgang, kein Fehler -> kein Mollie-Retry.
      if (r.status === 409) {
        console.warn(`mollie-webhook: ${paymentId} Double-Booking, bereits behandelt.`);
        return res.status(200).send('ok');
      }
      // Alles andere: 500 zurueckgeben, damit Mollie es erneut versucht.
      console.error(`mollie-webhook: /api/booking fehlgeschlagen (${r.status}):`, txt.slice(0, 300));
      return res.status(500).send('booking failed');
    }

    console.log(`mollie-webhook: Buchung fuer ${paymentId} angelegt.`);
    return res.status(200).send('ok');

  } catch (err) {
    console.error('mollie-webhook:', err.message, err.mollie || '');
    // 500 -> Mollie wiederholt den Webhook (mehrfach, ueber Stunden verteilt).
    return res.status(500).send('error');
  }
};
