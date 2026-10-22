-- Platform billing Stage 4: supplier (contractor) billing
-- Idempotent: safe to re-run. Hand-applied via the Supabase SQL editor because
-- the build container cannot reach the database directly.
--
-- 1. The contractor plan drops to $8.00 a month (GST inclusive flag unchanged).
--    Existing memberships still on the old $65.00 price move to $8.00 too.
-- 2. The fee ledger can hold charges to a contractor business, which belong
--    to no scheme. Every fee event belongs to a scheme or a contractor.
-- 3. Contractors can read their own business's fee events. Scheme rows keep
--    the existing scheme billing rule. Platform admins can read all.
-- 4. Price book rows for the contractor plan and the annual compliance
--    verification charge.

-- ─── 1. Contractor plan price ───────────────────────────────────────────────
ALTER TABLE "contractor_memberships" ALTER COLUMN "plan_monthly_price" SET DEFAULT 8.00;
UPDATE "contractor_memberships" SET "plan_monthly_price" = 8.00 WHERE "plan_monthly_price" = 65.00;

-- ─── 2. Contractor fee events ───────────────────────────────────────────────
ALTER TABLE "platform_fee_events" ALTER COLUMN "scheme_id" DROP NOT NULL;
ALTER TABLE "platform_fee_events" ADD COLUMN IF NOT EXISTS "contractor_business_id" uuid
  REFERENCES "contractor_businesses"("id") ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS "platform_fee_events_contractor_business_id_idx"
  ON "platform_fee_events" ("contractor_business_id", "occurred_at");

ALTER TABLE "platform_fee_events" DROP CONSTRAINT IF EXISTS "platform_fee_events_payer_scope_check";
ALTER TABLE "platform_fee_events" ADD CONSTRAINT "platform_fee_events_payer_scope_check"
  CHECK ("scheme_id" IS NOT NULL OR "contractor_business_id" IS NOT NULL);

-- ─── 3. Who can read contractor billing ─────────────────────────────────────
-- Active contacts of the contractor business (the existing
-- is_contractor_contact helper from the contractor RLS migration), or a
-- platform admin.
CREATE OR REPLACE FUNCTION public.can_view_contractor_billing(p_contractor_business_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_platform_admin() OR public.is_contractor_contact(p_contractor_business_id);
$$;

DROP POLICY IF EXISTS "platform_fee_events_select" ON "platform_fee_events";
CREATE POLICY "platform_fee_events_select" ON "platform_fee_events"
  FOR SELECT TO authenticated USING (
    ("scheme_id" IS NOT NULL AND public.can_view_scheme_billing("scheme_id"))
    OR ("contractor_business_id" IS NOT NULL AND public.can_view_contractor_billing("contractor_business_id"))
  );

-- ─── 4. Price book ──────────────────────────────────────────────────────────
INSERT INTO "platform_price_book"
  ("code","variant","description","amount","gst_inclusive","unit","payer_type","effective_from","is_active","recoverable_from_owner","band_min","band_max","notes")
SELECT v.* FROM (VALUES
  ('SUPPLIER_PLAN', NULL::text, 'StrataVerze Contractor plan', 8.00::numeric, true, 'PER_MONTH', 'SUPPLIER', DATE '2026-01-01', true, false, NULL::int, NULL::int, 'GST inclusive. Billed once a payment provider exists; free during the contractor promotion.'::text),
  ('COMPLIANCE_VERIFICATION', NULL, 'Compliance verification (licence, insurance and ABN), annual', 49.00, false, 'PER_YEAR', 'SUPPLIER', DATE '2026-01-01', true, false, NULL, NULL, 'GST exclusive. Charged when the contractor application is approved, then each year.')
) AS v("code","variant","description","amount","gst_inclusive","unit","payer_type","effective_from","is_active","recoverable_from_owner","band_min","band_max","notes")
WHERE NOT EXISTS (
  SELECT 1 FROM "platform_price_book" p
  WHERE p."code" = v."code"
    AND COALESCE(p."variant", '') = COALESCE(v."variant", '')
    AND p."effective_from" = v."effective_from"
    AND COALESCE(p."band_min", -1) = COALESCE(v."band_min", -1)
);
