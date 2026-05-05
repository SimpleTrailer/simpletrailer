-- =====================================================================
-- SimpleTrailer Migration: social_posts_queue Tabelle
-- =====================================================================
-- Speichert KI-generierte Social-Media-Posts vom social-media-generator-
-- Cron (laeuft taeglich 7:00 UTC). Cockpit zeigt Pipeline + Status.
--
-- AUSFUEHRUNG: In Supabase Dashboard -> SQL Editor -> diesen Block
-- einfuegen -> "Run" klicken.
-- =====================================================================

CREATE TABLE IF NOT EXISTS social_posts_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scheduled_for DATE NOT NULL,
  channel TEXT NOT NULL DEFAULT 'instagram' CHECK (channel IN ('instagram', 'facebook', 'both')),
  topic_type TEXT NOT NULL,  -- 'ratgeber', 'showcase', 'kunde', 'behind-scenes', 'tipp', 'wochenend-push', 'recap'
  caption TEXT NOT NULL,
  hashtags TEXT NOT NULL,
  image_prompt TEXT,         -- fuer Canva/Midjourney/DALL-E
  image_url TEXT,            -- spaeter, wenn KI-generiert
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'posted', 'skipped')),
  posted_at TIMESTAMPTZ,
  posted_by TEXT,            -- 'manual' oder 'auto'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index fuer schnelles Finden offener Drafts
CREATE INDEX IF NOT EXISTS social_posts_queue_status_idx
  ON social_posts_queue (status, scheduled_for DESC);

-- Index fuer Cockpit-Pipeline-Anzeige
CREATE INDEX IF NOT EXISTS social_posts_queue_scheduled_idx
  ON social_posts_queue (scheduled_for DESC);

-- RLS: Nur Service-Role (Cron + Admin)
ALTER TABLE social_posts_queue ENABLE ROW LEVEL SECURITY;

-- Auto-Update updated_at on UPDATE
CREATE OR REPLACE FUNCTION update_social_posts_queue_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS social_posts_queue_updated_at_trigger ON social_posts_queue;
CREATE TRIGGER social_posts_queue_updated_at_trigger
  BEFORE UPDATE ON social_posts_queue
  FOR EACH ROW EXECUTE FUNCTION update_social_posts_queue_updated_at();
