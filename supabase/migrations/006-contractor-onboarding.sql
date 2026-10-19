-- StrataVerze Contractor Onboarding Module
-- Migration 006: New columns on existing tables + 5 new tables
-- for contractor self-service registration and onboarding.
--
-- Depends on: 005-works-rls.sql
-- Tables modified: contractor_businesses, works_licences, works_insurances, works_bank_detail_versions
-- Tables created: contractor_onboardings, abn_lookup_records, contractor_memberships,
--                 contractor_declarations, contractor_review_items

-- ═══════════════════════════════════════════════════════════════════════
-- 1. EXTEND EXISTING TABLES
-- ═══════════════════════════════════════════════════════════════════════

-- ─── contractor_businesses ───────────────────────────────────────────
ALTER TABLE contractor_businesses
  ADD COLUMN IF NOT EXISTS business_structure varchar(100),
  ADD COLUMN IF NOT EXISTS business_description text,
  ADD COLUMN IF NOT EXISTS postal_address text,
  ADD COLUMN IF NOT EXISTS suburb varchar(100),
  ADD COLUMN IF NOT EXISTS state varchar(3) DEFAULT 'VIC',
  ADD COLUMN IF NOT EXISTS postcode varchar(4),
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS specialist_services text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS service_regions text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS uses_subcontractors boolean,
  ADD COLUMN IF NOT EXISTS project_examples text,
  ADD COLUMN IF NOT EXISTS quoting_contact_id uuid REFERENCES contractor_contacts(id),
  ADD COLUMN IF NOT EXISTS accounts_contact_id uuid REFERENCES contractor_contacts(id),
  ADD COLUMN IF NOT EXISTS after_hours_contact_id uuid REFERENCES contractor_contacts(id);

CREATE INDEX IF NOT EXISTS idx_contractor_businesses_abn ON contractor_businesses(abn);

-- ─── works_licences ─────────────────────────────────────────────────
ALTER TABLE works_licences
  ADD COLUMN IF NOT EXISTS state_territory varchar(3),
  ADD COLUMN IF NOT EXISTS licence_class varchar(200),
  ADD COLUMN IF NOT EXISTS permitted_work text,
  ADD COLUMN IF NOT EXISTS relationship_to_business varchar(200),
  ADD COLUMN IF NOT EXISTS next_review_date date,
  ADD COLUMN IF NOT EXISTS verification_source varchar(300),
  ADD COLUMN IF NOT EXISTS verification_outcome varchar(100),
  ADD COLUMN IF NOT EXISTS verification_notes text;

-- ─── works_insurances ───────────────────────────────────────────────
ALTER TABLE works_insurances
  ADD COLUMN IF NOT EXISTS coverage_amount_basis varchar(200),
  ADD COLUMN IF NOT EXISTS covered_activities text,
  ADD COLUMN IF NOT EXISTS exclusions text,
  ADD COLUMN IF NOT EXISTS not_applicable boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS not_applicable_reason text,
  ADD COLUMN IF NOT EXISTS contractor_comments text,
  ADD COLUMN IF NOT EXISTS next_review_date date,
  ADD COLUMN IF NOT EXISTS verification_source varchar(300),
  ADD COLUMN IF NOT EXISTS verification_outcome varchar(100),
  ADD COLUMN IF NOT EXISTS verification_notes text;

-- ─── works_bank_detail_versions ─────────────────────────────────────
ALTER TABLE works_bank_detail_versions
  ADD COLUMN IF NOT EXISTS remittance_email varchar(320),
  ADD COLUMN IF NOT EXISTS entity_difference_explanation text,
  ADD COLUMN IF NOT EXISTS supporting_document_url text,
  ADD COLUMN IF NOT EXISTS rejection_reason text;


-- ═══════════════════════════════════════════════════════════════════════
-- 2. CREATE NEW TABLES
-- ═══════════════════════════════════════════════════════════════════════

-- ─── contractor_onboardings ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contractor_onboardings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_business_id uuid NOT NULL UNIQUE REFERENCES contractor_businesses(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'DRAFT',
  -- DRAFT, SUBMITTED, INFORMATION_REQUIRED, REVIEWED
  current_step integer NOT NULL DEFAULT 1,
  -- Per-step completion flags
  step_account_complete boolean NOT NULL DEFAULT false,
  step_business_complete boolean NOT NULL DEFAULT false,
  step_services_complete boolean NOT NULL DEFAULT false,
  step_licences_complete boolean NOT NULL DEFAULT false,
  step_insurance_complete boolean NOT NULL DEFAULT false,
  step_banking_complete boolean NOT NULL DEFAULT false,
  step_membership_complete boolean NOT NULL DEFAULT false,
  step_review_complete boolean NOT NULL DEFAULT false,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contractor_onboardings_status
  ON contractor_onboardings(status);

-- ─── abn_lookup_records ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS abn_lookup_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_business_id uuid NOT NULL REFERENCES contractor_businesses(id) ON DELETE CASCADE,
  abn varchar(11) NOT NULL,
  -- Returned fields from ABN Lookup
  entity_name varchar(500),
  entity_type varchar(200),
  abn_status varchar(50),
  abn_status_from_date date,
  gst_status varchar(50),
  gst_status_from_date date,
  business_names text[] DEFAULT '{}',
  location_state varchar(3),
  location_postcode varchar(4),
  -- Lookup metadata
  lookup_status text NOT NULL DEFAULT 'PENDING',
  -- NOT_CHECKED, LOOKUP_PENDING, ACTIVE_MATCHED, INACTIVE_REVIEW, DETAILS_REVIEW, LOOKUP_UNAVAILABLE
  lookup_timestamp timestamptz NOT NULL,
  raw_response jsonb,
  error_message text,
  performed_by_id uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_abn_lookup_records_business
  ON abn_lookup_records(contractor_business_id);
CREATE INDEX IF NOT EXISTS idx_abn_lookup_records_abn
  ON abn_lookup_records(abn);

-- ─── contractor_memberships ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contractor_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_business_id uuid NOT NULL UNIQUE REFERENCES contractor_businesses(id) ON DELETE CASCADE,
  -- Promotion tracking
  promotion_id varchar(100),
  promotion_start timestamptz,
  promotion_end timestamptz,
  terms_version varchar(50),
  accepted_by_id uuid REFERENCES profiles(id),
  accepted_at timestamptz,
  -- Paid subscription
  paid_activation_status text NOT NULL DEFAULT 'NOT_ACTIVATED',
  -- NOT_ACTIVATED, PENDING, ACTIVATED, FAILED
  billing_start timestamptz,
  subscription_status text NOT NULL DEFAULT 'PROMOTIONAL',
  -- PROMOTIONAL, ACTIVATION_PENDING, PAID_ACTIVE, PAST_DUE, CANCELLED, EXPIRED
  -- Payment provider references
  provider_customer_id varchar(200),
  provider_subscription_id varchar(200),
  provider_price_id varchar(200),
  payment_method_summary varchar(100),
  -- Billing cycle
  current_period_start timestamptz,
  current_period_end timestamptz,
  next_renewal_date timestamptz,
  cancelled_at timestamptz,
  cancellation_effective timestamptz,
  last_payment_failure timestamptz,
  last_payment_failure_reason text,
  -- Plan details (configurable, proposed)
  plan_name varchar(200) NOT NULL DEFAULT 'StrataVerze Contractor',
  plan_currency varchar(3) NOT NULL DEFAULT 'AUD',
  plan_monthly_price numeric(10,2) NOT NULL DEFAULT 65.00,
  plan_gst_inclusive boolean NOT NULL DEFAULT true,
  billing_timezone varchar(100) NOT NULL DEFAULT 'Australia/Sydney',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contractor_memberships_status
  ON contractor_memberships(subscription_status);

-- ─── contractor_declarations ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contractor_declarations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_business_id uuid NOT NULL REFERENCES contractor_businesses(id) ON DELETE CASCADE,
  declaration_type text NOT NULL,
  -- AUTHORITY_TO_REPRESENT, ACCURACY_OF_INFORMATION, OBLIGATION_TO_NOTIFY,
  -- PLATFORM_TERMS, PRIVACY_NOTICE, PROMOTIONAL_TERMS, MARKETING_CONSENT
  document_version varchar(50) NOT NULL,
  accepted boolean NOT NULL DEFAULT false,
  accepted_at timestamptz,
  accepted_by_id uuid REFERENCES profiles(id),
  ip_address varchar(45),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contractor_declarations_business
  ON contractor_declarations(contractor_business_id);
CREATE INDEX IF NOT EXISTS idx_contractor_declarations_type
  ON contractor_declarations(declaration_type);

-- ─── contractor_review_items ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contractor_review_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_business_id uuid NOT NULL REFERENCES contractor_businesses(id) ON DELETE CASCADE,
  queue_type text NOT NULL,
  -- NEW_APPLICATION, ABN_EXCEPTION, DUPLICATE_BUSINESS, LICENCE_REVIEW,
  -- INSURANCE_REVIEW, BANK_VERIFICATION, MISSING_INFORMATION,
  -- EXPIRING_DOCUMENT, PROMOTION_CONVERSION, BILLING_ISSUE
  status text NOT NULL DEFAULT 'PENDING',
  -- PENDING, IN_PROGRESS, AWAITING_RESPONSE, APPROVED, REJECTED, DEFERRED
  assigned_to_id uuid REFERENCES profiles(id),
  -- What is being reviewed
  entity_type varchar(100),
  entity_id uuid,
  -- Review details
  priority text NOT NULL DEFAULT 'NORMAL',
  -- LOW, NORMAL, HIGH, URGENT
  notes text,
  clarification_request text,
  clarification_response text,
  evidence text,
  outcome varchar(100),
  outcome_notes text,
  completed_by_id uuid REFERENCES profiles(id),
  review_date date,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contractor_review_items_business
  ON contractor_review_items(contractor_business_id);
CREATE INDEX IF NOT EXISTS idx_contractor_review_items_queue
  ON contractor_review_items(queue_type, status);
CREATE INDEX IF NOT EXISTS idx_contractor_review_items_assigned
  ON contractor_review_items(assigned_to_id);


-- ═══════════════════════════════════════════════════════════════════════
-- 3. ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════════

-- Helper: check if the current user owns the contractor business
-- (is a primary contact linked to it)
CREATE OR REPLACE FUNCTION public.is_contractor_owner(p_business_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM contractor_contacts
    WHERE contractor_business_id = p_business_id
      AND profile_id = current_profile_id()
      AND is_primary = true
      AND status = 'ACTIVE'
  );
$$;

-- Helper: check if the current user is any contact of the contractor business
CREATE OR REPLACE FUNCTION public.is_contractor_contact(p_business_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM contractor_contacts
    WHERE contractor_business_id = p_business_id
      AND profile_id = current_profile_id()
      AND status = 'ACTIVE'
  );
$$;

-- Helper: check if the current user is a compliance or admin reviewer
CREATE OR REPLACE FUNCTION public.is_contractor_reviewer()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM scheme_memberships
    WHERE profile_id = current_profile_id()
      AND role IN ('STRATA_MANAGER', 'BUILDING_MANAGER', 'ORG_ADMIN', 'COMPLIANCE_REVIEWER', 'CONTRACTOR_ADMIN')
  );
$$;

-- ─── contractor_businesses (update existing policies for self-service) ───
-- Drop the old insert policy that required manager role
DROP POLICY IF EXISTS "contractor_businesses_insert" ON contractor_businesses;

-- Allow any authenticated user to create their own business
CREATE POLICY "contractor_businesses_insert_self" ON contractor_businesses
  FOR INSERT WITH CHECK (
    current_profile_id() IS NOT NULL
  );

-- Allow own contacts or managers to update
DROP POLICY IF EXISTS "contractor_businesses_update" ON contractor_businesses;
CREATE POLICY "contractor_businesses_update_self_or_manager" ON contractor_businesses
  FOR UPDATE USING (
    is_contractor_contact(id)
    OR is_contractor_reviewer()
  );

-- ─── contractor_onboardings ─────────────────────────────────────────
ALTER TABLE contractor_onboardings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contractor_onboardings_select" ON contractor_onboardings
  FOR SELECT USING (
    is_contractor_contact(contractor_business_id)
    OR is_contractor_reviewer()
  );

CREATE POLICY "contractor_onboardings_insert" ON contractor_onboardings
  FOR INSERT WITH CHECK (
    is_contractor_owner(contractor_business_id)
  );

CREATE POLICY "contractor_onboardings_update" ON contractor_onboardings
  FOR UPDATE USING (
    is_contractor_contact(contractor_business_id)
    OR is_contractor_reviewer()
  );

-- ─── abn_lookup_records ─────────────────────────────────────────────
ALTER TABLE abn_lookup_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "abn_lookup_records_select" ON abn_lookup_records
  FOR SELECT USING (
    is_contractor_contact(contractor_business_id)
    OR is_contractor_reviewer()
  );

CREATE POLICY "abn_lookup_records_insert" ON abn_lookup_records
  FOR INSERT WITH CHECK (
    is_contractor_contact(contractor_business_id)
  );

-- ─── contractor_memberships ─────────────────────────────────────────
ALTER TABLE contractor_memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contractor_memberships_select" ON contractor_memberships
  FOR SELECT USING (
    is_contractor_contact(contractor_business_id)
    OR is_contractor_reviewer()
  );

CREATE POLICY "contractor_memberships_insert" ON contractor_memberships
  FOR INSERT WITH CHECK (
    is_contractor_owner(contractor_business_id)
  );

CREATE POLICY "contractor_memberships_update" ON contractor_memberships
  FOR UPDATE USING (
    is_contractor_contact(contractor_business_id)
    OR is_contractor_reviewer()
  );

-- ─── contractor_declarations ────────────────────────────────────────
ALTER TABLE contractor_declarations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contractor_declarations_select" ON contractor_declarations
  FOR SELECT USING (
    is_contractor_contact(contractor_business_id)
    OR is_contractor_reviewer()
  );

CREATE POLICY "contractor_declarations_insert" ON contractor_declarations
  FOR INSERT WITH CHECK (
    is_contractor_contact(contractor_business_id)
  );

-- Declarations are immutable once created; no UPDATE or DELETE policies

-- ─── contractor_review_items ────────────────────────────────────────
ALTER TABLE contractor_review_items ENABLE ROW LEVEL SECURITY;

-- Contractors can see their own review items (but not reviewer notes by default)
CREATE POLICY "contractor_review_items_select_own" ON contractor_review_items
  FOR SELECT USING (
    is_contractor_contact(contractor_business_id)
  );

-- Reviewers can see all review items
CREATE POLICY "contractor_review_items_select_reviewer" ON contractor_review_items
  FOR SELECT USING (
    is_contractor_reviewer()
  );

-- Only reviewers or system can create review items
CREATE POLICY "contractor_review_items_insert" ON contractor_review_items
  FOR INSERT WITH CHECK (
    is_contractor_contact(contractor_business_id)
    OR is_contractor_reviewer()
  );

-- Only reviewers can update review items
CREATE POLICY "contractor_review_items_update" ON contractor_review_items
  FOR UPDATE USING (
    is_contractor_reviewer()
  );

-- ─── Update contractor_contacts for self-service ────────────────────
-- Allow any authenticated user to create contractor contacts (for self-registration)
DROP POLICY IF EXISTS "contractor_contacts_insert" ON contractor_contacts;
CREATE POLICY "contractor_contacts_insert_self" ON contractor_contacts
  FOR INSERT WITH CHECK (
    current_profile_id() IS NOT NULL
    AND (profile_id = current_profile_id() OR is_contractor_reviewer())
  );

-- Update works_licences and works_insurances to allow contractor self-service
DROP POLICY IF EXISTS "works_licences_insert" ON works_licences;
CREATE POLICY "works_licences_insert_self_or_manager" ON works_licences
  FOR INSERT WITH CHECK (
    is_contractor_contact(contractor_business_id)
    OR is_contractor_reviewer()
  );

DROP POLICY IF EXISTS "works_licences_update" ON works_licences;
CREATE POLICY "works_licences_update_self_or_manager" ON works_licences
  FOR UPDATE USING (
    is_contractor_contact(contractor_business_id)
    OR is_contractor_reviewer()
  );

DROP POLICY IF EXISTS "works_licences_delete" ON works_licences;
CREATE POLICY "works_licences_delete_self_or_manager" ON works_licences
  FOR DELETE USING (
    is_contractor_contact(contractor_business_id)
    OR is_contractor_reviewer()
  );

DROP POLICY IF EXISTS "works_insurances_insert" ON works_insurances;
CREATE POLICY "works_insurances_insert_self_or_manager" ON works_insurances
  FOR INSERT WITH CHECK (
    is_contractor_contact(contractor_business_id)
    OR is_contractor_reviewer()
  );

DROP POLICY IF EXISTS "works_insurances_update" ON works_insurances;
CREATE POLICY "works_insurances_update_self_or_manager" ON works_insurances
  FOR UPDATE USING (
    is_contractor_contact(contractor_business_id)
    OR is_contractor_reviewer()
  );

DROP POLICY IF EXISTS "works_insurances_delete" ON works_insurances;
CREATE POLICY "works_insurances_delete_self_or_manager" ON works_insurances
  FOR DELETE USING (
    is_contractor_contact(contractor_business_id)
    OR is_contractor_reviewer()
  );

-- Update works_bank_detail_versions for self-service
DROP POLICY IF EXISTS "works_bank_detail_versions_insert" ON works_bank_detail_versions;
CREATE POLICY "works_bank_detail_versions_insert_self" ON works_bank_detail_versions
  FOR INSERT WITH CHECK (
    is_contractor_contact(contractor_business_id)
  );


-- ═══════════════════════════════════════════════════════════════════════
-- 4. UPDATED_AT TRIGGERS
-- ═══════════════════════════════════════════════════════════════════════

-- Reusable trigger function (may already exist)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at_contractor_onboardings
  BEFORE UPDATE ON contractor_onboardings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at_contractor_memberships
  BEFORE UPDATE ON contractor_memberships
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at_contractor_review_items
  BEFORE UPDATE ON contractor_review_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
