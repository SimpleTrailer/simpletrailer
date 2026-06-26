-- =====================================================================
-- SimpleTrailer Migration: analytics_events (First-Party-Tracking fürs Cockpit)
-- =====================================================================
-- Speichert anonyme Funnel-/Pageview-Events, die /api/track schreibt.
-- Damit zeigt das Admin-Cockpit Besucher, Trichter (wo brechen sie ab)
-- und Herkunft (Google Ads / Kleinanzeigen / Ratgeber / Direkt) — ohne
-- dass man in Clarity einzelne Videos durchklicken muss.
--
-- DSGVO: keine IP, keine Cookies, kein Name. Nur anonyme Session-ID
-- (zufällig pro Browser-Tab), Event-Name, grobe Quelle, Pfad.
--
-- Idempotent — kann gefahrlos mehrfach ausgeführt werden.
-- Ausführen: Supabase Dashboard → SQL Editor → New query → einfügen → Run.
-- =====================================================================

CREATE TABLE IF NOT EXISTS analytics_events (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        text NOT NULL,
  session_id  text,
  source      text,
  path        text,
  props       jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS analytics_events_created_idx ON analytics_events (created_at DESC);
CREATE INDEX IF NOT EXISTS analytics_events_name_idx    ON analytics_events (name);

-- RLS an, KEINE public-Policy → nur der Service-Key (Backend: /api/track + /api/admin)
-- darf schreiben/lesen. Normale Besucher kommen nie direkt an die Tabelle.
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

-- Optional-Hygiene: alte Events nach 180 Tagen entfernen (manuell oder per Cron).
-- DELETE FROM analytics_events WHERE created_at < now() - interval '180 days';
