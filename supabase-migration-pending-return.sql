-- ============================================================
-- SimpleTrailer Migration: Schonfrist-Rueckgabe (Tier/Lime-Style)
-- ============================================================
-- Neuer Buchungs-Status "pending_position_check": Mieter hat Rueckgabe
-- bestaetigt, Tracker-Position ist aber veraltet. Cron prueft spaeter
-- ob die Position passt und schliesst die Buchung ab.

-- 1) Neuer Status-Wert
-- Hinweis: bookings.status hat ggf. einen CHECK-Constraint. Falls ja, anpassen:
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_status_check
  CHECK (status IN ('confirmed','active','returned','cancelled','expired','pending_position_check'));

-- 2) Neue Spalten fuer Schonfrist-Logik
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS position_check_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS position_check_resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS mieter_confirmed_in_zone BOOLEAN,
  ADD COLUMN IF NOT EXISTS mieter_geo_lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS mieter_geo_lng DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS mieter_geo_accuracy_m INTEGER;

-- 3) Index fuer Cron-Lookup
CREATE INDEX IF NOT EXISTS idx_bookings_pending_position
  ON bookings(status, position_check_started_at)
  WHERE status = 'pending_position_check';
