-- ============================================================
-- SimpleTrailer Migration: Zweites Pre-Check-Foto (Ladefläche)
-- ============================================================
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS precheck_photo_url_inside TEXT;
-- precheck_photo_url bleibt = außen-Foto (Seitenansicht)
