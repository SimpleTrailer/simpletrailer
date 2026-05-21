-- =====================================================================
-- SimpleTrailer Migration: Agent-Inbox (Routine-Reports im Cockpit)
-- =====================================================================
-- Die Routine-Agents (Daily-Briefing, Weekly-Report, Bug-Triager etc.)
-- schicken keine Mails mehr direkt in den Inbox-Posteingang — stattdessen
-- landen sie in dieser Tabelle und werden im Admin-Cockpit als
-- "Agent-Inbox" angezeigt.
--
-- IDEMPOTENT. Im Supabase SQL Editor ausführen.
-- =====================================================================

CREATE TABLE IF NOT EXISTS agent_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name  TEXT NOT NULL,
  severity    TEXT DEFAULT 'info' CHECK (severity IN ('info','warn','critical')),
  title       TEXT NOT NULL,
  summary     TEXT,
  body_html   TEXT,
  data_json   JSONB,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_messages_unread
  ON agent_messages (created_at DESC)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_agent_messages_agent
  ON agent_messages (agent_name, created_at DESC);

-- RLS: nur Service-Role (Admin-API) darf lesen/schreiben. Anon-User nichts.
ALTER TABLE agent_messages ENABLE ROW LEVEL SECURITY;
