-- =====================================================================
-- SimpleTrailer Migration: content_drafts Tabelle
-- =====================================================================
-- Speichert KI-generierte Content-Drafts (wöchentlicher Ratgeber-Artikel
-- vom content-writer Cron). User kann sie reviewen + 1-Klick publishen.
-- =====================================================================

CREATE TABLE IF NOT EXISTS content_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('ratgeber', 'newsletter', 'pressemitteilung', 'social-extended')),
  title TEXT NOT NULL,
  slug TEXT,                                 -- für /ratgeber/<slug>.html
  content_html TEXT NOT NULL,
  meta_description TEXT,
  keywords TEXT[],
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'published', 'rejected')),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS content_drafts_status_idx ON content_drafts (status, created_at DESC);

ALTER TABLE content_drafts ENABLE ROW LEVEL SECURITY;
