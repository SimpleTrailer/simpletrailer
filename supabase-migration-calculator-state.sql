-- =====================================================================
-- SimpleTrailer Migration: Business-Rechner-State pro User
-- =====================================================================
-- Pro Admin-User ein eigener State (Lion + Samuel je ihre eigenen Werte).
-- Auto-Save mit Debounce nach jeder Änderung im Admin.
-- IDEMPOTENT.
--
-- AUSFÜHRUNG: Supabase SQL Editor → New Query → Code einfügen → Run.
-- =====================================================================

CREATE TABLE IF NOT EXISTS admin_calculator_state (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  state       JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE admin_calculator_state ENABLE ROW LEVEL SECURITY;

-- service_role bypasst RLS (api/admin.js nutzt service_role)
-- Keine direkte anon/authenticated-Policy nötig — alle Zugriffe laufen
-- über api/admin.js mit Bearer-Token-Verifizierung
