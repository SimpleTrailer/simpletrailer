// ── SimpleTrailer Preis-Engine (RentMyTrailer-Logik) ────────────────────────
// EINE serverseitige Quelle der Wahrheit. booking.html spiegelt diese Logik 1:1
// in JS (calcPrice + daysPrice + stHoursPrice + stTagessatz). Wer hier etwas
// ändert, MUSS booking.html identisch nachziehen (sonst weicht die Anzeige vom
// tatsächlich abgebuchten Betrag ab).
//
// Modell je Anhänger — nur 3 gepflegte Grundwerte, der Rest ist Formel:
//   P_tag1 (Tagespreis, bis 24h)   = trailer.price_day        (z.B. 29)
//   P_2h   (Mindestmiete 2h)       = trailer.price_kurztrip   (z.B. 8)   [Spalte umgewidmet]
//   P_std  (je weitere angef. Std) = trailer.price_halftag  (FEST, z.B. 3,50) — Deckel bei P_tag1 (~7,5h)
//   7-Tage-Paket (Deckel Tag 1–7)  = trailer.price_week        (z.B. 119; 0 = kein Paket)
//   Wochenende (Fr 0–So 24, 3 Tage)= trailer.price_weekend  (FEST, z.B. 59)
//
// Zeitkurve (ein Tag): Mindestmiete 2h immer fällig, dann je angefangene Stunde
// +P_std, ab 8h Tages-Deckel (bei P_2h + 6*P_std = P_tag1 erreicht).
// Mehrtage: degressive Staffel ab Tag 2 (Faktor je Tag relativ zu P_tag1):
//   Tag 2–7:0.60 | 8–14:0.42 | 15–21:0.294 | 22–28:0.2058 | 29–56:0.14406 | ab57:0.100842
// (jede Stufe = 0.7 × vorherige; voll-präzise rechnen, erst am Ende runden)

const WEEKEND_FACTOR = 1.8;
const r2 = n => Math.round(n * 100) / 100;

function tierFactor(day) {
  if (day <= 7)  return 0.60;
  if (day <= 14) return 0.42;
  if (day <= 21) return 0.294;
  if (day <= 28) return 0.2058;
  if (day <= 56) return 0.14406;
  return 0.100842;
}

function priceParams(trailer) {
  const t = trailer || {};
  const pTag1 = Number(t.price_day)      || 29;
  const p2h   = Number(t.price_kurztrip) || 9;
  const pStd  = Number(t.price_halftag)  || 3.50;   // FESTER Stundenpreis (Spalte umgewidmet) — Deckel bei pTag1 (~7,5h)
  const weekPackage = Number(t.price_week) || 0;
  return { pTag1, p2h, pStd, weekPackage };
}

function tagessatz(day, pr) { return r2(pr.pTag1 * tierFactor(day)); }

// Stundentreppe innerhalb eines (Rest-)Tages, gedeckelt auf cap (unrundiert!)
function hoursPrice(h, pr, cap) {
  if (h <= 0) return 0;
  const val = pr.p2h + Math.ceil(Math.max(0, h - 2)) * pr.pStd;
  return Math.min(val, cap);
}

// Preis für D ganze Miettage (>=1), inkl. optionalem 7-Tage-Paket-Deckel
function daysPrice(D, pr) {
  if (D <= 1) return pr.pTag1;
  let sum;
  if (pr.weekPackage > 0 && D >= 7) {
    sum = pr.weekPackage;                       // Tag 1–7 = Paketpreis
    for (let n = 8; n <= D; n++) sum += tagessatz(n, pr);
  } else {
    sum = pr.pTag1;                             // Tag 1
    for (let n = 2; n <= D; n++) sum += tagessatz(n, pr);
  }
  return r2(sum);
}

// Hauptfunktion: Mietpreis (netto Miete, ohne Schutz/Storno/Free-Floating) für Dauer in Stunden
function calcBase(hours, trailer) {
  const pr = priceParams(trailer);
  if (!(hours > 0)) return 0;
  if (hours <= 24) return r2(hoursPrice(hours, pr, pr.pTag1));
  const D = Math.floor(hours / 24);
  const remH = hours - D * 24;
  let sum = daysPrice(D, pr);
  if (remH > 0) sum += hoursPrice(remH, pr, tagessatz(D + 1, pr));
  return r2(sum);
}

function weekendPrice(trailer) {
  const t = trailer || {};
  const fixed = Number(t.price_weekend);           // fester Wochenendpreis (z.B. 59)
  if (fixed > 0) return r2(fixed);
  return r2((Number(t.price_day) || 29) * WEEKEND_FACTOR);
}

// Preis für ein Paket / Schnellwahl-Modus
function packagePrice(mode, trailer) {
  const pr = priceParams(trailer);
  if (mode === 'weekend') return weekendPrice(trailer);
  if (mode === 'week')    return daysPrice(7, pr);
  if (mode === 'day')     return pr.pTag1;
  return null;
}

module.exports = {
  calcBase, daysPrice, weekendPrice, packagePrice, tagessatz, priceParams,
  tierFactor, hoursPrice, WEEKEND_FACTOR, r2,
};
