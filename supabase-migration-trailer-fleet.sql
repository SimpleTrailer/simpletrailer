-- ============================================================
-- SimpleTrailer Migration: Anhänger-Flotten-Verwaltung
-- ============================================================
-- Fügt FESTE Anhänger-Codes (Zahlenschlösser) + zusätzliche
-- Flotten-Daten zu trailers hinzu.
-- (next_tuev_date + next_maintenance_date existieren bereits.)
--
-- Im Supabase SQL Editor ausführen:
--   Dashboard → SQL Editor → New Query → Inhalt einfügen → Run
-- ============================================================

-- 1) Neue Spalten — IF NOT EXISTS macht es idempotent (mehrmals ausführbar)
ALTER TABLE trailers
  ADD COLUMN IF NOT EXISTS access_code      TEXT,
  ADD COLUMN IF NOT EXISTS license_plate    TEXT,
  ADD COLUMN IF NOT EXISTS chassis_number   TEXT,
  ADD COLUMN IF NOT EXISTS insurance_until  DATE,
  ADD COLUMN IF NOT EXISTS purchase_date    DATE,
  ADD COLUMN IF NOT EXISTS internal_notes   TEXT;

-- 2) Index auf access_code (Performance falls Lookups passieren — optional)
CREATE INDEX IF NOT EXISTS idx_trailers_access_code ON trailers(access_code) WHERE access_code IS NOT NULL;

-- 3) Initiale Codes setzen — Anhänger-Namen oder UUIDs anpassen!
-- Wenn Du die Anhänger-Namen kennst:
--   UPDATE trailers SET access_code = '1001' WHERE name ILIKE '%gröpelingen%';
--   UPDATE trailers SET access_code = '1002' WHERE name ILIKE '%woltmershausen%';
--
-- Oder direkt per UUID (sicherer):
--   UPDATE trailers SET access_code = '1001' WHERE id = 'UUID-VON-GRÖPELINGEN';
--   UPDATE trailers SET access_code = '1002' WHERE id = 'UUID-VOM-2.PLANENANHÄNGER';
--
-- Zum Anschauen aller Trailer mit ihren IDs:
--   SELECT id, name, type, access_code, next_tuev_date FROM trailers ORDER BY name;
