-- Finance hardening Stage 3: reconciliation a volunteer can finish
-- Idempotent: safe to re-run. Hand-applied via the Supabase SQL editor because
-- the build container cannot reach the database directly.
--
-- 1. bank_transaction_allocations: part of a bank transaction allocated to a
--    journal entry, so one deposit can cover several levy notices and one
--    invoice can be paid by several transactions. A transaction is MATCHED
--    when its allocations add up to its whole amount.
-- 2. Existing one-to-one matches are copied in as a single allocation for the
--    whole amount, so nothing already matched becomes unmatched.
-- 3. suspense_items: unidentified amounts posted to the suspense account,
--    which must be cleared before the period they fall in can be closed.
-- 4. scheme_bank_accounts.csv_mapping: the saved CSV column mapping.
--
-- RLS: finance readers of the scheme (advisers, committee, accountants,
-- payment authorisers, platform admins) can read the new tables. No write
-- policies: the application writes through its own connection.

-- ─── 1. bank_transaction_allocations ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "bank_transaction_allocations" (
  "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "scheme_id"           uuid NOT NULL REFERENCES "schemes"("id") ON DELETE CASCADE,
  "bank_transaction_id" uuid NOT NULL REFERENCES "bank_transactions"("id") ON DELETE CASCADE,
  "journal_entry_id"    uuid NOT NULL REFERENCES "journal_entries"("id") ON DELETE CASCADE,
  "amount"              numeric(12,2) NOT NULL CHECK ("amount" > 0),
  "created_by"          uuid REFERENCES "profiles"("id"),
  "created_at"          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "bank_transaction_allocations_txn_entry_key" UNIQUE ("bank_transaction_id", "journal_entry_id")
);
CREATE INDEX IF NOT EXISTS "bank_transaction_allocations_scheme_idx" ON "bank_transaction_allocations" ("scheme_id");
CREATE INDEX IF NOT EXISTS "bank_transaction_allocations_entry_idx" ON "bank_transaction_allocations" ("journal_entry_id");
ALTER TABLE "bank_transaction_allocations" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "bank_transaction_allocations_select" ON "bank_transaction_allocations";
CREATE POLICY "bank_transaction_allocations_select" ON "bank_transaction_allocations"
  FOR SELECT TO authenticated USING (public.can_view_scheme_finance_controls("scheme_id"));

-- ─── 2. Copy existing one-to-one matches ────────────────────────────────────
INSERT INTO "bank_transaction_allocations" ("scheme_id", "bank_transaction_id", "journal_entry_id", "amount", "created_by", "created_at")
SELECT t."scheme_id", t."id", t."matched_journal_entry_id", abs(t."amount"), t."matched_by", coalesce(t."matched_at", now())
FROM "bank_transactions" t
JOIN "journal_entries" j ON j."id" = t."matched_journal_entry_id"
WHERE t."matched_journal_entry_id" IS NOT NULL
  AND t."reconciliation_status" IN ('MATCHED', 'RECONCILED')
  AND t."amount" <> 0
ON CONFLICT ("bank_transaction_id", "journal_entry_id") DO NOTHING;

-- ─── 3. suspense_items ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "suspense_items" (
  "id"                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "scheme_id"                uuid NOT NULL REFERENCES "schemes"("id") ON DELETE CASCADE,
  "bank_transaction_id"      uuid NOT NULL REFERENCES "bank_transactions"("id") ON DELETE CASCADE,
  "journal_entry_id"         uuid NOT NULL REFERENCES "journal_entries"("id"),
  "amount"                   numeric(12,2) NOT NULL CHECK ("amount" <> 0),
  "transaction_date"         date NOT NULL,
  "description"              text NOT NULL,
  "status"                   text NOT NULL DEFAULT 'OPEN' CHECK ("status" IN ('OPEN', 'CLEARED')),
  "cleared_journal_entry_id" uuid REFERENCES "journal_entries"("id"),
  "cleared_note"             text,
  "cleared_by"               uuid REFERENCES "profiles"("id"),
  "cleared_at"               timestamptz,
  "created_by"               uuid REFERENCES "profiles"("id"),
  "created_at"               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "suspense_items_cleared_check" CHECK ("status" = 'OPEN' OR "cleared_journal_entry_id" IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS "suspense_items_scheme_status_idx" ON "suspense_items" ("scheme_id", "status");
ALTER TABLE "suspense_items" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "suspense_items_select" ON "suspense_items";
CREATE POLICY "suspense_items_select" ON "suspense_items"
  FOR SELECT TO authenticated USING (public.can_view_scheme_finance_controls("scheme_id"));

-- ─── 4. Saved CSV mapping ───────────────────────────────────────────────────
ALTER TABLE "scheme_bank_accounts" ADD COLUMN IF NOT EXISTS "csv_mapping" text;
