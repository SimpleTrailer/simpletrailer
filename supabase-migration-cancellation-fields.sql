-- ============================================================
-- SimpleTrailer Migration: Storno-Tracking-Felder
-- ============================================================
-- Speichert wann + wie viel beim Storno erstattet wurde,
-- damit der Verlauf im Kundenkonto + Admin sichtbar bleibt.
--
-- Im Supabase SQL Editor ausführen.
-- ============================================================

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS cancelled_at                TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancellation_refund_amount  NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS cancellation_refund_id      TEXT;
