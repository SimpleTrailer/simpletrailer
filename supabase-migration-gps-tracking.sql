-- =====================================================================
-- SimpleTrailer Migration: GPS-Tracking (Teltonika TAT240 via Traccar Cloud)
-- =====================================================================
-- Ergänzt Trailer-Spalten + Position-Historie + Diebstahl-Alarm-Logs.
-- IDEMPOTENT (ADD COLUMN IF NOT EXISTS, CREATE TABLE IF NOT EXISTS).
--
-- AUSFÜHRUNG: Im Supabase SQL Editor → New Query → Code einfügen → Run.
-- =====================================================================

-- 1) TRAILERS: neue Spalten für GPS
ALTER TABLE trailers
  ADD COLUMN IF NOT EXISTS tracker_imei         TEXT,
  ADD COLUMN IF NOT EXISTS tracker_traccar_id   INTEGER,
  ADD COLUMN IF NOT EXISTS last_lat             NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS last_lng             NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS last_seen_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_speed_kmh       NUMERIC(5, 2),
  ADD COLUMN IF NOT EXISTS last_battery_percent INTEGER,
  ADD COLUMN IF NOT EXISTS is_moving            BOOLEAN DEFAULT FALSE;

-- Schneller Lookup bei Cron-Abfragen
CREATE INDEX IF NOT EXISTS idx_trailers_traccar_id ON trailers (tracker_traccar_id);

-- 2) TRAILER_POSITIONS: Historie für Pfad-Tracking + Forensik bei Diebstahl
CREATE TABLE IF NOT EXISTS trailer_positions (
  id              BIGSERIAL PRIMARY KEY,
  trailer_id      UUID REFERENCES trailers(id) ON DELETE CASCADE,
  lat             NUMERIC(10, 7) NOT NULL,
  lng             NUMERIC(10, 7) NOT NULL,
  speed_kmh       NUMERIC(5, 2),
  heading_degrees INTEGER,
  battery_percent INTEGER,
  recorded_at     TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trailer_positions_trailer_time
  ON trailer_positions (trailer_id, recorded_at DESC);

-- 3) THEFT_ALERTS: Wenn Anhänger sich bewegt ohne aktive Buchung
CREATE TABLE IF NOT EXISTS theft_alerts (
  id              BIGSERIAL PRIMARY KEY,
  trailer_id      UUID REFERENCES trailers(id) ON DELETE CASCADE,
  triggered_at    TIMESTAMPTZ DEFAULT NOW(),
  start_lat       NUMERIC(10, 7),
  start_lng       NUMERIC(10, 7),
  current_lat     NUMERIC(10, 7),
  current_lng     NUMERIC(10, 7),
  distance_meters INTEGER,
  status          TEXT DEFAULT 'open'
                    CHECK (status IN ('open', 'false_alarm', 'resolved', 'investigating')),
  notes           TEXT
);

CREATE INDEX IF NOT EXISTS idx_theft_alerts_status_time
  ON theft_alerts (status, triggered_at DESC);

-- 4) TRACKER_SYNC_STATE: Singleton-Tabelle für Cron-Status
CREATE TABLE IF NOT EXISTS tracker_sync_state (
  id                  INTEGER PRIMARY KEY DEFAULT 1,
  last_sync_at        TIMESTAMPTZ,
  last_sync_ok        BOOLEAN,
  last_error          TEXT,
  consecutive_errors  INTEGER DEFAULT 0,
  positions_received  INTEGER DEFAULT 0,
  CONSTRAINT singleton_row CHECK (id = 1)
);

INSERT INTO tracker_sync_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- 5) RLS-Policies: Trailer-Positionen sind PRIVAT (nur service_role).
--    Public-Karte zeigt nur statische "Stellplatz"-Position, nicht Live-GPS.
ALTER TABLE trailer_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE theft_alerts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracker_sync_state ENABLE ROW LEVEL SECURITY;
-- Default: keine Policy = kein Zugriff für anon. service_role bypasst RLS.

-- =====================================================================
-- FERTIG. Nach Run:
--   1) Trailer in der Tabelle bearbeiten (Supabase Dashboard → Tabelle trailers)
--      → tracker_imei eintragen (steht auf TAT240-Verpackung, 15-stellige Zahl)
--   2) Vercel-ENVs setzen (siehe GPS-SETUP.md):
--      TRACCAR_URL, TRACCAR_USERNAME, TRACCAR_PASSWORD
--   3) Cron läuft automatisch (Vercel deployt vercel.json mit)
-- =====================================================================
