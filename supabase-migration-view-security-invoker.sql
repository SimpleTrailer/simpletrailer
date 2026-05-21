-- =====================================================================
-- SimpleTrailer Migration: trailer_availability auf SECURITY INVOKER setzen
-- =====================================================================
-- Behebt den Supabase-Lint-Hinweis "Security Definer View" für
-- public.trailer_availability. Mit security_invoker=true führt die View
-- Queries mit den Rechten des Abfragenden aus, nicht des Erstellers →
-- RLS auf trailers/bookings wird sauber respektiert.
--
-- Erfordert PostgreSQL 15+ (Supabase nutzt aktuell PG 15/16).
-- IDEMPOTENT. Im Supabase SQL Editor ausführen.
-- =====================================================================

ALTER VIEW public.trailer_availability SET (security_invoker = true);

-- Verifikation (optional, gibt Output aus):
-- SELECT relname, reloptions FROM pg_class WHERE relname = 'trailer_availability';
-- Sollte 'security_invoker=true' in reloptions enthalten.
