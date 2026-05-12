-- =====================================================================
-- SimpleTrailer Migration: Rückgabe-Zonen (Standard + Free-Floating)
-- =====================================================================
-- Erweitert bookings um Felder für Free-Floating-Buchung + Rückgabe-Verifikation.
-- IDEMPOTENT.
--
-- AUSFÜHRUNG: Supabase SQL Editor → New Query → Code einfügen → Run.
-- =====================================================================

-- 1) Buchungs-Tabelle: Free-Floating + Pickup/Return Positionen
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS free_floating       BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS pickup_lat          NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS pickup_lng          NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS return_lat          NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS return_lng          NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS return_distance_m   INTEGER,
  ADD COLUMN IF NOT EXISTS return_status       TEXT
    CHECK (return_status IN ('heimat','free_floating_ok','wrong_spot_in_bremen','outside_bremen') OR return_status IS NULL),
  ADD COLUMN IF NOT EXISTS return_extra_fee    NUMERIC(10,2) DEFAULT 0;

-- 2) Index für Performance bei Such-Anfragen "wo war Anhänger zuletzt"
CREATE INDEX IF NOT EXISTS idx_bookings_trailer_return_status
  ON bookings (trailer_id, return_status)
  WHERE return_status IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_return_position
  ON bookings (return_lat, return_lng)
  WHERE return_lat IS NOT NULL;

-- =====================================================================
-- BERECHNUNGS-FUNKTION: Distanz zwischen 2 GPS-Punkten (Meter)
-- Haversine-Formel als PostgreSQL-Funktion
-- =====================================================================
CREATE OR REPLACE FUNCTION distance_meters(
  lat1 NUMERIC, lng1 NUMERIC,
  lat2 NUMERIC, lng2 NUMERIC
) RETURNS INTEGER AS $$
DECLARE
  r CONSTANT NUMERIC := 6371000;
  dlat NUMERIC;
  dlng NUMERIC;
  a NUMERIC;
BEGIN
  IF lat1 IS NULL OR lat2 IS NULL THEN RETURN NULL; END IF;
  dlat := radians(lat2 - lat1);
  dlng := radians(lng2 - lng1);
  a := sin(dlat/2)^2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlng/2)^2;
  RETURN ROUND(2 * r * asin(sqrt(a)))::INTEGER;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- =====================================================================
-- VIEW: Anhänger mit aktueller Verfügbarkeit (berechnet aus Buchungen)
-- Vereinfacht Frontend-Queries.
-- =====================================================================
CREATE OR REPLACE VIEW trailer_availability AS
SELECT
  t.*,
  (
    SELECT b.end_time
    FROM bookings b
    WHERE b.trailer_id = t.id
      AND b.status IN ('confirmed','active')
      AND NOW() BETWEEN b.start_time AND b.end_time
    ORDER BY b.start_time DESC LIMIT 1
  ) AS current_booking_end,
  (
    SELECT b.start_time
    FROM bookings b
    WHERE b.trailer_id = t.id
      AND b.status IN ('confirmed','active')
      AND b.start_time > NOW()
    ORDER BY b.start_time ASC LIMIT 1
  ) AS next_booking_start;
