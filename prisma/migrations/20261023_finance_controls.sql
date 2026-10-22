-- Finance hardening Stage 1: payment controls
-- Idempotent: safe to re-run. Hand-applied via the Supabase SQL editor because
-- the build container cannot reach the database directly.
--
-- 1. Treasurer flag on committee memberships.
-- 2. Scheme payment policy: approval thresholds, single approver exception,
--    adviser approval (off by default) and the bank change cooling-off period.
-- 3. Payment authorisations: one row per approver per invoice (supplier or
--    works invoice), at most two, never the same person twice.
-- 4. Who prepared each supplier invoice, so they cannot also approve it.
-- 5. Supplier bank detail versions: every change is recorded and must be
--    verified by someone other than the person who made it.
--
-- RLS: advisers, committee, accountants and payment authorisers of the scheme
-- (and platform admins) can read these rows. Owners cannot see bank details.
-- No write policies: the application writes through its own connection.

-- ─── 1. Treasurer flag ──────────────────────────────────────────────────────
ALTER TABLE "scheme_memberships" ADD COLUMN IF NOT EXISTS "is_treasurer" boolean NOT NULL DEFAULT false;

-- Finance readers for a scheme.
CREATE OR REPLACE FUNCTION public.can_view_scheme_finance_controls(p_scheme_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_platform_admin() OR EXISTS (
    SELECT 1
    FROM scheme_memberships sm
    JOIN profiles p ON p.id = sm.profile_id
    WHERE sm.scheme_id = p_scheme_id
      AND p.auth_id = auth.uid()
      AND sm.is_active = true
      AND sm.role IN ('ADVISER'::"PortalRole", 'COMMITTEE'::"PortalRole", 'ACCOUNTANT'::"PortalRole", 'PAYMENT_AUTHORISER'::"PortalRole")
  );
$$;

-- ─── 2. scheme_payment_policies ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "scheme_payment_policies" (
  "id"                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "scheme_id"                     uuid NOT NULL UNIQUE REFERENCES "schemes"("id") ON DELETE CASCADE,
  "single_approver_limit"         numeric(12,2) NOT NULL DEFAULT 0 CHECK ("single_approver_limit" >= 0),
  "require_second_approver_above" numeric(12,2) CHECK ("require_second_approver_above" >= 0),
  "allow_self_approval"           boolean NOT NULL DEFAULT false,
  "allow_adviser_approval"        boolean NOT NULL DEFAULT false,
  "bank_change_cooling_off_days"  integer NOT NULL DEFAULT 5 CHECK ("bank_change_cooling_off_days" BETWEEN 0 AND 30),
  "updated_by"                    uuid REFERENCES "profiles"("id"),
  "created_at"                    timestamptz NOT NULL DEFAULT now(),
  "updated_at"                    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE "scheme_payment_policies" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "scheme_payment_policies_select" ON "scheme_payment_policies";
CREATE POLICY "scheme_payment_policies_select" ON "scheme_payment_policies"
  FOR SELECT TO authenticated USING (public.can_view_scheme_finance_controls("scheme_id"));

-- ─── 3. payment_authorisations ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "payment_authorisations" (
  "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "scheme_id"           uuid NOT NULL REFERENCES "schemes"("id") ON DELETE CASCADE,
  "supplier_invoice_id" uuid REFERENCES "supplier_invoices"("id") ON DELETE CASCADE,
  "works_invoice_id"    uuid REFERENCES "works_invoices"("id") ON DELETE CASCADE,
  "approver_id"         uuid NOT NULL REFERENCES "profiles"("id"),
  "role"                text NOT NULL,
  "approved_at"         timestamptz NOT NULL DEFAULT now(),
  "ip_hash"             text,
  "sequence"            integer NOT NULL CHECK ("sequence" IN (1, 2)),
  "is_exception"        boolean NOT NULL DEFAULT false,
  "exception_reason"    text,
  "created_at"          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "payment_authorisations_one_invoice_check"
    CHECK (("supplier_invoice_id" IS NOT NULL) <> ("works_invoice_id" IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS "payment_authorisations_supplier_approver_idx"
  ON "payment_authorisations" ("supplier_invoice_id", "approver_id") WHERE "supplier_invoice_id" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "payment_authorisations_supplier_sequence_idx"
  ON "payment_authorisations" ("supplier_invoice_id", "sequence") WHERE "supplier_invoice_id" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "payment_authorisations_works_approver_idx"
  ON "payment_authorisations" ("works_invoice_id", "approver_id") WHERE "works_invoice_id" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "payment_authorisations_works_sequence_idx"
  ON "payment_authorisations" ("works_invoice_id", "sequence") WHERE "works_invoice_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "payment_authorisations_scheme_id_idx" ON "payment_authorisations" ("scheme_id");
ALTER TABLE "payment_authorisations" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "payment_authorisations_select" ON "payment_authorisations";
CREATE POLICY "payment_authorisations_select" ON "payment_authorisations"
  FOR SELECT TO authenticated USING (public.can_view_scheme_finance_controls("scheme_id"));

-- ─── 4. Invoice preparer ────────────────────────────────────────────────────
ALTER TABLE "supplier_invoices" ADD COLUMN IF NOT EXISTS "prepared_by_id" uuid REFERENCES "profiles"("id");

-- ─── 5. supplier_bank_detail_versions ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS "supplier_bank_detail_versions" (
  "id"                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "supplier_id"             uuid NOT NULL REFERENCES "suppliers"("id") ON DELETE CASCADE,
  "scheme_id"               uuid REFERENCES "schemes"("id") ON DELETE CASCADE,
  "previous_bsb"            varchar(7),
  "previous_account_number" varchar(20),
  "previous_account_name"   varchar(200),
  "new_bsb"                 varchar(7),
  "new_account_number"      varchar(20),
  "new_account_name"        varchar(200),
  "changed_by"              uuid NOT NULL REFERENCES "profiles"("id"),
  "changed_at"              timestamptz NOT NULL DEFAULT now(),
  "verified_by"             uuid REFERENCES "profiles"("id"),
  "verified_at"             timestamptz,
  "verification_method"     text CHECK ("verification_method" IN ('CALLBACK','SUPPLIER_PORTAL_CONFIRMED','DOCUMENT')),
  "second_verified_by"      uuid REFERENCES "profiles"("id"),
  "second_verified_at"      timestamptz,
  "second_verification_method" text CHECK ("second_verification_method" IN ('CALLBACK','SUPPLIER_PORTAL_CONFIRMED','DOCUMENT')),
  "status"                  text NOT NULL DEFAULT 'PENDING' CHECK ("status" IN ('PENDING','VERIFIED','REJECTED')),
  "rejection_reason"        text,
  "created_at"              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "supplier_bank_detail_versions_verifier_check"
    CHECK ("verified_by" IS NULL OR "verified_by" <> "changed_by"),
  CONSTRAINT "supplier_bank_detail_versions_second_verifier_check"
    CHECK ("second_verified_by" IS NULL OR ("second_verified_by" <> "changed_by" AND "second_verified_by" <> "verified_by"))
);
CREATE INDEX IF NOT EXISTS "supplier_bank_detail_versions_supplier_idx"
  ON "supplier_bank_detail_versions" ("supplier_id", "changed_at");
ALTER TABLE "supplier_bank_detail_versions" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "supplier_bank_detail_versions_select" ON "supplier_bank_detail_versions";
CREATE POLICY "supplier_bank_detail_versions_select" ON "supplier_bank_detail_versions"
  FOR SELECT TO authenticated USING (
    "scheme_id" IS NOT NULL AND public.can_view_scheme_finance_controls("scheme_id")
  );
