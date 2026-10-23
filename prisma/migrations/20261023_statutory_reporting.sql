-- Finance hardening Stage 4: statutory financial reporting
-- Idempotent: safe to re-run. Hand-applied via the Supabase SQL editor because
-- the build container cannot reach the database directly.
--
-- 1. funds.accounting_basis: CASH for administrative funds, ACCRUAL for
--    capital works funds (Financial Management Requirements). Reports use it;
--    posting does not change.
-- 2. budgets: a header per fund, year and version, with adoption at a general
--    meeting. Existing budget lines are grouped into version 1 (DRAFT).
--    budget_lines gains budget_id; the unique key moves to (budget_id,
--    account_code_id) so a revision can hold the same accounts.
-- 3. capital_works_plans and capital_works_plan_items (SSMA 2015 s 80).
--    levy_schedules.capital_works_plan_id records a schedule made from a plan.
-- 4. statutory_pack_snapshots: the locked pack adopted at the AGM.
--    financial_documents.meeting_id links a document to that meeting.
--
-- RLS: finance readers of the scheme can read the new tables. Plan items are
-- read through their plan. No write policies: the application writes through
-- its own connection.

-- ─── 0. Fund types ──────────────────────────────────────────────────────────
-- Scheme setup created funds as ADMIN, SINKING and RESERVE, but the finance
-- module looks funds up as ADMINISTRATIVE, CAPITAL_WORKS and SPECIAL, so no
-- system account could be found for them. Rename to the finance names. To
-- reverse: the same updates the other way round.
UPDATE "funds" SET "fund_type" = 'ADMINISTRATIVE' WHERE "fund_type" = 'ADMIN';
UPDATE "funds" SET "fund_type" = 'CAPITAL_WORKS' WHERE "fund_type" = 'SINKING';
UPDATE "funds" SET "fund_type" = 'SPECIAL' WHERE "fund_type" = 'RESERVE';

-- ─── 1. Accounting basis ────────────────────────────────────────────────────
-- Added once: on that first run, capital works funds are set to accrual. A
-- re-run leaves any basis changed since alone.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'funds' AND column_name = 'accounting_basis') THEN
    ALTER TABLE "funds" ADD COLUMN "accounting_basis" text NOT NULL DEFAULT 'CASH';
    UPDATE "funds" SET "accounting_basis" = 'ACCRUAL' WHERE "fund_type" IN ('CAPITAL_WORKS', 'SINKING');
  END IF;
END $$;
ALTER TABLE "funds" DROP CONSTRAINT IF EXISTS "funds_accounting_basis_check";
ALTER TABLE "funds" ADD CONSTRAINT "funds_accounting_basis_check" CHECK ("accounting_basis" IN ('CASH', 'ACCRUAL'));

-- ─── 2. Budgets ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "budgets" (
  "id"                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "scheme_id"          uuid NOT NULL REFERENCES "schemes"("id") ON DELETE CASCADE,
  "fund_id"            uuid NOT NULL REFERENCES "funds"("id") ON DELETE CASCADE,
  "financial_year"     integer NOT NULL,
  "version"            integer NOT NULL DEFAULT 1 CHECK ("version" >= 1),
  "status"             text NOT NULL DEFAULT 'DRAFT' CHECK ("status" IN ('DRAFT', 'PROPOSED', 'ADOPTED', 'SUPERSEDED')),
  "adopted_meeting_id" uuid REFERENCES "meetings"("id") ON DELETE SET NULL,
  "adopted_motion_id"  uuid REFERENCES "agenda_items"("id") ON DELETE SET NULL,
  "adopted_at"         timestamptz,
  "adopted_by"         uuid REFERENCES "profiles"("id"),
  "created_by"         uuid REFERENCES "profiles"("id"),
  "created_at"         timestamptz NOT NULL DEFAULT now(),
  "updated_at"         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "budgets_fund_year_version_key" UNIQUE ("fund_id", "financial_year", "version")
);
CREATE INDEX IF NOT EXISTS "budgets_scheme_year_idx" ON "budgets" ("scheme_id", "financial_year");
-- At most one adopted budget per fund and year.
CREATE UNIQUE INDEX IF NOT EXISTS "budgets_one_adopted_idx" ON "budgets" ("fund_id", "financial_year") WHERE "status" = 'ADOPTED';
ALTER TABLE "budgets" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "budgets_select" ON "budgets";
CREATE POLICY "budgets_select" ON "budgets"
  FOR SELECT TO authenticated USING (public.can_view_scheme_finance_controls("scheme_id"));

ALTER TABLE "budget_lines" ADD COLUMN IF NOT EXISTS "budget_id" uuid REFERENCES "budgets"("id") ON DELETE CASCADE;

-- Group existing lines into version 1 for their fund and year.
INSERT INTO "budgets" ("scheme_id", "fund_id", "financial_year", "version", "status")
SELECT DISTINCT f."scheme_id", bl."fund_id", bl."financial_year", 1, 'DRAFT'
FROM "budget_lines" bl
JOIN "funds" f ON f."id" = bl."fund_id"
WHERE bl."budget_id" IS NULL
ON CONFLICT ("fund_id", "financial_year", "version") DO NOTHING;
UPDATE "budget_lines" bl
SET "budget_id" = b."id"
FROM "budgets" b
WHERE bl."budget_id" IS NULL AND b."fund_id" = bl."fund_id" AND b."financial_year" = bl."financial_year" AND b."version" = 1;

-- Move the unique key from (fund, account, year) to (budget, account).
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'budget_lines' AND con.contype = 'u'
      AND con.conname <> 'budget_lines_budget_account_key'
  LOOP
    EXECUTE format('ALTER TABLE "budget_lines" DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
DROP INDEX IF EXISTS "budget_lines_fund_id_account_code_id_financial_year_key";
ALTER TABLE "budget_lines" DROP CONSTRAINT IF EXISTS "budget_lines_budget_account_key";
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_budget_account_key" UNIQUE ("budget_id", "account_code_id");
CREATE INDEX IF NOT EXISTS "budget_lines_fund_year_idx" ON "budget_lines" ("fund_id", "financial_year");

-- ─── 3. Capital works fund plans ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "capital_works_plans" (
  "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "scheme_id"           uuid NOT NULL REFERENCES "schemes"("id") ON DELETE CASCADE,
  "title"               text NOT NULL,
  "prepared_by"         text,
  "prepared_at"         date NOT NULL,
  "period_start_year"   integer NOT NULL,
  "review_due_at"       date NOT NULL,
  "opening_balance"     numeric(12,2) NOT NULL DEFAULT 0,
  "contribution_method" text NOT NULL DEFAULT 'LEVEL' CHECK ("contribution_method" IN ('LEVEL', 'AVERAGE')),
  "annual_contribution" numeric(12,2),
  "status"              text NOT NULL DEFAULT 'DRAFT' CHECK ("status" IN ('DRAFT', 'ADOPTED', 'SUPERSEDED')),
  "adopted_meeting_id"  uuid REFERENCES "meetings"("id") ON DELETE SET NULL,
  "adopted_motion_id"   uuid REFERENCES "agenda_items"("id") ON DELETE SET NULL,
  "adopted_at"          timestamptz,
  "compliance_item_id"  uuid REFERENCES "compliance_items"("id") ON DELETE SET NULL,
  "created_by"          uuid REFERENCES "profiles"("id"),
  "created_at"          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "capital_works_plans_scheme_status_idx" ON "capital_works_plans" ("scheme_id", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "capital_works_plans_one_adopted_idx" ON "capital_works_plans" ("scheme_id") WHERE "status" = 'ADOPTED';
ALTER TABLE "capital_works_plans" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "capital_works_plans_select" ON "capital_works_plans";
CREATE POLICY "capital_works_plans_select" ON "capital_works_plans"
  FOR SELECT TO authenticated USING (public.can_view_scheme_finance_controls("scheme_id"));

CREATE TABLE IF NOT EXISTS "capital_works_plan_items" (
  "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "plan_id"        uuid NOT NULL REFERENCES "capital_works_plans"("id") ON DELETE CASCADE,
  "description"    text NOT NULL,
  "component"      text,
  "planned_year"   integer NOT NULL,
  "estimated_cost" numeric(12,2) NOT NULL CHECK ("estimated_cost" >= 0),
  "funding_source" text NOT NULL DEFAULT 'CAPITAL_WORKS_FUND',
  "notes"          text,
  "created_at"     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "capital_works_plan_items_plan_year_idx" ON "capital_works_plan_items" ("plan_id", "planned_year");
ALTER TABLE "capital_works_plan_items" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "capital_works_plan_items_select" ON "capital_works_plan_items";
CREATE POLICY "capital_works_plan_items_select" ON "capital_works_plan_items"
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM "capital_works_plans" p WHERE p."id" = "plan_id" AND public.can_view_scheme_finance_controls(p."scheme_id"))
  );

ALTER TABLE "levy_schedules" ADD COLUMN IF NOT EXISTS "capital_works_plan_id" uuid REFERENCES "capital_works_plans"("id") ON DELETE SET NULL;

-- ─── 4. Statutory pack snapshots ────────────────────────────────────────────
ALTER TABLE "financial_documents" ADD COLUMN IF NOT EXISTS "meeting_id" uuid REFERENCES "meetings"("id") ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS "statutory_pack_snapshots" (
  "id"                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "scheme_id"             uuid NOT NULL REFERENCES "schemes"("id") ON DELETE CASCADE,
  "financial_year"        integer NOT NULL,
  "meeting_id"            uuid NOT NULL REFERENCES "meetings"("id"),
  "motion_id"             uuid REFERENCES "agenda_items"("id") ON DELETE SET NULL,
  "content"               text NOT NULL,
  "content_hash"          text NOT NULL,
  "financial_document_id" uuid REFERENCES "financial_documents"("id") ON DELETE SET NULL,
  "adopted_by"            uuid NOT NULL REFERENCES "profiles"("id"),
  "adopted_at"            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "statutory_pack_snapshots_scheme_year_meeting_key" UNIQUE ("scheme_id", "financial_year", "meeting_id")
);
ALTER TABLE "statutory_pack_snapshots" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "statutory_pack_snapshots_select" ON "statutory_pack_snapshots";
CREATE POLICY "statutory_pack_snapshots_select" ON "statutory_pack_snapshots"
  FOR SELECT TO authenticated USING (public.can_view_scheme_finance_controls("scheme_id"));

-- A locked snapshot cannot be changed once adopted.
CREATE OR REPLACE FUNCTION public.statutory_pack_snapshots_locked()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."content" IS DISTINCT FROM OLD."content" OR NEW."content_hash" IS DISTINCT FROM OLD."content_hash" THEN
    RAISE EXCEPTION 'An adopted statutory statements pack cannot be changed.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "statutory_pack_snapshots_locked" ON "statutory_pack_snapshots";
CREATE TRIGGER "statutory_pack_snapshots_locked" BEFORE UPDATE ON "statutory_pack_snapshots"
  FOR EACH ROW EXECUTE FUNCTION public.statutory_pack_snapshots_locked();
