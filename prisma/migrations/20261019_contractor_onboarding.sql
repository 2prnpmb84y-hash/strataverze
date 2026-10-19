-- StrataVerze Contractor Onboarding Module Migration
-- Adds tables for contractor self-service registration, ABN lookup,
-- membership/billing, declarations and admin review queue.

-- ─── Contractor Onboarding Tracker ──────────────────────────────────

CREATE TABLE IF NOT EXISTS "contractor_onboardings" (
  "id"                      UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  "contractor_business_id"  UUID NOT NULL UNIQUE REFERENCES "contractor_businesses"("id") ON DELETE CASCADE,
  "status"                  TEXT NOT NULL DEFAULT 'DRAFT',
  "current_step"            INTEGER NOT NULL DEFAULT 1,
  "step_account_complete"   BOOLEAN NOT NULL DEFAULT false,
  "step_business_complete"  BOOLEAN NOT NULL DEFAULT false,
  "step_services_complete"  BOOLEAN NOT NULL DEFAULT false,
  "step_licences_complete"  BOOLEAN NOT NULL DEFAULT false,
  "step_insurance_complete" BOOLEAN NOT NULL DEFAULT false,
  "step_banking_complete"   BOOLEAN NOT NULL DEFAULT false,
  "step_membership_complete" BOOLEAN NOT NULL DEFAULT false,
  "step_review_complete"    BOOLEAN NOT NULL DEFAULT false,
  "submitted_at"            TIMESTAMPTZ,
  "reviewed_at"             TIMESTAMPTZ,
  "review_notes"            TEXT,
  "created_at"              TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "contractor_onboardings_status_idx"
  ON "contractor_onboardings"("status");

-- ─── ABN Lookup Records ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "abn_lookup_records" (
  "id"                      UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  "contractor_business_id"  UUID NOT NULL REFERENCES "contractor_businesses"("id") ON DELETE CASCADE,
  "abn"                     VARCHAR(11) NOT NULL,
  "entity_name"             VARCHAR(500),
  "entity_type"             VARCHAR(200),
  "abn_status"              VARCHAR(50),
  "abn_status_from_date"    DATE,
  "gst_status"              VARCHAR(50),
  "gst_status_from_date"    DATE,
  "business_names"          TEXT[] DEFAULT '{}',
  "location_state"          VARCHAR(3),
  "location_postcode"       VARCHAR(4),
  "lookup_status"           TEXT NOT NULL DEFAULT 'PENDING',
  "lookup_timestamp"        TIMESTAMPTZ NOT NULL,
  "raw_response"            JSONB,
  "error_message"           TEXT,
  "performed_by_id"         UUID REFERENCES "profiles"("id"),
  "created_at"              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "abn_lookup_records_contractor_idx"
  ON "abn_lookup_records"("contractor_business_id");
CREATE INDEX IF NOT EXISTS "abn_lookup_records_abn_idx"
  ON "abn_lookup_records"("abn");

-- ─── Contractor Membership & Billing ────────────────────────────────

CREATE TABLE IF NOT EXISTS "contractor_memberships" (
  "id"                         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  "contractor_business_id"     UUID NOT NULL UNIQUE REFERENCES "contractor_businesses"("id") ON DELETE CASCADE,
  "promotion_id"               VARCHAR(100),
  "promotion_start"            TIMESTAMPTZ,
  "promotion_end"              TIMESTAMPTZ,
  "terms_version"              VARCHAR(50),
  "accepted_by_id"             UUID REFERENCES "profiles"("id"),
  "accepted_at"                TIMESTAMPTZ,
  "paid_activation_status"     TEXT NOT NULL DEFAULT 'NOT_ACTIVATED',
  "billing_start"              TIMESTAMPTZ,
  "subscription_status"        TEXT NOT NULL DEFAULT 'PROMOTIONAL',
  "provider_customer_id"       VARCHAR(200),
  "provider_subscription_id"   VARCHAR(200),
  "provider_price_id"          VARCHAR(200),
  "payment_method_summary"     VARCHAR(100),
  "current_period_start"       TIMESTAMPTZ,
  "current_period_end"         TIMESTAMPTZ,
  "next_renewal_date"          TIMESTAMPTZ,
  "cancelled_at"               TIMESTAMPTZ,
  "cancellation_effective"     TIMESTAMPTZ,
  "last_payment_failure"       TIMESTAMPTZ,
  "last_payment_failure_reason" TEXT,
  "plan_name"                  VARCHAR(200) NOT NULL DEFAULT 'StrataVerze Contractor',
  "plan_currency"              VARCHAR(3) NOT NULL DEFAULT 'AUD',
  "plan_monthly_price"         DECIMAL(10, 2) NOT NULL DEFAULT 65.00,
  "plan_gst_inclusive"         BOOLEAN NOT NULL DEFAULT true,
  "billing_timezone"           VARCHAR(100) NOT NULL DEFAULT 'Australia/Sydney',
  "created_at"                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "contractor_memberships_status_idx"
  ON "contractor_memberships"("subscription_status");

-- ─── Contractor Declarations ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "contractor_declarations" (
  "id"                      UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  "contractor_business_id"  UUID NOT NULL REFERENCES "contractor_businesses"("id") ON DELETE CASCADE,
  "declaration_type"        TEXT NOT NULL,
  "document_version"        VARCHAR(50) NOT NULL,
  "accepted"                BOOLEAN NOT NULL DEFAULT false,
  "accepted_at"             TIMESTAMPTZ,
  "accepted_by_id"          UUID REFERENCES "profiles"("id"),
  "ip_address"              VARCHAR(45),
  "created_at"              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "contractor_declarations_contractor_idx"
  ON "contractor_declarations"("contractor_business_id");
CREATE INDEX IF NOT EXISTS "contractor_declarations_type_idx"
  ON "contractor_declarations"("declaration_type");

-- ─── Contractor Review Queue ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "contractor_review_items" (
  "id"                       UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  "contractor_business_id"   UUID NOT NULL REFERENCES "contractor_businesses"("id") ON DELETE CASCADE,
  "queue_type"               TEXT NOT NULL,
  "status"                   TEXT NOT NULL DEFAULT 'PENDING',
  "assigned_to_id"           UUID REFERENCES "profiles"("id"),
  "entity_type"              VARCHAR(100),
  "entity_id"                UUID,
  "priority"                 TEXT NOT NULL DEFAULT 'NORMAL',
  "notes"                    TEXT,
  "clarification_request"    TEXT,
  "clarification_response"   TEXT,
  "evidence"                 TEXT,
  "outcome"                  VARCHAR(100),
  "outcome_notes"            TEXT,
  "completed_by_id"          UUID REFERENCES "profiles"("id"),
  "review_date"              DATE,
  "completed_at"             TIMESTAMPTZ,
  "created_at"               TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "contractor_review_items_contractor_idx"
  ON "contractor_review_items"("contractor_business_id");
CREATE INDEX IF NOT EXISTS "contractor_review_items_queue_status_idx"
  ON "contractor_review_items"("queue_type", "status");
CREATE INDEX IF NOT EXISTS "contractor_review_items_assigned_idx"
  ON "contractor_review_items"("assigned_to_id");

-- ─── RLS Policies ───────────────────────────────────────────────────

ALTER TABLE "contractor_onboardings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "abn_lookup_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "contractor_memberships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "contractor_declarations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "contractor_review_items" ENABLE ROW LEVEL SECURITY;

-- Contractor users can read/write their own onboarding data
CREATE POLICY "contractor_onboardings_own" ON "contractor_onboardings"
  FOR ALL USING (
    "contractor_business_id" IN (
      SELECT cb."id" FROM "contractor_businesses" cb
      JOIN "profiles" p ON p."id" = cb."primary_contact_id"
      WHERE p."auth_id" = auth.uid()
    )
  );

CREATE POLICY "abn_lookup_records_own" ON "abn_lookup_records"
  FOR ALL USING (
    "contractor_business_id" IN (
      SELECT cb."id" FROM "contractor_businesses" cb
      JOIN "profiles" p ON p."id" = cb."primary_contact_id"
      WHERE p."auth_id" = auth.uid()
    )
  );

CREATE POLICY "contractor_memberships_own" ON "contractor_memberships"
  FOR ALL USING (
    "contractor_business_id" IN (
      SELECT cb."id" FROM "contractor_businesses" cb
      JOIN "profiles" p ON p."id" = cb."primary_contact_id"
      WHERE p."auth_id" = auth.uid()
    )
  );

CREATE POLICY "contractor_declarations_own" ON "contractor_declarations"
  FOR ALL USING (
    "contractor_business_id" IN (
      SELECT cb."id" FROM "contractor_businesses" cb
      JOIN "profiles" p ON p."id" = cb."primary_contact_id"
      WHERE p."auth_id" = auth.uid()
    )
  );

-- Review items are read-only for contractors (admins manage via service role)
CREATE POLICY "contractor_review_items_own_read" ON "contractor_review_items"
  FOR SELECT USING (
    "contractor_business_id" IN (
      SELECT cb."id" FROM "contractor_businesses" cb
      JOIN "profiles" p ON p."id" = cb."primary_contact_id"
      WHERE p."auth_id" = auth.uid()
    )
  );

-- Adviser/admin access to review items (scheme membership based)
CREATE POLICY "contractor_review_items_adviser" ON "contractor_review_items"
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM "scheme_memberships" sm
      JOIN "profiles" p ON p."id" = sm."profile_id"
      WHERE p."auth_id" = auth.uid()
        AND sm."role" IN ('ADVISER', 'COMMITTEE', 'STRATA_MANAGER', 'BUILDING_MANAGER', 'COMPLIANCE_REVIEWER')
    )
  );
