-- StrataVerze Works Module Migration
-- Adds Organisation layer, extended PortalRole values, and all Works tables
-- for the full procurement and works-management lifecycle.

-- ─── Extended PortalRole enum values ────────────────────────────────
ALTER TYPE "PortalRole" ADD VALUE IF NOT EXISTS 'ORG_ADMIN';
ALTER TYPE "PortalRole" ADD VALUE IF NOT EXISTS 'STRATA_MANAGER';
ALTER TYPE "PortalRole" ADD VALUE IF NOT EXISTS 'BUILDING_MANAGER';
ALTER TYPE "PortalRole" ADD VALUE IF NOT EXISTS 'COMPLIANCE_REVIEWER';
ALTER TYPE "PortalRole" ADD VALUE IF NOT EXISTS 'CONTRACTOR_ADMIN';
ALTER TYPE "PortalRole" ADD VALUE IF NOT EXISTS 'ACCOUNTS_OFFICER';
ALTER TYPE "PortalRole" ADD VALUE IF NOT EXISTS 'PAYMENT_AUTHORISER';
ALTER TYPE "PortalRole" ADD VALUE IF NOT EXISTS 'AUDITOR';

-- ─── Organisation Layer ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "organisations" (
  "id"           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  "name"         VARCHAR(300) NOT NULL,
  "trading_name" VARCHAR(300),
  "abn"          VARCHAR(11),
  "acn"          VARCHAR(9),
  "phone"        VARCHAR(20),
  "email"        VARCHAR(320),
  "address"      TEXT,
  "suburb"       TEXT,
  "state"        TEXT DEFAULT 'VIC',
  "postcode"     VARCHAR(10),
  "logo_url"     TEXT,
  "is_active"    BOOLEAN NOT NULL DEFAULT true,
  "created_at"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "deleted_at"   TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS "organisation_memberships" (
  "id"              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  "organisation_id" UUID NOT NULL REFERENCES "organisations"("id") ON DELETE CASCADE,
  "profile_id"      UUID NOT NULL REFERENCES "profiles"("id") ON DELETE CASCADE,
  "role"            "PortalRole" NOT NULL,
  "is_active"       BOOLEAN NOT NULL DEFAULT true,
  "start_date"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  "end_date"        TIMESTAMPTZ,
  "created_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("organisation_id", "profile_id", "role")
);

-- Add organisation_id to schemes
ALTER TABLE "schemes" ADD COLUMN IF NOT EXISTS "organisation_id" UUID REFERENCES "organisations"("id");

-- ─── Works Module: Configuration ────────────────────────────────────

CREATE TABLE IF NOT EXISTS "works_categories" (
  "id"         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  "scheme_id"  UUID REFERENCES "schemes"("id") ON DELETE CASCADE,
  "org_id"     UUID REFERENCES "organisations"("id") ON DELETE CASCADE,
  "name"       VARCHAR(200) NOT NULL,
  "code"       VARCHAR(20),
  "description" TEXT,
  "parent_id"  UUID REFERENCES "works_categories"("id"),
  "is_active"  BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "works_categories_scheme_id_idx" ON "works_categories"("scheme_id");
CREATE INDEX IF NOT EXISTS "works_categories_org_id_idx" ON "works_categories"("org_id");

CREATE TABLE IF NOT EXISTS "works_approval_routes" (
  "id"                 UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  "scheme_id"          UUID REFERENCES "schemes"("id") ON DELETE CASCADE,
  "org_id"             UUID REFERENCES "organisations"("id") ON DELETE CASCADE,
  "name"               VARCHAR(200) NOT NULL,
  "description"        TEXT,
  "min_amount"         DECIMAL(12,2),
  "max_amount"         DECIMAL(12,2),
  "required_approvers" INTEGER NOT NULL DEFAULT 1,
  "approver_roles"     TEXT[] NOT NULL,
  "is_active"          BOOLEAN NOT NULL DEFAULT true,
  "sort_order"         INTEGER NOT NULL DEFAULT 0,
  "created_at"         TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "works_approval_routes_scheme_id_idx" ON "works_approval_routes"("scheme_id");
CREATE INDEX IF NOT EXISTS "works_approval_routes_org_id_idx" ON "works_approval_routes"("org_id");

CREATE TABLE IF NOT EXISTS "works_delegations" (
  "id"              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  "scheme_id"       UUID NOT NULL REFERENCES "schemes"("id") ON DELETE CASCADE,
  "delegated_by_id" UUID NOT NULL REFERENCES "profiles"("id"),
  "delegated_to_id" UUID NOT NULL REFERENCES "profiles"("id"),
  "authority_type"  TEXT NOT NULL,
  "max_amount"      DECIMAL(12,2),
  "start_date"      TIMESTAMPTZ NOT NULL,
  "end_date"        TIMESTAMPTZ,
  "conditions"      TEXT,
  "is_active"       BOOLEAN NOT NULL DEFAULT true,
  "created_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "works_delegations_scheme_delegated_idx" ON "works_delegations"("scheme_id", "delegated_to_id");

-- ─── Works Module: Requests ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "works_requests" (
  "id"                   UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  "scheme_id"            UUID NOT NULL REFERENCES "schemes"("id") ON DELETE CASCADE,
  "request_number"       VARCHAR(30) NOT NULL,
  "raised_by_id"         UUID NOT NULL REFERENCES "profiles"("id"),
  "assigned_to_id"       UUID REFERENCES "profiles"("id"),
  "category_id"          UUID REFERENCES "works_categories"("id"),
  "title"                VARCHAR(300) NOT NULL,
  "description"          TEXT NOT NULL,
  "location"             VARCHAR(500),
  "priority"             TEXT NOT NULL DEFAULT 'MEDIUM',
  "is_emergency"         BOOLEAN NOT NULL DEFAULT false,
  "estimated_cost"       DECIMAL(12,2),
  "status"               TEXT NOT NULL DEFAULT 'DRAFT',
  "is_urgent"            BOOLEAN NOT NULL DEFAULT false,
  "is_overdue"           BOOLEAN NOT NULL DEFAULT false,
  "has_dispute"          BOOLEAN NOT NULL DEFAULT false,
  "has_compliance_issue"  BOOLEAN NOT NULL DEFAULT false,
  "current_version"      INTEGER NOT NULL DEFAULT 1,
  "submitted_at"         TIMESTAMPTZ,
  "closed_at"            TIMESTAMPTZ,
  "created_at"           TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"           TIMESTAMPTZ NOT NULL DEFAULT now(),
  "deleted_at"           TIMESTAMPTZ,
  UNIQUE ("scheme_id", "request_number")
);
CREATE INDEX IF NOT EXISTS "works_requests_scheme_status_idx" ON "works_requests"("scheme_id", "status");
CREATE INDEX IF NOT EXISTS "works_requests_raised_by_idx" ON "works_requests"("raised_by_id");
CREATE INDEX IF NOT EXISTS "works_requests_assigned_to_idx" ON "works_requests"("assigned_to_id");

CREATE TABLE IF NOT EXISTS "works_request_versions" (
  "id"             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  "request_id"     UUID NOT NULL REFERENCES "works_requests"("id") ON DELETE CASCADE,
  "version_number" INTEGER NOT NULL,
  "title"          VARCHAR(300) NOT NULL,
  "description"    TEXT NOT NULL,
  "location"       VARCHAR(500),
  "priority"       TEXT NOT NULL,
  "estimated_cost" DECIMAL(12,2),
  "change_reason"  TEXT,
  "created_by_id"  UUID NOT NULL REFERENCES "profiles"("id"),
  "created_at"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("request_id", "version_number")
);

CREATE TABLE IF NOT EXISTS "works_request_reviews" (
  "id"                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  "request_id"        UUID NOT NULL REFERENCES "works_requests"("id") ON DELETE CASCADE,
  "reviewer_id"       UUID NOT NULL REFERENCES "profiles"("id"),
  "outcome"           TEXT NOT NULL,
  "procurement_route" TEXT,
  "comments"          TEXT,
  "return_reason"     TEXT,
  "reviewed_at"       TIMESTAMPTZ NOT NULL DEFAULT now(),
  "created_at"        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "works_request_reviews_request_idx" ON "works_request_reviews"("request_id");

-- ─── Works Module: Scope & RFQ ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS "works_scopes" (
  "id"                 UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  "request_id"         UUID NOT NULL REFERENCES "works_requests"("id") ON DELETE CASCADE,
  "scheme_id"          UUID NOT NULL REFERENCES "schemes"("id") ON DELETE CASCADE,
  "category_id"        UUID REFERENCES "works_categories"("id"),
  "title"              VARCHAR(300) NOT NULL,
  "description"        TEXT NOT NULL,
  "specifications"     TEXT,
  "site_requirements"  TEXT,
  "ohs_requirements"   TEXT,
  "insurance_minimums" JSONB,
  "licence_requirements" TEXT,
  "current_version"    INTEGER NOT NULL DEFAULT 1,
  "status"             TEXT NOT NULL DEFAULT 'DRAFT',
  "approved_by_id"     UUID REFERENCES "profiles"("id"),
  "approved_at"        TIMESTAMPTZ,
  "created_at"         TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "works_scopes_request_idx" ON "works_scopes"("request_id");
CREATE INDEX IF NOT EXISTS "works_scopes_scheme_idx" ON "works_scopes"("scheme_id");

CREATE TABLE IF NOT EXISTS "works_scope_versions" (
  "id"             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  "scope_id"       UUID NOT NULL REFERENCES "works_scopes"("id") ON DELETE CASCADE,
  "version_number" INTEGER NOT NULL,
  "title"          VARCHAR(300) NOT NULL,
  "description"    TEXT NOT NULL,
  "specifications" TEXT,
  "change_reason"  TEXT,
  "created_by_id"  UUID NOT NULL REFERENCES "profiles"("id"),
  "created_at"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("scope_id", "version_number")
);

CREATE TABLE IF NOT EXISTS "works_rfqs" (
  "id"                 UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  "scope_id"           UUID NOT NULL REFERENCES "works_scopes"("id") ON DELETE CASCADE,
  "scheme_id"          UUID NOT NULL REFERENCES "schemes"("id") ON DELETE CASCADE,
  "rfq_number"         VARCHAR(30) NOT NULL,
  "title"              VARCHAR(300) NOT NULL,
  "description"        TEXT,
  "closing_date"       TIMESTAMPTZ NOT NULL,
  "scope_version_used" INTEGER NOT NULL,
  "status"             TEXT NOT NULL DEFAULT 'DRAFT',
  "issued_at"          TIMESTAMPTZ,
  "issued_by_id"       UUID REFERENCES "profiles"("id"),
  "closed_at"          TIMESTAMPTZ,
  "cancelled_reason"   TEXT,
  "created_at"         TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("scheme_id", "rfq_number")
);
CREATE INDEX IF NOT EXISTS "works_rfqs_scheme_status_idx" ON "works_rfqs"("scheme_id", "status");

CREATE TABLE IF NOT EXISTS "works_rfq_invitations" (
  "id"                     UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  "rfq_id"                 UUID NOT NULL REFERENCES "works_rfqs"("id") ON DELETE CASCADE,
  "contractor_business_id" UUID NOT NULL REFERENCES "contractor_businesses"("id"),
  "invited_by_id"          UUID NOT NULL REFERENCES "profiles"("id"),
  "status"                 TEXT NOT NULL DEFAULT 'PENDING',
  "invited_at"             TIMESTAMPTZ NOT NULL DEFAULT now(),
  "responded_at"           TIMESTAMPTZ,
  "decline_reason"         TEXT,
  UNIQUE ("rfq_id", "contractor_business_id")
);

CREATE TABLE IF NOT EXISTS "works_rfq_clarifications" (
  "id"             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  "rfq_id"         UUID NOT NULL REFERENCES "works_rfqs"("id") ON DELETE CASCADE,
  "asked_by_id"    UUID NOT NULL REFERENCES "profiles"("id"),
  "question"       TEXT NOT NULL,
  "answer"         TEXT,
  "answered_by_id" UUID REFERENCES "profiles"("id"),
  "is_public"      BOOLEAN NOT NULL DEFAULT true,
  "asked_at"       TIMESTAMPTZ NOT NULL DEFAULT now(),
  "answered_at"    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS "works_rfq_clarifications_rfq_idx" ON "works_rfq_clarifications"("rfq_id");

CREATE TABLE IF NOT EXISTS "works_rfq_addenda" (
  "id"              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  "rfq_id"          UUID NOT NULL REFERENCES "works_rfqs"("id") ON DELETE CASCADE,
  "addendum_number" INTEGER NOT NULL,
  "title"           VARCHAR(300) NOT NULL,
  "description"     TEXT NOT NULL,
  "issued_by_id"    UUID NOT NULL REFERENCES "profiles"("id"),
  "issued_at"       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("rfq_id", "addendum_number")
);

-- ─── Works Module: Contractors ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS "contractor_businesses" (
  "id"                 UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  "company_name"       VARCHAR(300) NOT NULL,
  "trading_name"       VARCHAR(300),
  "abn"                VARCHAR(11),
  "acn"                VARCHAR(9),
  "registered_address" TEXT,
  "phone"              VARCHAR(20),
  "email"              VARCHAR(320),
  "website"            VARCHAR(500),
  "trade_categories"   TEXT[] NOT NULL DEFAULT '{}',
  "status"             TEXT NOT NULL DEFAULT 'PENDING',
  "gst_registered"     BOOLEAN NOT NULL DEFAULT false,
  "notes"              TEXT,
  "created_at"         TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"         TIMESTAMPTZ NOT NULL DEFAULT now(),
  "deleted_at"         TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS "contractor_businesses_status_idx" ON "contractor_businesses"("status");

CREATE TABLE IF NOT EXISTS "contractor_contacts" (
  "id"                     UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  "contractor_business_id" UUID NOT NULL REFERENCES "contractor_businesses"("id") ON DELETE CASCADE,
  "profile_id"             UUID REFERENCES "profiles"("id"),
  "first_name"             VARCHAR(200) NOT NULL,
  "last_name"              VARCHAR(200) NOT NULL,
  "email"                  VARCHAR(320) NOT NULL,
  "phone"                  VARCHAR(20),
  "position"               VARCHAR(200),
  "is_primary"             BOOLEAN NOT NULL DEFAULT false,
  "status"                 TEXT NOT NULL DEFAULT 'ACTIVE',
  "created_at"             TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "contractor_contacts_business_idx" ON "contractor_contacts"("contractor_business_id");

-- ─── Works Module: Compliance (3-layer) ─────────────────────────────

CREATE TABLE IF NOT EXISTS "works_compliance_requirements" (
  "id"               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  "scheme_id"        UUID REFERENCES "schemes"("id") ON DELETE CASCADE,
  "org_id"           UUID REFERENCES "organisations"("id") ON DELETE CASCADE,
  "name"             VARCHAR(300) NOT NULL,
  "description"      TEXT,
  "layer"            TEXT NOT NULL,
  "document_type"    TEXT NOT NULL,
  "is_mandatory"     BOOLEAN NOT NULL DEFAULT true,
  "validity_period"  INTEGER,
  "trade_categories" TEXT[] NOT NULL DEFAULT '{}',
  "is_active"        BOOLEAN NOT NULL DEFAULT true,
  "created_at"       TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "works_compliance_requirements_scheme_idx" ON "works_compliance_requirements"("scheme_id");
CREATE INDEX IF NOT EXISTS "works_compliance_requirements_org_idx" ON "works_compliance_requirements"("org_id");
CREATE INDEX IF NOT EXISTS "works_compliance_requirements_layer_idx" ON "works_compliance_requirements"("layer");

CREATE TABLE IF NOT EXISTS "works_compliance_checks" (
  "id"                     UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  "requirement_id"         UUID NOT NULL REFERENCES "works_compliance_requirements"("id") ON DELETE CASCADE,
  "contractor_business_id" UUID REFERENCES "contractor_businesses"("id"),
  "works_work_order_id"    UUID,
  "status"                 TEXT NOT NULL DEFAULT 'PENDING',
  "document_url"           TEXT,
  "document_name"          VARCHAR(500),
  "expiry_date"            TIMESTAMPTZ,
  "verified_by_id"         UUID REFERENCES "profiles"("id"),
  "verified_at"            TIMESTAMPTZ,
  "rejection_reason"       TEXT,
  "notes"                  TEXT,
  "created_at"             TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "works_compliance_checks_requirement_idx" ON "works_compliance_checks"("requirement_id");
CREATE INDEX IF NOT EXISTS "works_compliance_checks_contractor_idx" ON "works_compliance_checks"("contractor_business_id");
CREATE INDEX IF NOT EXISTS "works_compliance_checks_work_order_idx" ON "works_compliance_checks"("works_work_order_id");
CREATE INDEX IF NOT EXISTS "works_compliance_checks_status_idx" ON "works_compliance_checks"("status");

CREATE TABLE IF NOT EXISTS "works_licences" (
  "id"                     UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  "contractor_business_id" UUID NOT NULL REFERENCES "contractor_businesses"("id") ON DELETE CASCADE,
  "licence_type"           VARCHAR(200) NOT NULL,
  "licence_number"         VARCHAR(100) NOT NULL,
  "issuing_authority"      VARCHAR(300) NOT NULL,
  "holder_name"            VARCHAR(300) NOT NULL,
  "holder_entity_name"     VARCHAR(300),
  "issue_date"             DATE,
  "expiry_date"            DATE,
  "conditions"             TEXT,
  "status"                 TEXT NOT NULL DEFAULT 'UNVERIFIED',
  "document_url"           TEXT,
  "verified_by_id"         UUID REFERENCES "profiles"("id"),
  "verified_at"            TIMESTAMPTZ,
  "created_at"             TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "works_licences_contractor_idx" ON "works_licences"("contractor_business_id");
CREATE INDEX IF NOT EXISTS "works_licences_expiry_idx" ON "works_licences"("expiry_date");

CREATE TABLE IF NOT EXISTS "works_insurances" (
  "id"                     UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  "contractor_business_id" UUID NOT NULL REFERENCES "contractor_businesses"("id") ON DELETE CASCADE,
  "policy_type"            TEXT NOT NULL,
  "policy_number"          VARCHAR(100) NOT NULL,
  "insurer"                VARCHAR(300) NOT NULL,
  "insured_name"           VARCHAR(300) NOT NULL,
  "insured_entity_name"    VARCHAR(300),
  "coverage_amount"        DECIMAL(14,2) NOT NULL,
  "start_date"             DATE NOT NULL,
  "expiry_date"            DATE NOT NULL,
  "status"                 TEXT NOT NULL DEFAULT 'UNVERIFIED',
  "document_url"           TEXT,
  "verified_by_id"         UUID REFERENCES "profiles"("id"),
  "verified_at"            TIMESTAMPTZ,
  "created_at"             TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "works_insurances_contractor_idx" ON "works_insurances"("contractor_business_id");
CREATE INDEX IF NOT EXISTS "works_insurances_expiry_idx" ON "works_insurances"("expiry_date");

CREATE TABLE IF NOT EXISTS "works_verification_events" (
  "id"                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  "compliance_check_id" UUID REFERENCES "works_compliance_checks"("id") ON DELETE CASCADE,
  "licence_id"          UUID REFERENCES "works_licences"("id") ON DELETE CASCADE,
  "insurance_id"        UUID REFERENCES "works_insurances"("id") ON DELETE CASCADE,
  "verified_by_id"      UUID NOT NULL REFERENCES "profiles"("id"),
  "action"              TEXT NOT NULL,
  "previous_status"     TEXT,
  "new_status"          TEXT NOT NULL,
  "notes"               TEXT,
  "created_at"          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "works_verification_events_check_idx" ON "works_verification_events"("compliance_check_id");
CREATE INDEX IF NOT EXISTS "works_verification_events_licence_idx" ON "works_verification_events"("licence_id");
CREATE INDEX IF NOT EXISTS "works_verification_events_insurance_idx" ON "works_verification_events"("insurance_id");

-- ─── Works Module: Quotations & Evaluation ──────────────────────────

CREATE TABLE IF NOT EXISTS "works_quotations" (
  "id"                     UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  "rfq_id"                 UUID NOT NULL REFERENCES "works_rfqs"("id") ON DELETE CASCADE,
  "contractor_business_id" UUID NOT NULL REFERENCES "contractor_businesses"("id"),
  "quotation_number"       VARCHAR(30) NOT NULL,
  "current_version"        INTEGER NOT NULL DEFAULT 1,
  "subtotal"               DECIMAL(12,2) NOT NULL,
  "gst_amount"             DECIMAL(12,2) NOT NULL DEFAULT 0,
  "total_amount"           DECIMAL(12,2) NOT NULL,
  "valid_until"            TIMESTAMPTZ,
  "estimated_duration"     INTEGER,
  "methodology"            TEXT,
  "inclusions"             TEXT,
  "exclusions"             TEXT,
  "conditions"             TEXT,
  "status"                 TEXT NOT NULL DEFAULT 'DRAFT',
  "submitted_at"           TIMESTAMPTZ,
  "created_at"             TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"             TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("rfq_id", "contractor_business_id")
);
CREATE INDEX IF NOT EXISTS "works_quotations_rfq_status_idx" ON "works_quotations"("rfq_id", "status");

CREATE TABLE IF NOT EXISTS "works_quotation_versions" (
  "id"             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  "quotation_id"   UUID NOT NULL REFERENCES "works_quotations"("id") ON DELETE CASCADE,
  "version_number" INTEGER NOT NULL,
  "subtotal"       DECIMAL(12,2) NOT NULL,
  "gst_amount"     DECIMAL(12,2) NOT NULL DEFAULT 0,
  "total_amount"   DECIMAL(12,2) NOT NULL,
  "methodology"    TEXT,
  "inclusions"     TEXT,
  "exclusions"     TEXT,
  "conditions"     TEXT,
  "change_reason"  TEXT,
  "created_at"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("quotation_id", "version_number")
);

CREATE TABLE IF NOT EXISTS "works_quotation_line_items" (
  "id"           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  "quotation_id" UUID NOT NULL REFERENCES "works_quotations"("id") ON DELETE CASCADE,
  "description"  TEXT NOT NULL,
  "quantity"     DECIMAL(10,2) NOT NULL,
  "unit"         VARCHAR(50),
  "unit_price"   DECIMAL(12,2) NOT NULL,
  "total_price"  DECIMAL(12,2) NOT NULL,
  "gst_amount"   DECIMAL(12,2) NOT NULL DEFAULT 0,
  "sort_order"   INTEGER NOT NULL DEFAULT 0,
  "created_at"   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "works_quotation_line_items_quotation_idx" ON "works_quotation_line_items"("quotation_id");

CREATE TABLE IF NOT EXISTS "works_evaluations" (
  "id"            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  "rfq_id"        UUID NOT NULL REFERENCES "works_rfqs"("id") ON DELETE CASCADE,
  "quotation_id"  UUID REFERENCES "works_quotations"("id"),
  "evaluator_id"  UUID NOT NULL REFERENCES "profiles"("id"),
  "overall_score" DECIMAL(5,2),
  "comments"      TEXT,
  "evaluated_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  "created_at"    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "works_evaluations_rfq_idx" ON "works_evaluations"("rfq_id");
CREATE INDEX IF NOT EXISTS "works_evaluations_quotation_idx" ON "works_evaluations"("quotation_id");

CREATE TABLE IF NOT EXISTS "works_evaluation_criteria" (
  "id"             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  "evaluation_id"  UUID NOT NULL REFERENCES "works_evaluations"("id") ON DELETE CASCADE,
  "criterion_name" VARCHAR(200) NOT NULL,
  "weight"         DECIMAL(5,2) NOT NULL,
  "score"          DECIMAL(5,2) NOT NULL,
  "weighted_score" DECIMAL(5,2) NOT NULL,
  "comments"       TEXT,
  "created_at"     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "works_evaluation_criteria_eval_idx" ON "works_evaluation_criteria"("evaluation_id");

CREATE TABLE IF NOT EXISTS "works_recommendations" (
  "id"                     UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  "rfq_id"                 UUID,
  "quotation_id"           UUID NOT NULL REFERENCES "works_quotations"("id") ON DELETE CASCADE,
  "recommended_by_id"      UUID NOT NULL REFERENCES "profiles"("id"),
  "recommendation"         TEXT NOT NULL,
  "justification"          TEXT NOT NULL,
  "scope_version_used"     INTEGER,
  "quotation_version_used" INTEGER,
  "status"                 TEXT NOT NULL DEFAULT 'PENDING',
  "created_at"             TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "works_recommendations_quotation_idx" ON "works_recommendations"("quotation_id");

-- ─── Works Module: Approvals ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "works_approval_workflows" (
  "id"                         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  "scheme_id"                  UUID NOT NULL REFERENCES "schemes"("id") ON DELETE CASCADE,
  "entity_type"                TEXT NOT NULL,
  "entity_id"                  UUID NOT NULL,
  "quotation_id"               UUID REFERENCES "works_quotations"("id"),
  "approval_route_id"          UUID REFERENCES "works_approval_routes"("id"),
  "total_amount"               DECIMAL(12,2) NOT NULL,
  "scope_version_approved"     INTEGER,
  "quotation_version_approved" INTEGER,
  "status"                     TEXT NOT NULL DEFAULT 'PENDING',
  "invalidated_reason"         TEXT,
  "created_at"                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"                 TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "works_approval_workflows_scheme_type_idx" ON "works_approval_workflows"("scheme_id", "entity_type");
CREATE INDEX IF NOT EXISTS "works_approval_workflows_entity_idx" ON "works_approval_workflows"("entity_id");

CREATE TABLE IF NOT EXISTS "works_approval_records" (
  "id"          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  "workflow_id" UUID NOT NULL REFERENCES "works_approval_workflows"("id") ON DELETE CASCADE,
  "approver_id" UUID NOT NULL REFERENCES "profiles"("id"),
  "decision"    TEXT NOT NULL,
  "comments"    TEXT,
  "decided_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "works_approval_records_workflow_idx" ON "works_approval_records"("workflow_id");

-- ─── Works Module: Contracts & Delivery ─────────────────────────────

CREATE TABLE IF NOT EXISTS "works_contracts" (
  "id"                     UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  "request_id"             UUID NOT NULL REFERENCES "works_requests"("id"),
  "scheme_id"              UUID NOT NULL REFERENCES "schemes"("id") ON DELETE CASCADE,
  "quotation_id"           UUID REFERENCES "works_quotations"("id"),
  "contractor_business_id" UUID NOT NULL REFERENCES "contractor_businesses"("id"),
  "contract_number"        VARCHAR(30) NOT NULL,
  "title"                  VARCHAR(300) NOT NULL,
  "description"            TEXT,
  "contract_value"         DECIMAL(12,2) NOT NULL,
  "gst_amount"             DECIMAL(12,2) NOT NULL DEFAULT 0,
  "total_value"            DECIMAL(12,2) NOT NULL,
  "approved_variations"    DECIMAL(12,2) NOT NULL DEFAULT 0,
  "revised_contract_value" DECIMAL(12,2),
  "start_date"             DATE,
  "end_date"               DATE,
  "defects_liability_end"  DATE,
  "retention_percentage"   DECIMAL(5,2),
  "retention_amount"       DECIMAL(12,2),
  "status"                 TEXT NOT NULL DEFAULT 'DRAFT',
  "signed_by_id"           UUID REFERENCES "profiles"("id"),
  "signed_at"              TIMESTAMPTZ,
  "executed_at"            TIMESTAMPTZ,
  "completed_at"           TIMESTAMPTZ,
  "created_at"             TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"             TIMESTAMPTZ NOT NULL DEFAULT now(),
  "deleted_at"             TIMESTAMPTZ,
  UNIQUE ("scheme_id", "contract_number")
);
CREATE INDEX IF NOT EXISTS "works_contracts_scheme_status_idx" ON "works_contracts"("scheme_id", "status");
CREATE INDEX IF NOT EXISTS "works_contracts_contractor_idx" ON "works_contracts"("contractor_business_id");

CREATE TABLE IF NOT EXISTS "works_work_orders" (
  "id"                     UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  "contract_id"            UUID NOT NULL REFERENCES "works_contracts"("id") ON DELETE CASCADE,
  "scheme_id"              UUID NOT NULL REFERENCES "schemes"("id") ON DELETE CASCADE,
  "contractor_business_id" UUID NOT NULL REFERENCES "contractor_businesses"("id"),
  "work_order_number"      VARCHAR(30) NOT NULL,
  "title"                  VARCHAR(300) NOT NULL,
  "description"            TEXT,
  "scheduled_start"        DATE,
  "scheduled_end"          DATE,
  "actual_start"           DATE,
  "actual_end"             DATE,
  "status"                 TEXT NOT NULL DEFAULT 'DRAFT',
  "acknowledged_at"        TIMESTAMPTZ,
  "authorised_by_id"       UUID REFERENCES "profiles"("id"),
  "authorised_at"          TIMESTAMPTZ,
  "created_at"             TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"             TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("scheme_id", "work_order_number")
);
CREATE INDEX IF NOT EXISTS "works_work_orders_contract_idx" ON "works_work_orders"("contract_id");
CREATE INDEX IF NOT EXISTS "works_work_orders_scheme_status_idx" ON "works_work_orders"("scheme_id", "status");

-- Add FK from compliance_checks to work_orders now that both tables exist
ALTER TABLE "works_compliance_checks"
  ADD CONSTRAINT "works_compliance_checks_work_order_fkey"
  FOREIGN KEY ("works_work_order_id") REFERENCES "works_work_orders"("id");

CREATE TABLE IF NOT EXISTS "works_milestones" (
  "id"                 UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  "work_order_id"      UUID NOT NULL REFERENCES "works_work_orders"("id") ON DELETE CASCADE,
  "name"               VARCHAR(300) NOT NULL,
  "description"        TEXT,
  "due_date"           DATE,
  "completed_at"       TIMESTAMPTZ,
  "payment_amount"     DECIMAL(12,2),
  "payment_percentage" DECIMAL(5,2),
  "sort_order"         INTEGER NOT NULL DEFAULT 0,
  "status"             TEXT NOT NULL DEFAULT 'PENDING',
  "certified_by_id"    UUID REFERENCES "profiles"("id"),
  "certified_at"       TIMESTAMPTZ,
  "created_at"         TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "works_milestones_work_order_idx" ON "works_milestones"("work_order_id");

CREATE TABLE IF NOT EXISTS "works_site_visits" (
  "id"                 UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  "work_order_id"      UUID NOT NULL REFERENCES "works_work_orders"("id") ON DELETE CASCADE,
  "conducted_by_id"    UUID NOT NULL REFERENCES "profiles"("id"),
  "visit_date"         DATE NOT NULL,
  "purpose"            TEXT,
  "findings"           TEXT,
  "weather_conditions" TEXT,
  "attendees"          TEXT,
  "created_at"         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "works_site_visits_work_order_idx" ON "works_site_visits"("work_order_id");

CREATE TABLE IF NOT EXISTS "works_progress_reports" (
  "id"               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  "work_order_id"    UUID NOT NULL REFERENCES "works_work_orders"("id") ON DELETE CASCADE,
  "report_date"      DATE NOT NULL,
  "percent_complete" DECIMAL(5,2) NOT NULL,
  "summary"          TEXT NOT NULL,
  "issues"           TEXT,
  "next_steps"       TEXT,
  "submitted_by_id"  UUID NOT NULL REFERENCES "profiles"("id"),
  "created_at"       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "works_progress_reports_work_order_idx" ON "works_progress_reports"("work_order_id");

CREATE TABLE IF NOT EXISTS "works_variations" (
  "id"               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  "contract_id"      UUID NOT NULL REFERENCES "works_contracts"("id") ON DELETE CASCADE,
  "variation_number" INTEGER NOT NULL,
  "title"            VARCHAR(300) NOT NULL,
  "description"      TEXT NOT NULL,
  "reason"           TEXT,
  "requested_by_id"  UUID NOT NULL REFERENCES "profiles"("id"),
  "cost_impact"      DECIMAL(12,2) NOT NULL,
  "time_impact"      INTEGER,
  "status"           TEXT NOT NULL DEFAULT 'DRAFT',
  "approved_by_id"   UUID REFERENCES "profiles"("id"),
  "approved_at"      TIMESTAMPTZ,
  "created_at"       TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("contract_id", "variation_number")
);
CREATE INDEX IF NOT EXISTS "works_variations_contract_status_idx" ON "works_variations"("contract_id", "status");

CREATE TABLE IF NOT EXISTS "works_inspections" (
  "id"              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  "work_order_id"   UUID NOT NULL REFERENCES "works_work_orders"("id") ON DELETE CASCADE,
  "inspector_id"    UUID NOT NULL REFERENCES "profiles"("id"),
  "inspection_date" DATE NOT NULL,
  "inspection_type" TEXT NOT NULL,
  "outcome"         TEXT,
  "findings"        TEXT,
  "created_at"      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "works_inspections_work_order_idx" ON "works_inspections"("work_order_id");

CREATE TABLE IF NOT EXISTS "works_defects" (
  "id"                      UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  "inspection_id"           UUID NOT NULL REFERENCES "works_inspections"("id") ON DELETE CASCADE,
  "description"             TEXT NOT NULL,
  "location"                VARCHAR(500),
  "severity"                TEXT NOT NULL DEFAULT 'MINOR',
  "rectification_deadline"  DATE,
  "status"                  TEXT NOT NULL DEFAULT 'OPEN',
  "rectified_at"            TIMESTAMPTZ,
  "verified_by_id"          UUID REFERENCES "profiles"("id"),
  "verified_at"             TIMESTAMPTZ,
  "created_at"              TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "works_defects_inspection_idx" ON "works_defects"("inspection_id");
CREATE INDEX IF NOT EXISTS "works_defects_status_idx" ON "works_defects"("status");

CREATE TABLE IF NOT EXISTS "works_completion_submissions" (
  "id"               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  "work_order_id"    UUID NOT NULL REFERENCES "works_work_orders"("id") ON DELETE CASCADE,
  "submitted_by_id"  UUID NOT NULL REFERENCES "profiles"("id"),
  "submission_type"  TEXT NOT NULL,
  "summary"          TEXT,
  "warranty_info"    TEXT,
  "maintenance_info" TEXT,
  "status"           TEXT NOT NULL DEFAULT 'SUBMITTED',
  "reviewed_by_id"   UUID REFERENCES "profiles"("id"),
  "reviewed_at"      TIMESTAMPTZ,
  "review_comments"  TEXT,
  "submitted_at"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  "created_at"       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "works_completion_submissions_work_order_idx" ON "works_completion_submissions"("work_order_id");

-- ─── Works Module: Invoices & Payments ──────────────────────────────

CREATE TABLE IF NOT EXISTS "works_invoices" (
  "id"                     UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  "request_id"             UUID REFERENCES "works_requests"("id"),
  "contract_id"            UUID REFERENCES "works_contracts"("id"),
  "milestone_id"           UUID REFERENCES "works_milestones"("id"),
  "scheme_id"              UUID NOT NULL REFERENCES "schemes"("id") ON DELETE CASCADE,
  "contractor_business_id" UUID NOT NULL REFERENCES "contractor_businesses"("id"),
  "submitted_by_id"        UUID NOT NULL REFERENCES "profiles"("id"),
  "invoice_number"         VARCHAR(50) NOT NULL,
  "invoice_date"           DATE NOT NULL,
  "date_received"          DATE NOT NULL,
  "due_date"               DATE NOT NULL,
  "claimed_amount"         DECIMAL(12,2) NOT NULL,
  "gst_amount"             DECIMAL(12,2) NOT NULL DEFAULT 0,
  "assessed_amount"        DECIMAL(12,2),
  "scheduled_amount"       DECIMAL(12,2),
  "approved_amount"        DECIMAL(12,2),
  "paid_amount"            DECIMAL(12,2) NOT NULL DEFAULT 0,
  "variation_references"   TEXT[] NOT NULL DEFAULT '{}',
  "is_duplicate"           BOOLEAN NOT NULL DEFAULT false,
  "duplicate_of_id"        UUID REFERENCES "works_invoices"("id"),
  "is_statutory_claim"     BOOLEAN NOT NULL DEFAULT false,
  "bank_detail_change_flag" BOOLEAN NOT NULL DEFAULT false,
  "response_deadline"      TIMESTAMPTZ,
  "status"                 TEXT NOT NULL DEFAULT 'SUBMITTED',
  "assessed_by_id"         UUID REFERENCES "profiles"("id"),
  "assessed_at"            TIMESTAMPTZ,
  "assessment_notes"       TEXT,
  "difference_reasons"     TEXT,
  "document_url"           TEXT,
  "created_at"             TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "works_invoices_scheme_status_idx" ON "works_invoices"("scheme_id", "status");
CREATE INDEX IF NOT EXISTS "works_invoices_contractor_idx" ON "works_invoices"("contractor_business_id");
CREATE INDEX IF NOT EXISTS "works_invoices_contract_idx" ON "works_invoices"("contract_id");

CREATE TABLE IF NOT EXISTS "works_payment_assessments" (
  "id"                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  "invoice_id"        UUID NOT NULL REFERENCES "works_invoices"("id") ON DELETE CASCADE,
  "assessor_id"       UUID NOT NULL REFERENCES "profiles"("id"),
  "assessed_amount"   DECIMAL(12,2) NOT NULL,
  "previous_claims"   DECIMAL(12,2) NOT NULL DEFAULT 0,
  "previous_payments" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "this_claim_amount" DECIMAL(12,2) NOT NULL,
  "comments"          TEXT,
  "assessed_at"       TIMESTAMPTZ NOT NULL DEFAULT now(),
  "created_at"        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "works_payment_assessments_invoice_idx" ON "works_payment_assessments"("invoice_id");

CREATE TABLE IF NOT EXISTS "works_bank_detail_versions" (
  "id"                     UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  "contractor_business_id" UUID NOT NULL REFERENCES "contractor_businesses"("id") ON DELETE CASCADE,
  "version_number"         INTEGER NOT NULL,
  "bsb"                    VARCHAR(7) NOT NULL,
  "account_number"         VARCHAR(20) NOT NULL,
  "account_name"           VARCHAR(200) NOT NULL,
  "bank_name"              VARCHAR(200),
  "updated_by_id"          UUID NOT NULL REFERENCES "profiles"("id"),
  "verified_by_id"         UUID REFERENCES "profiles"("id"),
  "verification_method"    TEXT,
  "status"                 TEXT NOT NULL DEFAULT 'PENDING',
  "verified_at"            TIMESTAMPTZ,
  "created_at"             TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("contractor_business_id", "version_number")
);
CREATE INDEX IF NOT EXISTS "works_bank_detail_versions_contractor_idx" ON "works_bank_detail_versions"("contractor_business_id");

CREATE TABLE IF NOT EXISTS "works_payment_instructions" (
  "id"                      UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  "invoice_id"              UUID NOT NULL REFERENCES "works_invoices"("id") ON DELETE CASCADE,
  "authorised_by_id"        UUID NOT NULL REFERENCES "profiles"("id"),
  "approved_amount"         DECIMAL(12,2) NOT NULL,
  "beneficiary"             VARCHAR(300) NOT NULL,
  "bank_detail_version_id"  UUID REFERENCES "works_bank_detail_versions"("id"),
  "authorised_at"           TIMESTAMPTZ NOT NULL DEFAULT now(),
  "status"                  TEXT NOT NULL DEFAULT 'PENDING',
  "invalidated_reason"      TEXT,
  "exported_at"             TIMESTAMPTZ,
  "created_at"              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "works_payment_instructions_invoice_idx" ON "works_payment_instructions"("invoice_id");

CREATE TABLE IF NOT EXISTS "works_payment_records" (
  "id"                       UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  "payment_instruction_id"   UUID NOT NULL REFERENCES "works_payment_instructions"("id") ON DELETE CASCADE,
  "external_reference"       VARCHAR(200),
  "payment_method"           TEXT NOT NULL,
  "amount"                   DECIMAL(12,2) NOT NULL,
  "payment_date"             DATE NOT NULL,
  "recorded_by_id"           UUID NOT NULL REFERENCES "profiles"("id"),
  "remittance_info"          TEXT,
  "reconciliation_status"    TEXT NOT NULL DEFAULT 'UNRECONCILED',
  "reconciliation_evidence"  TEXT,
  "reconciled_at"            TIMESTAMPTZ,
  "reconciled_by_id"         UUID REFERENCES "profiles"("id"),
  "created_at"               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "works_payment_records_instruction_idx" ON "works_payment_records"("payment_instruction_id");

-- ─── Works Module: Documents, Notifications & Audit ─────────────────

CREATE TABLE IF NOT EXISTS "works_documents" (
  "id"            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  "request_id"    UUID REFERENCES "works_requests"("id"),
  "contract_id"   UUID REFERENCES "works_contracts"("id"),
  "invoice_id"    UUID REFERENCES "works_invoices"("id"),
  "scheme_id"     UUID NOT NULL REFERENCES "schemes"("id") ON DELETE CASCADE,
  "document_type" TEXT NOT NULL,
  "title"         VARCHAR(300) NOT NULL,
  "file_name"     VARCHAR(500) NOT NULL,
  "file_url"      TEXT NOT NULL,
  "file_size"     INTEGER,
  "mime_type"     VARCHAR(100),
  "version"       INTEGER NOT NULL DEFAULT 1,
  "uploaded_by_id" UUID NOT NULL REFERENCES "profiles"("id"),
  "access_level"  TEXT NOT NULL DEFAULT 'RESTRICTED',
  "retention_date" DATE,
  "created_at"    TIMESTAMPTZ NOT NULL DEFAULT now(),
  "deleted_at"    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS "works_documents_scheme_type_idx" ON "works_documents"("scheme_id", "document_type");
CREATE INDEX IF NOT EXISTS "works_documents_request_idx" ON "works_documents"("request_id");
CREATE INDEX IF NOT EXISTS "works_documents_contract_idx" ON "works_documents"("contract_id");

CREATE TABLE IF NOT EXISTS "works_notifications" (
  "id"           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  "request_id"   UUID REFERENCES "works_requests"("id"),
  "scheme_id"    UUID NOT NULL REFERENCES "schemes"("id") ON DELETE CASCADE,
  "recipient_id" UUID NOT NULL REFERENCES "profiles"("id"),
  "type"         TEXT NOT NULL,
  "title"        VARCHAR(300) NOT NULL,
  "message"      TEXT NOT NULL,
  "entity_type"  TEXT,
  "entity_id"    UUID,
  "is_read"      BOOLEAN NOT NULL DEFAULT false,
  "read_at"      TIMESTAMPTZ,
  "created_at"   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "works_notifications_recipient_read_idx" ON "works_notifications"("recipient_id", "is_read");
CREATE INDEX IF NOT EXISTS "works_notifications_scheme_idx" ON "works_notifications"("scheme_id");

CREATE TABLE IF NOT EXISTS "works_audit_events" (
  "id"            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  "request_id"    UUID REFERENCES "works_requests"("id"),
  "scheme_id"     UUID NOT NULL REFERENCES "schemes"("id") ON DELETE CASCADE,
  "actor_id"      UUID NOT NULL REFERENCES "profiles"("id"),
  "action"        TEXT NOT NULL,
  "entity_type"   TEXT NOT NULL,
  "entity_id"     UUID NOT NULL,
  "before_values" JSONB,
  "after_values"  JSONB,
  "approval_ref"  UUID,
  "document_ref"  UUID,
  "ip_address"    VARCHAR(45),
  "metadata"      JSONB,
  "created_at"    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "works_audit_events_scheme_created_idx" ON "works_audit_events"("scheme_id", "created_at");
CREATE INDEX IF NOT EXISTS "works_audit_events_entity_idx" ON "works_audit_events"("entity_type", "entity_id");
CREATE INDEX IF NOT EXISTS "works_audit_events_actor_idx" ON "works_audit_events"("actor_id");
