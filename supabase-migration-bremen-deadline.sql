-- =====================================================================
-- SimpleTrailer Migration: Bremen-Termin-Deadline aus DB (statt ENV)
-- =====================================================================
-- Idee: Lion trägt aktuell gebuchten Bremen-Zulassungstermin im Admin ein.
-- Cron pingt nur bei früherem Termin. Termin verschoben → einfach im Admin
-- updaten → Cron kennt neue Schwelle automatisch.
--
-- AUSFÜHRUNG: Im Supabase SQL Editor diesen Block einfügen + Run.
-- Idempotent (ADD COLUMN IF NOT EXISTS).
-- =====================================================================

ALTER TABLE termin_watcher_state
  ADD COLUMN IF NOT EXISTS bremen_termin_deadline DATE;

-- Default-Wert setzen falls leer (kommt aus alter ENV-Variable)
UPDATE termin_watcher_state
   SET bremen_termin_deadline = '2026-05-19'
 WHERE id = 1
   AND bremen_termin_deadline IS NULL;
