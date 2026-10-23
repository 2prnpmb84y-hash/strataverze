-- Finance hardening Stage 7: financial cutover from another system
-- Idempotent: safe to re-run. Hand-applied via the Supabase SQL editor because
-- the build container cannot reach the database directly.
--
-- migration_batches: one cutover per row. The staged files (with the SHA-256
-- of each), the sign-off (who, when, source system, cutover date, file
-- hashes, acknowledged differences) and what the run created.
-- migration_batch_id on levy_schedules, levy_notices, supplier_invoices and
-- owner_credit_transactions marks the records a cutover brought across. Their
-- ledger balances are in the opening trial balance, so nothing posts twice.
--
-- A trigger keeps an executed cutover unchanged.
-- RLS: finance readers of the scheme can read the rows. No write policies:
-- the application writes through its own connection.

CREATE TABLE IF NOT EXISTS "migration_batches" (
  "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "scheme_id"      uuid NOT NULL REFERENCES "schemes"("id") ON DELETE CASCADE,
  "source_system"  text NOT NULL,
  "cutover_date"   date,
  "status"         text NOT NULL DEFAULT 'DRAFT' CHECK ("status" IN ('DRAFT', 'SIGNED_OFF', 'EXECUTED')),
  "files"          jsonb NOT NULL DEFAULT '{}'::jsonb,
  "sign_off"       jsonb,
  "signed_off_by"  uuid,
  "signed_off_at"  timestamptz,
  "results"        jsonb,
  "executed_by"    uuid,
  "executed_at"    timestamptz,
  "created_by"     uuid NOT NULL,
  "created_at"     timestamptz NOT NULL DEFAULT now(),
  "updated_at"     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "migration_batches_scheme_idx" ON "migration_batches" ("scheme_id");
-- At most one executed cutover per scheme.
CREATE UNIQUE INDEX IF NOT EXISTS "migration_batches_one_executed" ON "migration_batches" ("scheme_id") WHERE "status" = 'EXECUTED';

CREATE OR REPLACE FUNCTION public.migration_batches_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."status" = 'EXECUTED' THEN
    RAISE EXCEPTION 'An executed cutover cannot be changed';
  END IF;
  IF NEW."status" = 'EXECUTED' AND NEW."sign_off" IS NULL THEN
    RAISE EXCEPTION 'A cutover must be signed off before it is executed';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS "migration_batches_guard" ON "migration_batches";
CREATE TRIGGER "migration_batches_guard" BEFORE UPDATE ON "migration_batches"
  FOR EACH ROW EXECUTE FUNCTION public.migration_batches_guard();

ALTER TABLE "migration_batches" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "migration_batches_select" ON "migration_batches";
CREATE POLICY "migration_batches_select" ON "migration_batches"
  FOR SELECT TO authenticated USING (public.can_view_scheme_finance_controls("scheme_id"));

ALTER TABLE "levy_schedules" ADD COLUMN IF NOT EXISTS "migration_batch_id" uuid REFERENCES "migration_batches"("id");
ALTER TABLE "levy_notices" ADD COLUMN IF NOT EXISTS "migration_batch_id" uuid REFERENCES "migration_batches"("id");
ALTER TABLE "supplier_invoices" ADD COLUMN IF NOT EXISTS "migration_batch_id" uuid REFERENCES "migration_batches"("id");
ALTER TABLE "owner_credit_transactions" ADD COLUMN IF NOT EXISTS "migration_batch_id" uuid REFERENCES "migration_batches"("id");
CREATE INDEX IF NOT EXISTS "supplier_invoices_migration_idx" ON "supplier_invoices" ("scheme_id") WHERE "migration_batch_id" IS NOT NULL;
