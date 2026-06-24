-- =====================================================================
-- SimpleTrailer Migration: notify_when_available — neue Anhänger-Typen
-- =====================================================================
-- Erweitert die CHECK-Constraint auf trailer_type um die 3 neuen
-- "Demnächst"-Anhänger, damit der "Benachrichtigen wenn verfügbar"-Button
-- für diese Anhänger NICHT an der Datenbank scheitert:
--   - Hochplane          (Hochplanen-Anhänger, Humbaur HA132513)
--   - Pferdeanhaenger    (Pferdeanhänger, Humbaur Equitos)
--   - Rueckwaertskipper  (Rückwärtskipper, Humbaur HUK 152314)
--
-- Idempotent: kann gefahrlos mehrfach ausgeführt werden.
-- Ausführen im Supabase SQL-Editor (Dashboard → SQL Editor → Run).
-- =====================================================================

-- Alte CHECK-Constraint auf trailer_type robust entfernen (egal wie sie heißt)
DO $$
DECLARE
  con_name text;
BEGIN
  SELECT conname INTO con_name
  FROM pg_constraint
  WHERE conrelid = 'notify_when_available'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%trailer_type%';
  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE notify_when_available DROP CONSTRAINT %I', con_name);
  END IF;
END $$;

-- Neue, erweiterte CHECK-Constraint setzen
ALTER TABLE notify_when_available
  ADD CONSTRAINT notify_when_available_trailer_type_check
  CHECK (trailer_type IN (
    'Autotransporter', 'Kofferanhaenger', 'PKW-Plane',
    'Hochplane', 'Pferdeanhaenger', 'Rueckwaertskipper'
  ));
