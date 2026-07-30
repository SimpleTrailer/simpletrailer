// ─── Temporäre, ZEITBASIERTE Buchungssperre ──────────────────────────────
// Blockiert NUR neue Buchungen, deren Mietbeginn VOR dem Ablaufzeitpunkt liegt,
// und lässt alle Anhänger bis dahin als "belegt · frei ab <Uhrzeit>" anzeigen.
//
// - Läuft AUTOMATISCH ab: nach LOCK_UNTIL ist ohne Code-Änderung/Deploy wieder
//   alles normal.
// - Ändert KEINE Daten in der Datenbank — nichts wird überschrieben.
// - Aufheben/verlängern: einfach LOCK_UNTIL_ISO anpassen (oder auf null setzen).
//
// Aktuell: gesperrt bis Freitag, 24.07.2026 15:00 Uhr (Europe/Berlin, im Juli CEST = UTC+2).
const LOCK_UNTIL_ISO = '2026-07-24T13:00:00.000Z';

function lockUntilMs() {
  if (!LOCK_UNTIL_ISO) return 0;
  const ms = Date.parse(LOCK_UNTIL_ISO);
  return Number.isFinite(ms) ? ms : 0;
}

function isLockActive(now = Date.now()) {
  return lockUntilMs() > now;
}

function lockUntilIso() {
  return LOCK_UNTIL_ISO;
}

module.exports = { isLockActive, lockUntilMs, lockUntilIso, LOCK_UNTIL_ISO };
