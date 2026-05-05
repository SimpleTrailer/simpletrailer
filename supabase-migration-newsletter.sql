-- =====================================================================
-- SimpleTrailer Migration: newsletter_subscribers Tabelle
-- =====================================================================
-- DSGVO-konformer Newsletter mit Double-Opt-In:
--  1. User trägt Email ein -> Status 'pending'
--  2. Confirmation-Mail wird verschickt mit Token
--  3. User klickt Link -> Status 'confirmed'
-- =====================================================================

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'unsubscribed')),
  confirmation_token TEXT,
  confirmed_at TIMESTAMPTZ,
  unsubscribed_at TIMESTAMPTZ,
  source TEXT,                       -- z.B. 'footer', 'landing', 'booking-confirm'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS newsletter_status_idx ON newsletter_subscribers (status);
CREATE INDEX IF NOT EXISTS newsletter_token_idx ON newsletter_subscribers (confirmation_token);

ALTER TABLE newsletter_subscribers ENABLE ROW LEVEL SECURITY;
