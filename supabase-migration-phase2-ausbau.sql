-- =====================================================================
-- SimpleTrailer Migration: Phase 2 Ausbau (2026-05-06)
-- =====================================================================
-- Bündelt 3 Migrations in einer Datei:
--   1. termin_watcher_state — Singleton fuer Bremen-Termin-Cron
--   2. ai_insights — repariert + erweitert (alte Migration war kaputt)
--   3. trailers — TÜV/Wartungs-Spalten
--
-- AUSFÜHRUNG: In Supabase SQL Editor diesen ganzen Block einfuegen + Run.
-- Idempotent (CREATE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
-- =====================================================================

-- 1. termin_watcher_state (Singleton)
CREATE TABLE IF NOT EXISTS termin_watcher_state (
  id INT PRIMARY KEY DEFAULT 1,
  last_check_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_earliest_date DATE,
  last_pushed_date DATE,
  consecutive_errors INT DEFAULT 0,
  CONSTRAINT termin_watcher_one_row CHECK (id = 1)
);

INSERT INTO termin_watcher_state (id, last_check_at)
VALUES (1, NOW())
ON CONFLICT (id) DO NOTHING;

ALTER TABLE termin_watcher_state ENABLE ROW LEVEL SECURITY;

-- 2. ai_insights — vorhandene Tabelle erweitern (defensiv)
-- (Tabelle existiert schon aus erster Migration, falls sie damals erfolgreich lief)
-- Falls nicht: erstmal anlegen
CREATE TABLE IF NOT EXISTS ai_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  recommendation TEXT NOT NULL,
  data_snapshot JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Erweiterungen für direct-ask + acknowledged-Flag
ALTER TABLE ai_insights ADD COLUMN IF NOT EXISTS agent_name TEXT;
ALTER TABLE ai_insights ADD COLUMN IF NOT EXISTS question TEXT;
ALTER TABLE ai_insights ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ;

-- Drop bestehenden type-CHECK falls vorhanden + neu erstellen mit zusätzlichen Werten
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_insights_type_check') THEN
    ALTER TABLE ai_insights DROP CONSTRAINT ai_insights_type_check;
  END IF;
END $$;

ALTER TABLE ai_insights
  ADD CONSTRAINT ai_insights_type_check
  CHECK (type IN ('weekly-advisor', 'anomaly-detected', 'manual', 'competitor-report',
                  'direct-ask', 'budget-optimizer', 'midweek-check'));

CREATE INDEX IF NOT EXISTS ai_insights_unread_idx ON ai_insights (acknowledged_at, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_insights_created_at_idx ON ai_insights (created_at DESC);

ALTER TABLE ai_insights ENABLE ROW LEVEL SECURITY;

-- Falls Tabelle frisch ohne Willkommens-Insight: einen anlegen
INSERT INTO ai_insights (type, recommendation, data_snapshot)
SELECT 'manual',
       '<h3>👋 Willkommen im AI-Cockpit</h3><p>Hier erscheint jeden Sonntag-Abend die wöchentliche Empfehlung.</p>',
       '{"info": "initial-placeholder"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM ai_insights LIMIT 1);

-- 3. trailers — TÜV/Wartung Spalten
ALTER TABLE trailers ADD COLUMN IF NOT EXISTS next_tuev_date DATE;
ALTER TABLE trailers ADD COLUMN IF NOT EXISTS next_maintenance_date DATE;
ALTER TABLE trailers ADD COLUMN IF NOT EXISTS last_tuev_alert_sent_for_date DATE;
ALTER TABLE trailers ADD COLUMN IF NOT EXISTS last_maint_alert_sent_for_date DATE;

-- 4. booking_watcher_state — fuer booking-watcher cron (neue Buchung Push)
CREATE TABLE IF NOT EXISTS booking_watcher_state (
  id INT PRIMARY KEY DEFAULT 1,
  last_seen_booking_id UUID,
  last_check_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT booking_watcher_one_row CHECK (id = 1)
);

INSERT INTO booking_watcher_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE booking_watcher_state ENABLE ROW LEVEL SECURITY;
