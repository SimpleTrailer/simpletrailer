-- =====================================================================
-- SimpleTrailer Migration: notify_when_available Tabelle
-- =====================================================================
-- User die per "Benachrichtigen wenn da" Button auf simpletrailer.de
-- ihre Email für noch-nicht-verfuegbare Anhaenger hinterlassen.
-- =====================================================================

CREATE TABLE IF NOT EXISTS notify_when_available (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  trailer_type TEXT NOT NULL CHECK (trailer_type IN ('Autotransporter', 'Kofferanhaenger', 'PKW-Plane')),
  notified BOOLEAN DEFAULT false,
  notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (email, trailer_type)
);

CREATE INDEX IF NOT EXISTS notify_trailer_type_idx ON notify_when_available (trailer_type, notified);

ALTER TABLE notify_when_available ENABLE ROW LEVEL SECURITY;
