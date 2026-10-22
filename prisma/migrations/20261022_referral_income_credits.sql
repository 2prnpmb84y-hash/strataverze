-- Platform billing Stage 5: insurance referral income and scheme credits
-- Idempotent: safe to re-run. Hand-applied via the Supabase SQL editor.
--
-- referral_income records commission a broker or underwriter partner pays
-- StrataVerze on a scheme's policy. Recorded only: StrataVerze does not quote,
-- compare or place insurance. Shown in dollars to the scheme when the
-- PLATFORM_REFERRAL_INCOME feature flag is on.
--
-- scheme_credit_balances, credit_transactions and credit_rate_cards are the
-- credit (token) data model only. No action consumes credits yet. Credits
-- never expire while the scheme is active and only ever pay StrataVerze
-- charges, so a consumption must name the fee event it pays.
--
-- RLS: the scheme's owners, committee, advisers and accountants (and platform
-- admins) can read their scheme's rows; any signed-in user can read the rate
-- card. No write policies: the application writes through its own connection.

-- ─── referral_income ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "referral_income" (
  "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "scheme_id"           uuid NOT NULL REFERENCES "schemes"("id") ON DELETE RESTRICT,
  "insurance_policy_id" uuid REFERENCES "insurance_policies"("id") ON DELETE SET NULL,
  "partner_name"        text NOT NULL,
  "amount"              numeric(12,2) NOT NULL CHECK ("amount" >= 0),
  "received_at"         date NOT NULL,
  "disclosed_at"        timestamptz NOT NULL DEFAULT now(),
  "disclosure_text"     text NOT NULL,
  "notes"               text,
  "recorded_by_id"      uuid REFERENCES "profiles"("id"),
  "created_at"          timestamptz NOT NULL DEFAULT now(),
  "updated_at"          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "referral_income_scheme_id_received_at_idx" ON "referral_income" ("scheme_id", "received_at");
CREATE INDEX IF NOT EXISTS "referral_income_insurance_policy_id_idx" ON "referral_income" ("insurance_policy_id");
ALTER TABLE "referral_income" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "referral_income_select" ON "referral_income";
CREATE POLICY "referral_income_select" ON "referral_income"
  FOR SELECT TO authenticated USING (public.can_view_scheme_billing("scheme_id"));

-- ─── scheme_credit_balances ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "scheme_credit_balances" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "scheme_id"  uuid NOT NULL UNIQUE REFERENCES "schemes"("id") ON DELETE RESTRICT,
  "balance"    integer NOT NULL DEFAULT 0 CHECK ("balance" >= 0),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE "scheme_credit_balances" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "scheme_credit_balances_select" ON "scheme_credit_balances";
CREATE POLICY "scheme_credit_balances_select" ON "scheme_credit_balances"
  FOR SELECT TO authenticated USING (public.can_view_scheme_billing("scheme_id"));

-- ─── credit_transactions ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "credit_transactions" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "scheme_id"       uuid NOT NULL REFERENCES "schemes"("id") ON DELETE RESTRICT,
  "type"            text NOT NULL CHECK ("type" IN ('PURCHASE','ALLOCATION','CONSUMPTION','ADJUSTMENT','REFUND')),
  "credits"         integer NOT NULL CHECK ("credits" <> 0),
  "fee_event_id"    uuid REFERENCES "platform_fee_events"("id"),
  "refund_of_id"    uuid REFERENCES "credit_transactions"("id"),
  "rate_card_id"    uuid,
  "amount_paid"     numeric(12,2),
  "reason"          text,
  "created_by_id"   uuid REFERENCES "profiles"("id"),
  "idempotency_key" text NOT NULL UNIQUE,
  "created_at"      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "credit_transactions_sign_check" CHECK (
    ("type" IN ('PURCHASE','ALLOCATION','REFUND') AND "credits" > 0)
    OR ("type" = 'CONSUMPTION' AND "credits" < 0 AND "fee_event_id" IS NOT NULL)
    OR ("type" = 'ADJUSTMENT')
  ),
  CONSTRAINT "credit_transactions_refund_check" CHECK ("type" <> 'REFUND' OR "refund_of_id" IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS "credit_transactions_scheme_id_created_at_idx" ON "credit_transactions" ("scheme_id", "created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "credit_transactions_one_consumption_per_fee_idx"
  ON "credit_transactions" ("fee_event_id") WHERE "type" = 'CONSUMPTION';
ALTER TABLE "credit_transactions" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "credit_transactions_select" ON "credit_transactions";
CREATE POLICY "credit_transactions_select" ON "credit_transactions"
  FOR SELECT TO authenticated USING (public.can_view_scheme_billing("scheme_id"));

-- ─── credit_rate_cards ──────────────────────────────────────────────────────
-- No packs are seeded: prices are set by StrataVerze before credits launch.
CREATE TABLE IF NOT EXISTS "credit_rate_cards" (
  "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "code"           text NOT NULL,
  "description"    text NOT NULL,
  "credits"        integer NOT NULL CHECK ("credits" > 0),
  "price"          numeric(12,2) NOT NULL CHECK ("price" >= 0),
  "gst_inclusive"  boolean NOT NULL DEFAULT false,
  "effective_from" date NOT NULL,
  "effective_to"   date,
  "is_active"      boolean NOT NULL DEFAULT true,
  "created_at"     timestamptz NOT NULL DEFAULT now(),
  "updated_at"     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "credit_rate_cards_code_is_active_idx" ON "credit_rate_cards" ("code", "is_active");
ALTER TABLE "credit_rate_cards" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "credit_rate_cards_select" ON "credit_rate_cards";
CREATE POLICY "credit_rate_cards_select" ON "credit_rate_cards"
  FOR SELECT TO authenticated USING (true);
