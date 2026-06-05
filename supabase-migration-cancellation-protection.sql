-- ============================================================
-- SimpleTrailer Migration: Stornoschutz als optionales Add-On
-- ============================================================
-- Speichert ob der Mieter den Stornoschutz dazugebucht hat und
-- in welcher Höhe (10% vom Mietpreis, min. 3,00 €).
--
-- Im Supabase SQL Editor ausführen:
--   Dashboard → SQL Editor → New Query → Inhalt einfügen → Run
-- ============================================================

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS cancellation_protection     BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS cancellation_protection_fee NUMERIC(10,2) DEFAULT 0;

-- Bestehende Buchungen: kein Schutz (FALSE), Gebühr 0 — bleibt so.
