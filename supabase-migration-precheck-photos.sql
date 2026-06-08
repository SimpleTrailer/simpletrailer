-- ============================================================
-- SimpleTrailer Migration: Zweites Pre-Check-Foto (Ladefläche)
-- + AI-Override-Tracking
-- ============================================================
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS precheck_photo_url_inside TEXT,
  ADD COLUMN IF NOT EXISTS precheck_ai_override BOOLEAN DEFAULT FALSE;
-- precheck_photo_url bleibt = außen-Foto (Seitenansicht)
-- precheck_ai_override = TRUE wenn Mieter "Trotzdem absenden" geklickt hat trotz KI-Block
