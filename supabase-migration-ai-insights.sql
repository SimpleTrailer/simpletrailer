-- =====================================================================
-- SimpleTrailer Migration: ai_insights Tabelle
-- =====================================================================
-- Speichert KI-generierte Empfehlungen vom consultant-Agent (Cron-Job
-- /api/cron/weekly-advisor läuft Sonntags 18:00 UTC).
-- Cockpit liest die neueste Empfehlung und zeigt sie an.
--
-- AUSFÜHRUNG: In Supabase Dashboard → SQL Editor → diesen Block
-- einfügen → "Run" klicken.
-- =====================================================================

CREATE TABLE IF NOT EXISTS ai_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('weekly-advisor', 'anomaly-detected', 'manual')),
  recommendation TEXT NOT NULL,
  data_snapshot JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index für schnelles Sortieren nach Datum (Cockpit zeigt neueste)
CREATE INDEX IF NOT EXISTS ai_insights_created_at_idx
  ON ai_insights (created_at DESC);

-- RLS: Nur Service-Role darf lesen/schreiben (Cron + Admin-Backend)
ALTER TABLE ai_insights ENABLE ROW LEVEL SECURITY;

-- Service-Role hat eh Full-Access; keine zusätzliche Policy nötig.
-- Anonymous + authenticated User dürfen NICHT lesen.

-- Optional: alte Insights nach 90 Tagen löschen (cleanup)
-- Kann manuell oder via Cron ausgeführt werden:
-- DELETE FROM ai_insights WHERE created_at < NOW() - INTERVAL '90 days';

-- Test: Erste Empfehlung manuell einfügen (damit Cockpit nicht leer ist)
INSERT INTO ai_insights (type, recommendation, data_snapshot)
VALUES (
  'manual',
  '<h3>👋 Willkommen im AI-Cockpit</h3><p>Hier erscheint jeden Sonntag-Abend die wöchentliche Empfehlung vom <strong>consultant</strong>-Agent. Bis dahin nutze die Daten oben um den Status Deines Geschäfts auf einen Blick zu sehen.</p><p style="font-size:.85rem;color:#888;margin-top:12px;"><em>Erste echte Empfehlung kommt am nächsten Sonntag um 18:00 UTC, sobald genug Daten da sind.</em></p>',
  '{"info": "initial-placeholder"}'::jsonb
);
