-- ============================================================================
-- Migration: Mollie-Umstellung + Lücken aus der Code-Prüfung vom 30.07.2026
--
-- Alles ist IF NOT EXISTS / idempotent — mehrfaches Ausführen schadet nicht.
-- Ausführen in Supabase → SQL Editor → New query → einfügen → Run.
-- ============================================================================

-- ── 1. Rabattcodes: bisher wurde der Code NIRGENDS gespeichert ──────────────
-- Folge: die Single-Use-Prüfung (api/_discounts.js isRedeemed) lief gegen eine
-- Spalte, die es nicht gab, und lieferte durch das fail-open immer "noch nicht
-- eingelöst". PETER50 und ABDULLAH50 (je 50 %) waren damit unbegrenzt nutzbar.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS discount_code   TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10,2) DEFAULT 0;

-- Für die Einlöse-Prüfung (WHERE discount_code = ... AND status IN (...))
CREATE INDEX IF NOT EXISTS idx_bookings_discount_code
  ON bookings (discount_code)
  WHERE discount_code IS NOT NULL;

-- ── 2. Rückbuchungen (Chargebacks) festhalten ───────────────────────────────
-- Der Webhook wollte bisher status='disputed' setzen. Das verletzt den
-- CHECK-Constraint auf bookings.status, der Fehler wurde nicht ausgewertet —
-- die Rückbuchung blieb also komplett unsichtbar. Statt den Status zu
-- missbrauchen bekommt sie ein eigenes Feld.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS chargeback_at     TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS chargeback_amount NUMERIC(10,2);

-- ── 3. Offene Forderungen sichtbar machen ───────────────────────────────────
-- Bisher wurde nur eine fehlgeschlagene Verspätungsgebühr vermerkt. Ein
-- gescheiterter 50-€-Rückgabe-Aufpreis oder eine gescheiterte Verlängerung
-- existierten nur als einmalige E-Mail.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS admin_note                  TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS return_extra_fee_payment_id TEXT;

-- ── 4. Status-Werte nachziehen ──────────────────────────────────────────────
-- Der ursprüngliche CHECK kannte nur 5 Werte; im Code sind längst mehr in
-- Gebrauch (pending_position_check, expired, no_show). Ohne diese Erweiterung
-- scheitern Updates still, weil die Rückgabewerte nicht geprüft werden.
DO $$
BEGIN
  ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
  ALTER TABLE bookings ADD CONSTRAINT bookings_status_check
    CHECK (status IN (
      'pending', 'confirmed', 'active', 'returned', 'cancelled',
      'expired', 'no_show', 'pending_position_check'
    ));
END $$;

-- ── 5. Kontrolle ────────────────────────────────────────────────────────────
-- Nach dem Ausführen sollten hier alle neuen Spalten auftauchen:
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'bookings'
--     AND column_name IN ('discount_code','discount_amount','chargeback_at',
--                         'chargeback_amount','admin_note','return_extra_fee_payment_id');
