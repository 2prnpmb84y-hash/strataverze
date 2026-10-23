-- Finance hardening Stage 2: owner credit balances
-- Idempotent: safe to re-run. Hand-applied via the Supabase SQL editor because
-- the build container cannot reach the database directly.
--
-- 1. Owner credit balances, one per lot per fund. A payment above what a
--    notice owes is held as the owner's credit instead of being lost.
-- 2. Credit movements: OVERPAYMENT, APPLIED (to a later notice), REFUNDED,
--    ADJUSTED. Amounts are positive; the type gives the direction.
-- 3. Credit refunds, approved under the scheme payment policy like a supplier
--    payment. payment_authorisations gains owner_credit_refund_id.
-- 4. schemes.auto_apply_owner_credit (default on).
--
-- RLS: advisers, committee, accountants and payment authorisers of the scheme
-- (and platform admins) can read these rows. Owners see their own credit
-- through the application. No write policies: the application writes through
-- its own connection.

-- ─── 1. owner_credit_balances ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "owner_credit_balances" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "scheme_id"  uuid NOT NULL REFERENCES "schemes"("id") ON DELETE CASCADE,
  "lot_id"     uuid NOT NULL REFERENCES "lots"("id") ON DELETE CASCADE,
  "fund_id"    uuid NOT NULL REFERENCES "funds"("id") ON DELETE CASCADE,
  "owner_id"   uuid REFERENCES "profiles"("id") ON DELETE SET NULL,
  "balance"    numeric(12,2) NOT NULL DEFAULT 0 CHECK ("balance" >= 0),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "owner_credit_balances_lot_fund_key" UNIQUE ("scheme_id", "lot_id", "fund_id")
);
CREATE INDEX IF NOT EXISTS "owner_credit_balances_scheme_id_idx" ON "owner_credit_balances" ("scheme_id");
ALTER TABLE "owner_credit_balances" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner_credit_balances_select" ON "owner_credit_balances";
CREATE POLICY "owner_credit_balances_select" ON "owner_credit_balances"
  FOR SELECT TO authenticated USING (public.can_view_scheme_finance_controls("scheme_id"));

-- ─── 3 (first, referenced by 2). owner_credit_refunds ───────────────────────
CREATE TABLE IF NOT EXISTS "owner_credit_refunds" (
  "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "scheme_id"           uuid NOT NULL REFERENCES "schemes"("id") ON DELETE CASCADE,
  "lot_id"              uuid NOT NULL REFERENCES "lots"("id") ON DELETE CASCADE,
  "fund_id"             uuid NOT NULL REFERENCES "funds"("id") ON DELETE CASCADE,
  "owner_id"            uuid REFERENCES "profiles"("id") ON DELETE SET NULL,
  "amount"              numeric(12,2) NOT NULL CHECK ("amount" > 0),
  "payee_name"          varchar(200) NOT NULL,
  "bsb"                 varchar(7) NOT NULL,
  "account_number"      varchar(20) NOT NULL,
  "verification_method" text NOT NULL CHECK ("verification_method" IN ('CALLBACK','DOCUMENT')),
  "reason"              text,
  "status"              text NOT NULL DEFAULT 'AWAITING_APPROVAL'
                          CHECK ("status" IN ('AWAITING_APPROVAL','APPROVED','PAID','CANCELLED')),
  "prepared_by_id"      uuid NOT NULL REFERENCES "profiles"("id"),
  "paid_at"             timestamptz,
  "paid_by"             uuid REFERENCES "profiles"("id"),
  "journal_entry_id"    uuid REFERENCES "journal_entries"("id") ON DELETE SET NULL,
  "created_at"          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "owner_credit_refunds_scheme_status_idx" ON "owner_credit_refunds" ("scheme_id", "status");
ALTER TABLE "owner_credit_refunds" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner_credit_refunds_select" ON "owner_credit_refunds";
CREATE POLICY "owner_credit_refunds_select" ON "owner_credit_refunds"
  FOR SELECT TO authenticated USING (public.can_view_scheme_finance_controls("scheme_id"));

-- ─── 2. owner_credit_transactions ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "owner_credit_transactions" (
  "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "scheme_id"        uuid NOT NULL REFERENCES "schemes"("id") ON DELETE CASCADE,
  "lot_id"           uuid NOT NULL REFERENCES "lots"("id") ON DELETE CASCADE,
  "fund_id"          uuid NOT NULL REFERENCES "funds"("id") ON DELETE CASCADE,
  "owner_id"         uuid REFERENCES "profiles"("id") ON DELETE SET NULL,
  "type"             text NOT NULL CHECK ("type" IN ('OVERPAYMENT','APPLIED','REFUNDED','ADJUSTED')),
  "amount"           numeric(12,2) NOT NULL CHECK ("amount" > 0),
  "levy_notice_id"   uuid REFERENCES "levy_notices"("id") ON DELETE SET NULL,
  "levy_payment_id"  uuid REFERENCES "levy_payments"("id") ON DELETE SET NULL,
  "refund_id"        uuid REFERENCES "owner_credit_refunds"("id") ON DELETE SET NULL,
  "journal_entry_id" uuid REFERENCES "journal_entries"("id") ON DELETE SET NULL,
  "effective_date"   date NOT NULL DEFAULT current_date,
  "note"             text,
  "created_by"       uuid REFERENCES "profiles"("id"),
  "created_at"       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "owner_credit_transactions_scheme_lot_idx" ON "owner_credit_transactions" ("scheme_id", "lot_id");
ALTER TABLE "owner_credit_transactions" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner_credit_transactions_select" ON "owner_credit_transactions";
CREATE POLICY "owner_credit_transactions_select" ON "owner_credit_transactions"
  FOR SELECT TO authenticated USING (public.can_view_scheme_finance_controls("scheme_id"));

-- ─── 3b. Refund approvals use payment_authorisations ────────────────────────
ALTER TABLE "payment_authorisations" ADD COLUMN IF NOT EXISTS "owner_credit_refund_id" uuid
  REFERENCES "owner_credit_refunds"("id") ON DELETE CASCADE;
ALTER TABLE "payment_authorisations" DROP CONSTRAINT IF EXISTS "payment_authorisations_one_invoice_check";
ALTER TABLE "payment_authorisations" ADD CONSTRAINT "payment_authorisations_one_invoice_check" CHECK (
  (("supplier_invoice_id" IS NOT NULL)::int + ("works_invoice_id" IS NOT NULL)::int + ("owner_credit_refund_id" IS NOT NULL)::int) = 1
);
CREATE UNIQUE INDEX IF NOT EXISTS "payment_authorisations_refund_approver_idx"
  ON "payment_authorisations" ("owner_credit_refund_id", "approver_id") WHERE "owner_credit_refund_id" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "payment_authorisations_refund_sequence_idx"
  ON "payment_authorisations" ("owner_credit_refund_id", "sequence") WHERE "owner_credit_refund_id" IS NOT NULL;

-- ─── 4. Scheme setting ──────────────────────────────────────────────────────
ALTER TABLE "schemes" ADD COLUMN IF NOT EXISTS "auto_apply_owner_credit" boolean NOT NULL DEFAULT true;
