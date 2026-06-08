-- ============================================================
-- SimpleTrailer Migration: Schadenshistorie pro Anhänger
-- ============================================================
-- Speichert dokumentierte Schäden — Quelle: Pre-Check des Mieters,
-- Rückgabe, Admin-Eintrag oder Kunden-Meldung.
-- Status: open / resolved / wont_fix.
-- Mieter sieht im Pre-Check nur die 'open'-Schäden des jeweiligen Trailers
-- damit er bekannte Schäden nicht erneut dokumentiert.
-- ============================================================

CREATE TABLE IF NOT EXISTS damages (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trailer_id      UUID NOT NULL REFERENCES trailers(id) ON DELETE CASCADE,
  booking_id      UUID REFERENCES bookings(id) ON DELETE SET NULL,
  source          TEXT NOT NULL CHECK (source IN ('pre_check','return','admin','customer_report')),
  severity        TEXT NOT NULL CHECK (severity IN ('minor','major','not_drivable')),
  description     TEXT NOT NULL,
  photo_url       TEXT,
  status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','wont_fix')),
  resolved_at     TIMESTAMPTZ,
  resolved_note   TEXT,
  reported_by     TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Index für schnelle Lookups pro Trailer + Status (Mieter-Anzeige)
CREATE INDEX IF NOT EXISTS idx_damages_trailer_status
  ON damages (trailer_id, status);

-- Index für Admin-Cockpit (alle offenen pro Anhänger sortiert nach Datum)
CREATE INDEX IF NOT EXISTS idx_damages_status_created
  ON damages (status, created_at DESC);

-- ============================================================
-- Bookings-Erweiterung: "nicht fahrtauglich"-Workflow
-- ============================================================
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS not_drivable_reported_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS not_drivable_photo_url   TEXT,
  ADD COLUMN IF NOT EXISTS not_drivable_description TEXT,
  ADD COLUMN IF NOT EXISTS refund_status            TEXT CHECK (refund_status IN ('pending','approved','rejected'));
