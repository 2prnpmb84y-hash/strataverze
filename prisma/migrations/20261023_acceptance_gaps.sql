-- Finance acceptance gaps (TC-001, TC-003, TC-004, TC-007, TC-008, TC-012)
-- Idempotent: safe to re-run. Hand-applied via the Supabase SQL editor because
-- the build container cannot reach the database directly.
--
-- levy_payments: the receipt journal each payment was posted in, and the
--   reversal of a payment (wrong lot, dishonoured, entered in error), so a
--   reversed receipt also puts the notice back.
-- bank_transactions.fitid: the OFX FITID in its own column, unique per bank
--   account, so a transaction imported again is skipped (TC-012).
-- bank_transactions.exclusion_reason: why a transaction was excluded (TC-007).
-- financial_documents.duplicate_of_id: an owner's upload that matches an
--   earlier one (TC-001).
--
-- No new tables, so no new RLS policies: these columns are covered by the
-- existing policies on their tables.

ALTER TABLE "levy_payments" ADD COLUMN IF NOT EXISTS "journal_entry_id" uuid REFERENCES "journal_entries"("id");
ALTER TABLE "levy_payments" ADD COLUMN IF NOT EXISTS "reversed_at" timestamptz;
ALTER TABLE "levy_payments" ADD COLUMN IF NOT EXISTS "reversal_date" date;
ALTER TABLE "levy_payments" ADD COLUMN IF NOT EXISTS "reversal_reason" text CHECK ("reversal_reason" IN ('WRONG_LOT', 'DISHONOURED', 'ENTERED_IN_ERROR'));
ALTER TABLE "levy_payments" ADD COLUMN IF NOT EXISTS "reversal_note" text;
ALTER TABLE "levy_payments" ADD COLUMN IF NOT EXISTS "reversal_journal_entry_id" uuid REFERENCES "journal_entries"("id");
CREATE INDEX IF NOT EXISTS "levy_payments_journal_idx" ON "levy_payments" ("journal_entry_id");

ALTER TABLE "bank_transactions" ADD COLUMN IF NOT EXISTS "fitid" varchar(255);
ALTER TABLE "bank_transactions" ADD COLUMN IF NOT EXISTS "exclusion_reason" text;
CREATE UNIQUE INDEX IF NOT EXISTS "bank_transactions_account_fitid" ON "bank_transactions" ("bank_account_id", "fitid") WHERE "fitid" IS NOT NULL;

ALTER TABLE "financial_documents" ADD COLUMN IF NOT EXISTS "duplicate_of_id" uuid REFERENCES "financial_documents"("id") ON DELETE SET NULL;
