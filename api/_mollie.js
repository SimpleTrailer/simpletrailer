/**
 * Gemeinsame Mollie-Anbindung (Underscore-Praefix = kein eigener Endpoint).
 *
 * Wird genutzt von:
 *   - api/create-mollie-payment.js  (Zahlung starten)
 *   - api/mollie-webhook.js         (Zahlung verbindlich pruefen)
 *   - api/booking.js                (Buchung anlegen, Clash-Refund)
 *   - api/process-return.js         (Verspaetungsgebuehr nachbelasten)
 *
 * Bewusst ohne SDK (@mollie/api-client): reines fetch spart eine Dependency
 * und laeuft in Vercel-Serverless ohne Sonderbehandlung.
 */

const MOLLIE_API = 'https://api.mollie.com/v2';

/**
 * Erkennt am ID-Praefix, von welchem Anbieter eine Zahlung stammt.
 * Mollie:  tr_...   (Payment),  cst_... (Customer),  mdt_... (Mandat)
 * Stripe:  pi_...   (PaymentIntent)
 * So brauchen wir KEINE neue DB-Spalte — die bestehenden Felder
 * stripe_payment_intent_id / stripe_customer_id nehmen beide Formate auf.
 */
function isMollieId(id) {
  return typeof id === 'string' && /^(tr|cst|mdt|ord)_/.test(id);
}

async function mollie(path, { method = 'GET', body, idempotencyKey } = {}) {
  const key = process.env.MOLLIE_API_KEY;
  if (!key) throw new Error('MOLLIE_API_KEY fehlt (Vercel-Umgebungsvariable setzen).');

  const headers = {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json'
  };
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

  const r = await fetch(`${MOLLIE_API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  const json = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = json?.detail || json?.title || `Mollie-Fehler (HTTP ${r.status})`;
    const err = new Error(msg);
    err.status = r.status;
    err.mollie = json;
    throw err;
  }
  return json;
}

/** Eine Zahlung abrufen. */
function getPayment(paymentId) {
  return mollie(`/payments/${paymentId}`);
}

/**
 * Ist die Zahlung endgueltig bezahlt UND nicht (teil-)erstattet?
 * Mollie-Status: open | pending | authorized | paid | canceled | expired | failed
 * Nur 'paid' zaehlt als Geld angekommen.
 */
function isPaid(payment) {
  if (!payment || payment.status !== 'paid') return false;
  const refunded = parseFloat(payment.amountRefunded?.value || '0');
  const charged  = parseFloat(payment.amountChargedBack?.value || '0');
  return refunded <= 0 && charged <= 0;
}

/** Betrag als Zahl in Euro (Mollie liefert Strings wie "29.00"). */
function amountEUR(payment) {
  return parseFloat(payment?.amount?.value || '0') || 0;
}

/** Vollstaendige oder teilweise Erstattung. */
function refund(paymentId, { value, description, idempotencyKey } = {}) {
  const body = { description: description || 'SimpleTrailer Erstattung' };
  if (value) body.amount = { currency: 'EUR', value: Number(value).toFixed(2) };
  return mollie(`/payments/${paymentId}/refunds`, { method: 'POST', body, idempotencyKey });
}

/**
 * Gueltiges Mandat eines Kunden holen (fuer Nachbelastung).
 * Gibt das erste Mandat mit status 'valid' zurueck oder null.
 */
async function getValidMandate(customerId) {
  if (!customerId) return null;
  try {
    const res = await mollie(`/customers/${customerId}/mandates?limit=50`);
    const list = res?._embedded?.mandates || [];
    return list.find(m => m.status === 'valid') || null;
  } catch (e) {
    console.error('getValidMandate:', e.message);
    return null;
  }
}

/**
 * Nachbelastung ohne Kundeninteraktion (Verspaetungsgebuehr, Schaden).
 * Voraussetzung: Der Kunde hat bei der Erstzahlung ein Mandat erteilt
 * (sequenceType 'first' in create-mollie-payment.js).
 *
 * WICHTIG: Vor jedem Aufruf muss der Kunde per Mail vorgewarnt worden sein.
 * Unangekuendigte Abbuchungen waren die Ursache der Stripe-Anfechtungen.
 */
async function chargeOffSession({ customerId, amount, description, metadata, idempotencyKey, webhookUrl }) {
  const mandate = await getValidMandate(customerId);
  if (!mandate) {
    const err = new Error('Kein gültiges Mandat vorhanden — Nachbelastung nicht möglich.');
    err.code = 'NO_MANDATE';
    throw err;
  }
  const body = {
    amount:       { currency: 'EUR', value: Number(amount).toFixed(2) },
    description,
    customerId,
    mandateId:    mandate.id,
    sequenceType: 'recurring',
    metadata: metadata || {}
  };
  // Ohne Webhook wuerden wir nie erfahren, ob die Abbuchung am Ende durchging:
  // eine 'recurring'-Zahlung startet immer als 'open' und wird erst danach
  // 'paid' oder 'failed'.
  if (webhookUrl) body.webhookUrl = webhookUrl;

  return mollie('/payments', { method: 'POST', idempotencyKey, body });
}

module.exports = {
  mollie,
  isMollieId,
  getPayment,
  isPaid,
  amountEUR,
  refund,
  getValidMandate,
  chargeOffSession
};
