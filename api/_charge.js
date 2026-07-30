/**
 * Anbieter-neutrale Nachbelastung + Erstattung (Underscore = kein eigener Endpoint).
 *
 * Warum diese Datei existiert:
 * Verspaetungsgebuehr, Rueckgabe-Aufpreis und Verlaengerung wurden frueher ueber
 * Stripe off_session abgebucht. Seit dem Wechsel auf Mollie laeuft das ueber ein
 * Mandat (sequenceType 'recurring'). Damit process-return.js, extend-booking.js,
 * cancel-booking.js und admin.js nicht jeweils eigene Weichen brauchen, liegt die
 * Logik hier an EINER Stelle.
 *
 * Erkennung: die Spalten heissen historisch stripe_* , enthalten aber je nach
 * Buchungsalter Stripe-IDs (pi_/cus_) oder Mollie-IDs (tr_/cst_).
 *
 * ALT-BUCHUNGEN (Stripe): Das Stripe-Konto ist seit 26.07.2026 geschlossen.
 * Gespeicherte Zahlungsmittel sind tot, Erstattungen laufen nicht mehr durch.
 * Deshalb wird gar nicht erst versucht zu buchen — stattdessen kommt sofort ein
 * sprechender Fehler, damit die Aufrufer ihre bestehende Alarm-Mail an Lion
 * ausloesen und er den Betrag von Hand einzieht bzw. ueberweist.
 */

const {
  isMollieId,
  chargeOffSession,
  refund: mollieRefund,
  getPayment: getMolliePayment
} = require('./_mollie');

const SITE_URL = process.env.SITE_URL || 'https://www.simpletrailer.de';

const STRIPE_DEAD =
  'Alt-Buchung über Stripe — das Konto ist geschlossen, automatische Abbuchung/Erstattung nicht mehr möglich.';

/**
 * Nachbelastung auf die hinterlegte Zahlungsmethode.
 *
 * Wirft NIE — gibt immer ein Ergebnisobjekt zurueck, damit die Aufrufer den
 * bestehenden "hat geklappt / hat nicht geklappt"-Zweig unveraendert behalten.
 *
 * WICHTIG zum Rueckgabewert:
 * Mollie bestaetigt eine Nachbelastung nicht sofort — die Zahlung startet als
 * 'open' und wird erst danach 'paid' oder 'failed'. `ok: true` heisst deshalb
 * "erfolgreich angestossen", nicht "Geld ist da". Den Endstatus meldet der
 * Webhook (api/mollie-webhook.js, Zweig metadata.type).
 *
 * @param {object}  booking  Buchungszeile (braucht stripe_customer_id + id)
 * @param {number}  amount   Betrag in Euro
 * @param {string}  type     'late_fee' | 'return_extra_fee' | 'extension' | 'damage'
 * @returns {{ok: boolean, id: string|null, provider: string, status: string|null, error: string|null}}
 */
async function chargeStored({ booking, amount, type, description, extraMetadata, occasion }) {
  const customerId = booking?.stripe_customer_id || null;
  const value = Math.round(Number(amount) * 100) / 100;
  // Anlass-Kennung fuer den Idempotenz-Schluessel (siehe unten). Fehlt sie, wird
  // die Buchungs-Endzeit genutzt — die aendert sich bei jeder Verlaengerung und
  // ist damit ein brauchbarer Standard-Unterscheider.
  occasion = String(occasion || (booking && booking.end_time) || 'x').replace(/[^0-9A-Za-z]/g, '').slice(-14);

  if (!(value > 0)) {
    return { ok: false, id: null, provider: 'none', status: null, error: 'Betrag ist 0 oder ungültig.' };
  }
  if (!customerId) {
    return { ok: false, id: null, provider: 'none', status: null, error: 'Keine Zahlungsmethode hinterlegt.' };
  }
  if (!isMollieId(customerId)) {
    return { ok: false, id: null, provider: 'stripe', status: null, error: STRIPE_DEAD };
  }

  try {
    const payment = await chargeOffSession({
      customerId,
      amount: value,
      description: description || `SimpleTrailer – ${type}`,
      // Mollie-Metadata max. 1 kB — nur was der Webhook wirklich braucht.
      metadata: { booking_id: String(booking.id), type, ...(extraMetadata || {}) },
      webhookUrl: `${SITE_URL}/api/mollie-webhook`,
      // Idempotenz-Schluessel: gleicher Anlass => gleiche Zahlung (schuetzt vor
      // Doppelabbuchung bei Retry/Doppelklick).
      //
      // ACHTUNG, hier steckte ein teurer Fehler: ohne `occasion` bestand der Key
      // nur aus Buchung + Anlass-Typ + Betrag. Zwei getrennte Verlaengerungen um
      // je 3 h haetten damit denselben Key gehabt — Mollie haette die zweite als
      // Wiederholung der ersten behandelt, NICHT abgebucht, und der Mieter haette
      // 6 h zum Preis von 3 h bekommen. Aufrufer, bei denen derselbe Anlass
      // mehrfach vorkommen kann, MUESSEN daher `occasion` mitgeben (z.B. die alte
      // Endzeit bei einer Verlaengerung).
      idempotencyKey: `chg-${type}-${booking.id}-${occasion}-${value.toFixed(2)}`
    });
    return {
      ok: payment.status !== 'failed',
      id: payment.id,
      provider: 'mollie',
      status: payment.status,
      error: payment.status === 'failed' ? 'Zahlung von der Bank abgelehnt.' : null
    };
  } catch (e) {
    return {
      ok: false,
      id: null,
      provider: 'mollie',
      status: null,
      error: e.code === 'NO_MANDATE'
        ? 'Kein gültiges Zahlungs-Mandat — der Kunde muss den Betrag per Zahlungslink begleichen.'
        : (e.message || 'Nachbelastung fehlgeschlagen.')
    };
  }
}

/**
 * Erstattung einer Buchungszahlung (Storno, Kulanz, Double-Booking).
 * Wirft NIE — Ergebnisobjekt wie bei chargeStored().
 *
 * @param {string}  paymentRef  Inhalt von bookings.stripe_payment_intent_id
 * @param {number}  amount      Betrag in Euro; weglassen = volle Erstattung
 */
async function refundPayment(paymentRef, { amount, description, idempotencyKey } = {}) {
  if (!paymentRef) {
    return { ok: false, id: null, provider: 'none', error: 'Keine Zahlung hinterlegt.' };
  }
  if (!isMollieId(paymentRef)) {
    return { ok: false, id: null, provider: 'stripe', error: STRIPE_DEAD };
  }
  try {
    const r = await mollieRefund(paymentRef, {
      value: amount,
      description: description || 'SimpleTrailer Erstattung',
      idempotencyKey: idempotencyKey || `rf-${paymentRef}-${amount ? Number(amount).toFixed(2) : 'full'}`
    });
    return { ok: true, id: r.id, provider: 'mollie', error: null };
  } catch (e) {
    return { ok: false, id: null, provider: 'mollie', error: e.message || 'Erstattung fehlgeschlagen.' };
  }
}

/**
 * Wie viel wurde auf diese Zahlung bereits erstattet? (Schutz vor Doppel-Erstattung)
 * Gibt null zurueck, wenn es sich nicht ermitteln laesst.
 */
async function refundedSoFar(paymentRef) {
  if (!paymentRef || !isMollieId(paymentRef)) return null;
  try {
    const p = await getMolliePayment(paymentRef);
    return {
      paid:     parseFloat(p.amount?.value || '0') || 0,
      refunded: parseFloat(p.amountRefunded?.value || '0') || 0,
      status:   p.status,
      method:   p.method || null
    };
  } catch (e) {
    console.error('refundedSoFar:', e.message);
    return null;
  }
}

/** Anzeige-Name des Anbieters zu einer gespeicherten ID (fuer Mails/Admin). */
function providerLabel(ref) {
  if (!ref) return 'unbekannt';
  return isMollieId(ref) ? 'Mollie' : 'Stripe (Alt-Buchung)';
}

module.exports = { chargeStored, refundPayment, refundedSoFar, providerLabel, STRIPE_DEAD };
