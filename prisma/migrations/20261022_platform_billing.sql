-- Platform billing foundation (Stage 1)
-- Idempotent: safe to re-run. Hand-applied via the Supabase SQL editor because
-- the build container cannot reach the database directly.
--
-- Records every StrataVerze charge to a scheme: the price book, scheme
-- subscriptions, fee events and monthly platform invoices. Prices are flat
-- amounts in the price book (never percentages, never in code). Amounts
-- exclude GST unless gst_inclusive is true.
--
-- RLS: owners, committee, advisers and accountants of a scheme can read that
-- scheme's billing rows; suppliers cannot; platform admins can read all. There
-- are no write policies: the application writes through its own connection.

-- ─── 1. Platform admin flag ─────────────────────────────────────────────────
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "is_platform_admin" boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE auth_id = auth.uid() AND is_platform_admin = true
  );
$$;

-- Owners, committee, advisers and accountants of the scheme (not suppliers),
-- or a platform admin.
CREATE OR REPLACE FUNCTION public.can_view_scheme_billing(p_scheme_id uuid)
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
      AND sm.role IN ('OWNER'::"PortalRole", 'COMMITTEE'::"PortalRole", 'ADVISER'::"PortalRole", 'ACCOUNTANT'::"PortalRole")
  );
$$;

-- ─── 2. platform_price_book ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "platform_price_book" (
  "id"                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "code"                   text NOT NULL,
  "variant"                text,
  "description"            text NOT NULL,
  "amount"                 numeric(12,2),
  "gst_inclusive"          boolean NOT NULL DEFAULT false,
  "unit"                   text NOT NULL CHECK ("unit" IN ('PER_EVENT','PER_MONTH','PER_YEAR','PER_SEAT_MONTH','PER_STEP','PER_NOTICE')),
  "payer_type"             text NOT NULL CHECK ("payer_type" IN ('OC','OWNER_VIA_OC','REQUESTING_PARTY','INCOMING_OWNER','DEVELOPER','SUPPLIER')),
  "effective_from"         date NOT NULL,
  "effective_to"           date,
  "is_active"              boolean NOT NULL DEFAULT true,
  "recoverable_from_owner" boolean NOT NULL DEFAULT false,
  "band_min"               integer,
  "band_max"               integer,
  "notes"                  text,
  "created_at"             timestamptz NOT NULL DEFAULT now(),
  "updated_at"             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "platform_price_book_amount_not_negative" CHECK ("amount" IS NULL OR "amount" >= 0),
  CONSTRAINT "platform_price_book_dates" CHECK ("effective_to" IS NULL OR "effective_to" > "effective_from"),
  CONSTRAINT "platform_price_book_band" CHECK ("band_min" IS NULL OR "band_max" IS NULL OR "band_min" <= "band_max")
);
CREATE INDEX IF NOT EXISTS "platform_price_book_code_is_active_idx" ON "platform_price_book" ("code", "is_active");
CREATE UNIQUE INDEX IF NOT EXISTS "platform_price_book_row_key"
  ON "platform_price_book" ("code", COALESCE("variant", ''), "effective_from", COALESCE("band_min", -1));
ALTER TABLE "platform_price_book" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "platform_price_book_select" ON "platform_price_book";
CREATE POLICY "platform_price_book_select" ON "platform_price_book"
  FOR SELECT TO authenticated USING ("is_active" OR public.is_platform_admin());

-- ─── 3. scheme_subscriptions ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "scheme_subscriptions" (
  "id"                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "scheme_id"                 uuid NOT NULL UNIQUE REFERENCES "schemes"("id") ON DELETE CASCADE,
  "tier"                      text NOT NULL CHECK ("tier" IN ('SMALL','MEDIUM','LARGE','ENTERPRISE')),
  "monthly_price"             numeric(12,2),
  "status"                    text NOT NULL DEFAULT 'PROMOTIONAL' CHECK ("status" IN ('PROMOTIONAL','ACTIVE','PAST_DUE','CANCELLED')),
  "promotion_end"             date,
  "current_period_start"      date,
  "current_period_end"        date,
  "lot_count_at_period_start" integer,
  "created_at"                timestamptz NOT NULL DEFAULT now(),
  "updated_at"                timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE "scheme_subscriptions" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "scheme_subscriptions_select" ON "scheme_subscriptions";
CREATE POLICY "scheme_subscriptions_select" ON "scheme_subscriptions"
  FOR SELECT TO authenticated USING (public.can_view_scheme_billing("scheme_id"));

-- ─── 4. platform_invoices ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "platform_invoices" (
  "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "scheme_id"           uuid NOT NULL REFERENCES "schemes"("id") ON DELETE RESTRICT,
  "invoice_number"      text NOT NULL UNIQUE,
  "period_start"        date NOT NULL,
  "period_end"          date NOT NULL,
  "subtotal"            numeric(12,2) NOT NULL,
  "gst"                 numeric(12,2) NOT NULL,
  "total"               numeric(12,2) NOT NULL,
  "status"              text NOT NULL DEFAULT 'DRAFT' CHECK ("status" IN ('DRAFT','ISSUED','APPROVED','PAID','CANCELLED')),
  "supplier_invoice_id" uuid,
  "pdf_document_id"     uuid,
  "issued_at"           timestamptz,
  "created_at"          timestamptz NOT NULL DEFAULT now(),
  "updated_at"          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "platform_invoices_scheme_period_key" UNIQUE ("scheme_id", "period_start")
);
ALTER TABLE "platform_invoices" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "platform_invoices_select" ON "platform_invoices";
CREATE POLICY "platform_invoices_select" ON "platform_invoices"
  FOR SELECT TO authenticated USING (public.can_view_scheme_billing("scheme_id"));

-- ─── 5. platform_fee_events ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "platform_fee_events" (
  "id"                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "scheme_id"              uuid NOT NULL REFERENCES "schemes"("id") ON DELETE RESTRICT,
  "code"                   text NOT NULL,
  "variant"                text,
  "description"            text NOT NULL,
  "source_type"            text NOT NULL,
  "source_id"              text NOT NULL,
  "quantity"               integer NOT NULL DEFAULT 1,
  "amount_ex_gst"          numeric(12,2) NOT NULL,
  "gst_amount"             numeric(12,2) NOT NULL,
  "payer_type"             text NOT NULL,
  "payer_profile_id"       uuid,
  "recoverable_from_owner" boolean NOT NULL DEFAULT false,
  "status"                 text NOT NULL DEFAULT 'ACCRUED' CHECK ("status" IN ('ACCRUED','INVOICED','EXTRACTED','WAIVED','REVERSED')),
  "reversal_of_id"         uuid REFERENCES "platform_fee_events"("id"),
  "disclosure_shown_to_id" uuid,
  "disclosure_shown_at"    timestamptz,
  "disclosed_amount"       numeric(12,2),
  "created_by_id"          uuid,
  "provider_item_id"       text,
  "invoice_id"             uuid REFERENCES "platform_invoices"("id"),
  "journal_entry_id"       uuid,
  "idempotency_key"        text NOT NULL UNIQUE,
  "occurred_at"            timestamptz NOT NULL DEFAULT now(),
  "created_at"             timestamptz NOT NULL DEFAULT now(),
  "updated_at"             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "platform_fee_events_scheme_id_status_idx" ON "platform_fee_events" ("scheme_id", "status");
CREATE INDEX IF NOT EXISTS "platform_fee_events_scheme_id_occurred_at_idx" ON "platform_fee_events" ("scheme_id", "occurred_at");
CREATE INDEX IF NOT EXISTS "platform_fee_events_source_idx" ON "platform_fee_events" ("source_type", "source_id");
ALTER TABLE "platform_fee_events" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "platform_fee_events_select" ON "platform_fee_events";
CREATE POLICY "platform_fee_events_select" ON "platform_fee_events"
  FOR SELECT TO authenticated USING (public.can_view_scheme_billing("scheme_id"));

-- ─── 6. Seed the price book ─────────────────────────────────────────────────
-- Prices from the platform billing brief, GST exclusive, effective 2026-01-01.
-- Bands are inclusive: money bands in cents, lot bands in lots.
-- Rows marked is_active = false are switched off until confirmed.
INSERT INTO "platform_price_book"
  ("code","variant","description","amount","gst_inclusive","unit","payer_type","effective_from","is_active","recoverable_from_owner","band_min","band_max","notes")
SELECT v.* FROM (VALUES
  ('SUBSCRIPTION_SMALL',  NULL, 'Scheme subscription, Small (up to 10 lots)',      49.00::numeric, false, 'PER_MONTH', 'OC', DATE '2026-01-01', true,  false, NULL::int, NULL::int, NULL::text),
  ('SUBSCRIPTION_MEDIUM', NULL, 'Scheme subscription, Medium (11 to 50 lots)',     149.00, false, 'PER_MONTH', 'OC', DATE '2026-01-01', true,  false, NULL, NULL, NULL),
  ('SUBSCRIPTION_LARGE',  NULL, 'Scheme subscription, Large (51 to 150 lots)',     349.00, false, 'PER_MONTH', 'OC', DATE '2026-01-01', true,  false, NULL, NULL, NULL),
  ('TXN_FEE',      NULL, 'Transaction service fee, payment under $500',            1.50, false, 'PER_EVENT', 'OC', DATE '2026-01-01', true,  false, 1,       49999,  'Band in cents'),
  ('TXN_FEE',      NULL, 'Transaction service fee, payment $500 to $5,000',        2.50, false, 'PER_EVENT', 'OC', DATE '2026-01-01', true,  false, 50000,   500000, 'Band in cents'),
  ('TXN_FEE',      NULL, 'Transaction service fee, payment over $5,000',           5.00, false, 'PER_EVENT', 'OC', DATE '2026-01-01', true,  false, 500001,  NULL,   'Band in cents'),
  ('TXN_FEE_FLAT', NULL, 'Transaction service fee, flat (pilot mode)',             2.50, false, 'PER_EVENT', 'OC', DATE '2026-01-01', true,  false, NULL, NULL, NULL),
  ('MEETING_EGM',  NULL, 'Extraordinary or adjourned general meeting, notice issued', 55.00, false, 'PER_EVENT', 'OC', DATE '2026-01-01', true, false, NULL, NULL, NULL),
  ('BALLOT',       NULL, 'Electronic ballot opened',                               25.00, false, 'PER_EVENT', 'OC', DATE '2026-01-01', true,  false, NULL, NULL, NULL),
  ('RECOVERY_STEP','REMINDER',     'Debt recovery step: reminder',                 15.00, false, 'PER_STEP', 'OWNER_VIA_OC', DATE '2026-01-01', true, true, NULL, NULL, 'Recoverable from the defaulting owner (SSMA s 86). Default, confirm.'),
  ('RECOVERY_STEP','FINAL_NOTICE', 'Debt recovery step: final notice',             30.00, false, 'PER_STEP', 'OWNER_VIA_OC', DATE '2026-01-01', true, true, NULL, NULL, 'Recoverable from the defaulting owner (SSMA s 86). Default, confirm.'),
  ('RECOVERY_STEP','PAYMENT_PLAN', 'Debt recovery step: payment plan set-up',      45.00, false, 'PER_STEP', 'OWNER_VIA_OC', DATE '2026-01-01', true, true, NULL, NULL, 'Recoverable from the defaulting owner (SSMA s 86). Default, confirm.'),
  ('RECOVERY_STEP','REFERRAL',     'Debt recovery step: referral',                 60.00, false, 'PER_STEP', 'OWNER_VIA_OC', DATE '2026-01-01', true, true, NULL, NULL, 'Recoverable from the defaulting owner (SSMA s 86). Default, confirm.'),
  ('S184_CERTIFICATE','INITIAL', 'Strata information certificate (prescribed fee)', 109.00, false, 'PER_EVENT', 'REQUESTING_PARTY', DATE '2026-01-01', false, false, NULL, NULL, 'Prescribed fee per SSMR 2016 Sch 4 item 3(a) as consolidated on AustLII. Verify the in-force amount and GST treatment before switching on.'),
  ('S184_CERTIFICATE','REPEAT',  'Strata information certificate within 3 months (prescribed fee)', 94.00, false, 'PER_EVENT', 'REQUESTING_PARTY', DATE '2026-01-01', false, false, NULL, NULL, 'Prescribed fee per SSMR 2016 Sch 4 item 3(b). Verify before switching on.'),
  ('S184_PLATFORM_SHARE', NULL,  'StrataVerze share of the strata information certificate fee', NULL, false, 'PER_EVENT', 'REQUESTING_PARTY', DATE '2026-01-01', false, false, NULL, NULL, 'Set the share before switching on.'),
  ('S182_INSPECTION','FIRST_HOUR',      'Records inspection, first hour (prescribed fee)', 31.00, false, 'PER_EVENT', 'REQUESTING_PARTY', DATE '2026-01-01', false, false, NULL, NULL, 'Prescribed fee per SSMR 2016 Sch 4 item 2. Verify before switching on.'),
  ('S182_INSPECTION','EXTRA_HALF_HOUR', 'Records inspection, each further half hour (prescribed fee)', 16.00, false, 'PER_EVENT', 'REQUESTING_PARTY', DATE '2026-01-01', false, false, NULL, NULL, 'Prescribed fee per SSMR 2016 Sch 4 item 2. Verify before switching on.'),
  ('TRANSFER',     NULL, 'Ownership change processed',                             60.00, false, 'PER_EVENT', 'INCOMING_OWNER', DATE '2026-01-01', true, false, NULL, NULL, 'Payer: incoming owner or OC. Confirm.'),
  ('YEAR_END_PACK',NULL, 'Year-end pack generated',                                250.00, false, 'PER_EVENT', 'OC', DATE '2026-01-01', true,  false, NULL, NULL, NULL),
  ('ACCOUNTANT_SEAT',NULL,'External accountant or auditor seat',                   20.00, false, 'PER_SEAT_MONTH', 'OC', DATE '2026-01-01', true, false, NULL, NULL, NULL),
  ('CLAIM_HANDLING',NULL, 'Insurance claim lodged',                                100.00, false, 'PER_EVENT', 'OC', DATE '2026-01-01', true,  false, NULL, NULL, NULL),
  ('WORKS_CONTRACT',NULL, 'Works contract executed, value up to $10,000',          150.00, false, 'PER_EVENT', 'OC', DATE '2026-01-01', true,  false, 0,       1000000, 'Band in cents. Default threshold, confirm.'),
  ('WORKS_CONTRACT',NULL, 'Works contract executed, value $10,000 to $50,000',     300.00, false, 'PER_EVENT', 'OC', DATE '2026-01-01', true,  false, 1000001, 5000000, 'Band in cents. Default threshold, confirm.'),
  ('WORKS_CONTRACT',NULL, 'Works contract executed, value over $50,000',           500.00, false, 'PER_EVENT', 'OC', DATE '2026-01-01', true,  false, 5000001, NULL,    'Band in cents. Default threshold, confirm.'),
  ('WORKS_VARIATION',NULL,'Works contract variation approved',                     25.00, false, 'PER_EVENT', 'OC', DATE '2026-01-01', true,  false, NULL, NULL, NULL),
  ('PAPER_NOTICE', NULL, 'Paper notice via mail house, margin on cost',            NULL, false, 'PER_NOTICE', 'OC', DATE '2026-01-01', false, false, NULL, NULL, 'Flat margin per notice. Set before the mail house integration.'),
  ('DEVELOPER_SETUP',NULL,'Developer scheme set-up, 1 to 10 lots',                1500.00, false, 'PER_EVENT', 'DEVELOPER', DATE '2026-01-01', true, false, 1,   10,   'Band in lots. Default, confirm.'),
  ('DEVELOPER_SETUP',NULL,'Developer scheme set-up, 11 to 50 lots',               2500.00, false, 'PER_EVENT', 'DEVELOPER', DATE '2026-01-01', true, false, 11,  50,   'Band in lots. Default, confirm.'),
  ('DEVELOPER_SETUP',NULL,'Developer scheme set-up, 51 to 150 lots',              3500.00, false, 'PER_EVENT', 'DEVELOPER', DATE '2026-01-01', true, false, 51,  150,  'Band in lots. Default, confirm.'),
  ('DEVELOPER_SETUP',NULL,'Developer scheme set-up, over 150 lots',               5000.00, false, 'PER_EVENT', 'DEVELOPER', DATE '2026-01-01', true, false, 151, NULL, 'Band in lots. Default, confirm.'),
  ('EDUCATION',    NULL, 'Committee education subscription',                       99.00, false, 'PER_YEAR', 'OC', DATE '2026-01-01', true,  false, NULL, NULL, NULL)
) AS v("code","variant","description","amount","gst_inclusive","unit","payer_type","effective_from","is_active","recoverable_from_owner","band_min","band_max","notes")
WHERE NOT EXISTS (
  SELECT 1 FROM "platform_price_book" p
  WHERE p."code" = v."code"
    AND COALESCE(p."variant", '') = COALESCE(v."variant", '')
    AND p."effective_from" = v."effective_from"
    AND COALESCE(p."band_min", -1) = COALESCE(v."band_min", -1)
);
