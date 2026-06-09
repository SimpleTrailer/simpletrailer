-- ============================================================
-- SimpleTrailer Migration: Real-Foto + Kennzeichen-Anzeige
-- ============================================================
-- Fuegt eine Spalte hinzu fuer das echte Foto (aktuell grauer
-- Anhaenger ohne Branding). Wird in Bestaetigungs-Mail,
-- Kundenkonto und Pre-Check angezeigt — NICHT auf der Webseite
-- (dort bleibt das Branding-Marketing-Foto).
--
-- Idempotent: kann mehrfach ausgefuehrt werden.

ALTER TABLE trailers
  ADD COLUMN IF NOT EXISTS appearance_photo_url TEXT;

-- Bereits gepflegt:
-- - license_plate (HB AT 202 / HB ST 711)
-- - image_url (NULL, da Webseite das Mockup als Fallback nutzt)
