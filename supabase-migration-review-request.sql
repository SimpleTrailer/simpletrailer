-- =====================================================================
-- SimpleTrailer Migration: Review-Request-Tracking
-- =====================================================================
-- Markiert, ob nach einer Rückgabe schon eine Bewertungs-Bitte verschickt
-- wurde. Verhindert doppelte Mails. Wird vom Cron /api/cron/review-request
-- gesetzt (läuft täglich 10:00 Berlin).
--
-- IDEMPOTENT. Im Supabase SQL Editor ausführen.
-- =====================================================================

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS review_request_sent_at TIMESTAMPTZ;

-- Index für den Cron-Filter: schnell finden welche Buchungen offen sind
CREATE INDEX IF NOT EXISTS idx_bookings_review_request_pending
  ON bookings (status, actual_return_time)
  WHERE status = 'returned' AND review_request_sent_at IS NULL;
