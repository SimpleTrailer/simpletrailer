-- ============================================================
-- SimpleTrailer Migration: Tracker-Watchdog + Stale-Position-Support
-- ============================================================

-- Tabelle fuer Watchdog-Alarme (Anti-Spam Logging)
CREATE TABLE IF NOT EXISTS tracker_alerts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trailer_id  UUID NOT NULL REFERENCES trailers(id) ON DELETE CASCADE,
  alert_type  TEXT NOT NULL,
  severity    TEXT NOT NULL CHECK (severity IN ('critical','red','yellow','info','green')),
  message     TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

-- Constraint mit sync_drift ergaenzt (idempotent — bei Re-Run kein Fehler)
ALTER TABLE tracker_alerts DROP CONSTRAINT IF EXISTS tracker_alerts_alert_type_check;
ALTER TABLE tracker_alerts ADD CONSTRAINT tracker_alerts_alert_type_check
  CHECK (alert_type IN ('offline','battery_low','sync_drift'));

CREATE INDEX IF NOT EXISTS idx_tracker_alerts_trailer_recent
  ON tracker_alerts(trailer_id, alert_type, created_at DESC);

-- Neuer return_status Wert 'pending_review' fuer veraltete Tracker-Position
-- (wird vom process-return.js gesetzt wenn Position > 15 Min alt UND Distanz > 500m)
-- Die return_status-Spalte hat KEINEN CHECK-Constraint (laut bestehender Migration),
-- daher kein ALTER noetig. Wenn doch: ALTER TABLE bookings DROP CONSTRAINT IF EXISTS ...
