-- ===========================================================================
--  Sperrzeiten pro Anhänger  (einmalig im Supabase SQL-Editor ausführen)
-- ===========================================================================
--
--  WOFÜR: Ein Anhänger soll für einen BESTIMMTEN Zeitraum als belegt gelten —
--  Wartung, TÜV, Reparatur, Eigenbedarf, Urlaub. Bisher gab es dafür nur den
--  Schalter "Für Buchung sperren", der den Anhänger komplett aus dem Angebot
--  nimmt, bis man ihn wieder freigibt.
--
--  WARUM EINE EIGENE TABELLE und keine Pseudo-Buchung: Eine Sperre als Buchung
--  einzutragen wäre schneller gebaut, würde aber Umsatz, Kundenwert, Statistik
--  und den CSV-Export verfälschen — und im Buchungs-Tab stünde eine Buchung
--  ohne Kunden. Sperren sind etwas anderes als Vermietungen und gehören
--  getrennt.
--
--  Gelesen wird die Tabelle von:
--    api/_trailer-blocks.js        (gemeinsame Lade-Schicht)
--    api/get-availability.js       (Kalender + Stunden-Raster im Buchungsflow)
--    api/get-trailers.js           (Karte: "belegt · frei ab")
--    api/create-mollie-payment.js  (verbindliche Prüfung vor der Zahlung)
--    api/admin.js                  (anlegen, auflisten, löschen)
--
--  Der Code läuft auch OHNE diese Tabelle weiter (dann gibt es schlicht keine
--  Sperrzeiten) — die Lade-Schicht fängt den Fehler ab. Deshalb ist die
--  Reihenfolge Deploy → Migration unkritisch.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS trailer_blocks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trailer_id  UUID NOT NULL REFERENCES trailers(id) ON DELETE CASCADE,
  start_time  TIMESTAMPTZ NOT NULL,
  end_time    TIMESTAMPTZ NOT NULL,
  reason      TEXT,
  created_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Ein Zeitraum, der rückwärts läuft, würde in jeder Overlap-Rechnung
  -- unentdeckt danebenliegen. Deshalb hier hart ausschliessen.
  CONSTRAINT trailer_blocks_zeitraum CHECK (end_time > start_time)
);

-- Jede Abfrage geht über trailer_id + Zeitraum.
CREATE INDEX IF NOT EXISTS trailer_blocks_trailer_zeit_idx
  ON trailer_blocks (trailer_id, start_time, end_time);

-- Zugriff ausschliesslich serverseitig mit dem Service-Key. RLS an, absichtlich
-- OHNE Policy: damit kommt der öffentliche Anon-Key nicht an die Tabelle, der
-- Service-Key umgeht RLS ohnehin.
ALTER TABLE trailer_blocks ENABLE ROW LEVEL SECURITY;

-- Kontrolle nach dem Ausführen:
--   SELECT * FROM trailer_blocks ORDER BY start_time;
