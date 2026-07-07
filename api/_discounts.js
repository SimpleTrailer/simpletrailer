// ── Rabattcodes — EINE geteilte Quelle ───────────────────────────────────
// Genutzt von:
//   - api/create-payment-intent.js  (verbindliche Berechnung + Abzug, Stripe-Betrag)
//   - api/validate-discount.js      (Vorab-Prüfung VOR der Führerschein-Verifizierung)
// Beide müssen dieselben Codes/Regeln sehen → deshalb hier zentral.
//
// percent:    Prozent-Rabatt.
// scope:      'total' = auf den Gesamtbetrag (inkl. Schutzpaket/Storno/Free-Floating),
//             'rent'  = NUR auf den Mietpreis — Versicherung & Add-ons bleiben voll.
// validUntil: optionaler letzter gültiger Moment (inkl., Berlin-Zeit). Fehlt = nie ablaufend.
// singleUse:  true = darf nur EINMAL erfolgreich eingelöst werden (Prüfung via Stripe,
//             siehe isRedeemed() — „gibt es schon eine erfolgreiche Zahlung mit diesem Code?").
const DISCOUNT_CODES = {
  WILLKOMMEN20: { percent: 20, scope: 'total', validUntil: '2026-06-25T23:59:59+02:00' },
  URLAUB33:     { percent: 33, scope: 'rent' }, // Urlauber-Rabatt: 33 % nur auf die Miete
  PETER50:      { percent: 50, scope: 'total', validUntil: '2026-12-31T23:59:59+01:00', singleUse: true }, // Persönl. Entschuldigung (Buchung 6b7d5e65, Zahlungsstörung 07.07.) — nur 1×
};

function resolveDiscount(raw) {
  const code = String(raw || '').trim().toUpperCase();
  if (!code) return { code: null, percent: 0, scope: 'total' };
  const def = DISCOUNT_CODES[code];
  if (!def) return { error: 'Code ungültig' };
  if (def.validUntil && Date.now() > new Date(def.validUntil).getTime()) return { error: 'Code abgelaufen' };
  return { code, percent: def.percent, scope: def.scope || 'total', singleUse: !!def.singleUse };
}

// Single-Use-Prüfung: true, wenn dieser Code schon eine ERFOLGREICHE Zahlung ausgelöst hat.
// Quelle der Wahrheit = Stripe (Payment-Intent-Metadaten discount_code). Kein DB-Tisch nötig.
// Fail-open: Wenn die Stripe-Suche fehlschlägt, NICHT blockieren (kein echter Kunde soll
// wegen eines Such-Glitches steckenbleiben; Risiko bei persönlichem Kleinbetrags-Code minimal).
async function isRedeemed(stripe, code) {
  if (!code) return false;
  try {
    const r = await stripe.paymentIntents.search({
      query: `status:'succeeded' AND metadata['discount_code']:'${code}'`,
      limit: 1,
    });
    return !!(r && r.data && r.data.length > 0);
  } catch (e) {
    console.error('Single-Use-Check fehlgeschlagen (fail-open):', e.message);
    return false;
  }
}

module.exports = { DISCOUNT_CODES, resolveDiscount, isRedeemed };
