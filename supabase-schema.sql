-- ============================================
-- SimpleTrailer – Supabase Datenbankschema
-- Dieses SQL im Supabase SQL Editor ausführen:
-- Dashboard → SQL Editor → New Query → Ausführen
-- ============================================

-- UUID Erweiterung aktivieren
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- TRAILERS – Anhänger
-- ============================================
CREATE TABLE trailers (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                TEXT NOT NULL,
  description         TEXT,
  price_3h            NUMERIC(10,2) NOT NULL DEFAULT 8.00,
  price_day           NUMERIC(10,2) NOT NULL DEFAULT 25.00,
  price_weekend       NUMERIC(10,2) NOT NULL DEFAULT 45.00,
  late_fee_per_hour   NUMERIC(10,2) NOT NULL DEFAULT 15.00,
  is_available        BOOLEAN DEFAULT TRUE,
  image_url           TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- BOOKINGS – Buchungen
-- ============================================
CREATE TABLE bookings (
  id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trailer_id                  UUID REFERENCES trailers(id),
  customer_name               TEXT NOT NULL,
  customer_email              TEXT NOT NULL,
  customer_phone              TEXT,
  start_time                  TIMESTAMPTZ NOT NULL,
  end_time                    TIMESTAMPTZ NOT NULL,
  pricing_type                TEXT NOT NULL CHECK (pricing_type IN ('3h', 'day', 'weekend')),
  total_amount                NUMERIC(10,2) NOT NULL,
  stripe_payment_intent_id    TEXT UNIQUE,
  stripe_customer_id          TEXT,
  stripe_payment_method_id    TEXT,
  status                      TEXT DEFAULT 'pending'
                                CHECK (status IN ('pending','confirmed','active','returned','cancelled')),
  access_code                 TEXT,
  return_token                TEXT UNIQUE,
  return_photo_url            TEXT,
  actual_return_time          TIMESTAMPTZ,
  late_fee_amount             NUMERIC(10,2) DEFAULT 0,
  late_fee_payment_intent_id  TEXT,
  agb_version                 TEXT,
  agb_accepted_at             TIMESTAMPTZ,
  agb_accepted_ip             TEXT,
  created_at                  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE trailers  ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings  ENABLE ROW LEVEL SECURITY;

-- Trailers: jeder kann lesen (für die Karte auf der Webseite)
CREATE POLICY "trailers_public_read" ON trailers
  FOR SELECT USING (true);

-- Bookings: nur service_role (Netlify Functions) darf lesen/schreiben
-- Anon-Key hat keinen Zugriff auf Buchungsdaten

-- ============================================
-- STORAGE – Bucket für Rückgabe-Fotos
-- ============================================
-- Manuell anlegen: Storage → New bucket → "return-photos" → Public: ON

-- ============================================
-- ERSTER ANHÄNGER
-- ============================================
INSERT INTO trailers (name, description, price_3h, price_day, price_weekend, late_fee_per_hour, is_available)
VALUES (
  'PKW-Anhänger mit Plane',
  'Perfekt für Umzüge und Transport. Bis 750 kg zGG, Führerschein Klasse B, Plane inklusive.',
  8.00,
  25.00,
  45.00,
  15.00,
  true
);

-- ============================================
-- ADMIN USER erstellen
-- Dashboard → Authentication → Users → Add User
-- E-Mail: info@simpletrailer.de
-- Passwort: (dein gewähltes Passwort)
-- ============================================
