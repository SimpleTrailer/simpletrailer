// ── Rabattcodes — EINE geteilte Quelle ───────────────────────────────────
// Genutzt von:
//   - api/create-mollie-payment.js  (verbindliche Berechnung + Abzug, Zahlbetrag)
//   - api/validate-discount.js      (Vorab-Prüfung VOR der Führerschein-Verifizierung)
// Beide müssen dieselben Codes/Regeln sehen → deshalb hier zentral.
//
// percent:    Prozent-Rabatt.
// scope:      'total' = auf den Gesamtbetrag (inkl. Schutzpaket/Storno/Free-Floating),
//             'rent'  = NUR auf den Mietpreis — Versicherung & Add-ons bleiben voll.
// validUntil: optionaler letzter gültiger Moment (inkl., Berlin-Zeit). Fehlt = nie ablaufend.
// singleUse:  true = darf nur EINMAL erfolgreich eingelöst werden (Prüfung siehe
//             isRedeemed() — „gibt es schon eine bezahlte Buchung mit diesem Code?").
const DISCOUNT_CODES = {
  WILLKOMMEN20: { percent: 20, scope: 'total', validUntil: '2026-06-25T23:59:59+02:00' },
  URLAUB33:     { percent: 33, scope: 'rent' }, // Urlauber-Rabatt: 33 % nur auf die Miete
  PETER50:      { percent: 50, scope: 'total', validUntil: '2026-12-31T23:59:59+01:00', singleUse: true }, // Persönl. Entschuldigung (Buchung 6b7d5e65, Zahlungsstörung 07.07.) — nur 1×
  ABDULLAH50:   { percent: 50, scope: 'total', validUntil: '2026-12-31T23:59:59+01:00', singleUse: true }, // Dank/Entschuldigung (Buchung 8aeaf6d9, 18.07.: Tracker-Fehlalarm + Bug-Hinweis) — nur 1×
};

function resolveDiscount(raw) {
  const code = String(raw || '').trim().toUpperCase();
  if (!code) return { code: null, percent: 0, scope: 'total' };
  const def = DISCOUNT_CODES[code];
  if (!def) return { error: 'Code ungültig' };
  if (def.validUntil && Date.now() > new Date(def.validUntil).getTime()) return { error: 'Code abgelaufen' };
  return { code, percent: def.percent, scope: def.scope || 'total', singleUse: !!def.singleUse };
}

// Single-Use-Prüfung: true, wenn dieser Code schon zu einer bezahlten Buchung geführt hat.
// Quelle der Wahrheit sind unsere EIGENEN Buchungen (Spalte discount_code) — früher lief
// das über die Stripe-Zahlungssuche, die es bei Mollie so nicht gibt.
//
// WICHTIG — bewusst NICHT fail-open:
// Vorher wurde bei einem DB-Fehler einfach "noch nicht eingelöst" zurückgegeben.
// Da die Spalte discount_code gar nicht existierte, schlug die Abfrage IMMER fehl —
// und Codes wie PETER50/ABDULLAH50 (je 50 % Rabatt) waren unbegrenzt oft nutzbar.
// Bei einem Einmal-Code ist "im Zweifel sperren" richtig: der Kunde bekommt eine
// klare Meldung und kann sich melden, statt dass wir dauerhaft Geld verlieren.
// Für Mehrfach-Codes wird diese Funktion gar nicht erst aufgerufen.
async function isRedeemed(supabase, code) {
  if (!code || !supabase) return false;
  try {
    const { data, error } = await supabase
      .from('bookings')
      .select('id')
      .eq('discount_code', code)
      .in('status', ['confirmed', 'active', 'returned'])
      .limit(1);
    if (error) throw error;
    return !!(data && data.length > 0);
  } catch (e) {
    console.error('Single-Use-Check fehlgeschlagen — Code wird vorsorglich gesperrt:', e.message);
    return true;
  }
}

module.exports = { DISCOUNT_CODES, resolveDiscount, isRedeemed };
