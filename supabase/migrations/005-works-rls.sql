-- StrataVerze Works Module: Row Level Security
-- Migration 005: RLS policies for organisations, organisation_memberships,
-- contractor tables, and all works_* tables.
--
-- Depends on: 004-row-level-security.sql (helper functions already deployed)
--   current_profile_id(), is_scheme_member(), has_scheme_role(), is_scheme_manager()
--
-- Pattern:
--   Tables WITH scheme_id  → is_scheme_member(scheme_id) for SELECT,
--                             is_scheme_manager(scheme_id) for INSERT/UPDATE/DELETE
--   Tables WITHOUT scheme_id → JOIN through parent to resolve scheme_id
--   Organisation tables     → new is_org_member() helper
--   Contractor tables       → shared directory, any authenticated user can read
--
-- NOTE: Supabase service_role key bypasses RLS. Server actions use service role
-- via Prisma, so RLS is defence in depth for direct Supabase client access.

-- ─── Helper: Organisation membership check ─────────────────────────────

CREATE OR REPLACE FUNCTION public.is_org_member(p_org_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM organisation_memberships
    WHERE organisation_id = p_org_id
      AND profile_id = current_profile_id()
      AND is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.is_org_admin(p_org_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM organisation_memberships
    WHERE organisation_id = p_org_id
      AND profile_id = current_profile_id()
      AND is_active = true
      AND role IN ('ORG_ADMIN', 'STRATA_MANAGER')
  );
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- ORGANISATION LAYER
-- ═══════════════════════════════════════════════════════════════════════

-- ─── organisations ─────────────────────────────────────────────────────
ALTER TABLE organisations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "organisations_select" ON organisations
  FOR SELECT USING (
    is_org_member(id)
    OR EXISTS (
      SELECT 1 FROM schemes s
      JOIN scheme_memberships sm ON sm.scheme_id = s.id
      WHERE s.organisation_id = organisations.id
        AND sm.profile_id = current_profile_id()
    )
  );

CREATE POLICY "organisations_insert" ON organisations
  FOR INSERT WITH CHECK (true);
  -- Any authenticated user can create an org (they become admin)

CREATE POLICY "organisations_update" ON organisations
  FOR UPDATE USING (is_org_admin(id))
  WITH CHECK (is_org_admin(id));

CREATE POLICY "organisations_delete" ON organisations
  FOR DELETE USING (is_org_admin(id));

-- ─── organisation_memberships ──────────────────────────────────────────
ALTER TABLE organisation_memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_memberships_select" ON organisation_memberships
  FOR SELECT USING (
    is_org_member(organisation_id)
    OR profile_id = current_profile_id()
  );

CREATE POLICY "org_memberships_insert" ON organisation_memberships
  FOR INSERT WITH CHECK (is_org_admin(organisation_id));

CREATE POLICY "org_memberships_update" ON organisation_memberships
  FOR UPDATE USING (is_org_admin(organisation_id))
  WITH CHECK (is_org_admin(organisation_id));

CREATE POLICY "org_memberships_delete" ON organisation_memberships
  FOR DELETE USING (is_org_admin(organisation_id));

-- ═══════════════════════════════════════════════════════════════════════
-- CONTRACTOR TABLES (shared directory)
-- ═══════════════════════════════════════════════════════════════════════

-- ─── contractor_businesses ─────────────────────────────────────────────
-- Contractors are a shared directory: any scheme member can view,
-- only managers can create/edit (they manage contractor onboarding).
ALTER TABLE contractor_businesses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contractor_businesses_select" ON contractor_businesses
  FOR SELECT USING (
    current_profile_id() IS NOT NULL
  );

CREATE POLICY "contractor_businesses_insert" ON contractor_businesses
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM scheme_memberships sm
      WHERE sm.profile_id = current_profile_id()
        AND sm.role IN ('ADVISER', 'STRATA_MANAGER', 'BUILDING_MANAGER', 'ORG_ADMIN')
    )
  );

CREATE POLICY "contractor_businesses_update" ON contractor_businesses
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM scheme_memberships sm
      WHERE sm.profile_id = current_profile_id()
        AND sm.role IN ('ADVISER', 'STRATA_MANAGER', 'BUILDING_MANAGER', 'ORG_ADMIN')
    )
  );

CREATE POLICY "contractor_businesses_delete" ON contractor_businesses
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM scheme_memberships sm
      WHERE sm.profile_id = current_profile_id()
        AND sm.role IN ('ADVISER', 'STRATA_MANAGER', 'BUILDING_MANAGER', 'ORG_ADMIN')
    )
  );

-- ─── contractor_contacts ───────────────────────────────────────────────
ALTER TABLE contractor_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contractor_contacts_select" ON contractor_contacts
  FOR SELECT USING (
    current_profile_id() IS NOT NULL
  );

CREATE POLICY "contractor_contacts_insert" ON contractor_contacts
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM scheme_memberships sm
      WHERE sm.profile_id = current_profile_id()
        AND sm.role IN ('ADVISER', 'STRATA_MANAGER', 'BUILDING_MANAGER', 'ORG_ADMIN')
    )
  );

CREATE POLICY "contractor_contacts_update" ON contractor_contacts
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM scheme_memberships sm
      WHERE sm.profile_id = current_profile_id()
        AND sm.role IN ('ADVISER', 'STRATA_MANAGER', 'BUILDING_MANAGER', 'ORG_ADMIN')
    )
  );

CREATE POLICY "contractor_contacts_delete" ON contractor_contacts
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM scheme_memberships sm
      WHERE sm.profile_id = current_profile_id()
        AND sm.role IN ('ADVISER', 'STRATA_MANAGER', 'BUILDING_MANAGER', 'ORG_ADMIN')
    )
  );

-- ═══════════════════════════════════════════════════════════════════════
-- WORKS MODULE: CONFIGURATION (have scheme_id or org_id)
-- ═══════════════════════════════════════════════════════════════════════

-- ─── works_categories ──────────────────────────────────────────────────
-- Has nullable scheme_id and nullable org_id
ALTER TABLE works_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "works_categories_select" ON works_categories
  FOR SELECT USING (
    (scheme_id IS NOT NULL AND is_scheme_member(scheme_id))
    OR (org_id IS NOT NULL AND is_org_member(org_id))
    OR (scheme_id IS NULL AND org_id IS NULL)
  );

CREATE POLICY "works_categories_insert" ON works_categories
  FOR INSERT WITH CHECK (
    (scheme_id IS NOT NULL AND is_scheme_manager(scheme_id))
    OR (org_id IS NOT NULL AND is_org_admin(org_id))
  );

CREATE POLICY "works_categories_update" ON works_categories
  FOR UPDATE USING (
    (scheme_id IS NOT NULL AND is_scheme_manager(scheme_id))
    OR (org_id IS NOT NULL AND is_org_admin(org_id))
  );

CREATE POLICY "works_categories_delete" ON works_categories
  FOR DELETE USING (
    (scheme_id IS NOT NULL AND is_scheme_manager(scheme_id))
    OR (org_id IS NOT NULL AND is_org_admin(org_id))
  );

-- ─── works_approval_routes ─────────────────────────────────────────────
-- Has nullable scheme_id and nullable org_id
ALTER TABLE works_approval_routes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "works_approval_routes_select" ON works_approval_routes
  FOR SELECT USING (
    (scheme_id IS NOT NULL AND is_scheme_member(scheme_id))
    OR (org_id IS NOT NULL AND is_org_member(org_id))
  );

CREATE POLICY "works_approval_routes_insert" ON works_approval_routes
  FOR INSERT WITH CHECK (
    (scheme_id IS NOT NULL AND is_scheme_manager(scheme_id))
    OR (org_id IS NOT NULL AND is_org_admin(org_id))
  );

CREATE POLICY "works_approval_routes_update" ON works_approval_routes
  FOR UPDATE USING (
    (scheme_id IS NOT NULL AND is_scheme_manager(scheme_id))
    OR (org_id IS NOT NULL AND is_org_admin(org_id))
  );

CREATE POLICY "works_approval_routes_delete" ON works_approval_routes
  FOR DELETE USING (
    (scheme_id IS NOT NULL AND is_scheme_manager(scheme_id))
    OR (org_id IS NOT NULL AND is_org_admin(org_id))
  );

-- ─── works_delegations ─────────────────────────────────────────────────
ALTER TABLE works_delegations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "works_delegations_select" ON works_delegations
  FOR SELECT USING (is_scheme_member(scheme_id));

CREATE POLICY "works_delegations_insert" ON works_delegations
  FOR INSERT WITH CHECK (is_scheme_manager(scheme_id));

CREATE POLICY "works_delegations_update" ON works_delegations
  FOR UPDATE USING (is_scheme_manager(scheme_id))
  WITH CHECK (is_scheme_manager(scheme_id));

CREATE POLICY "works_delegations_delete" ON works_delegations
  FOR DELETE USING (is_scheme_manager(scheme_id));

-- ═══════════════════════════════════════════════════════════════════════
-- WORKS MODULE: REQUESTS
-- ═══════════════════════════════════════════════════════════════════════

-- ─── works_requests ────────────────────────────────────────────────────
ALTER TABLE works_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "works_requests_select" ON works_requests
  FOR SELECT USING (is_scheme_member(scheme_id));

CREATE POLICY "works_requests_insert" ON works_requests
  FOR INSERT WITH CHECK (is_scheme_member(scheme_id));

CREATE POLICY "works_requests_update" ON works_requests
  FOR UPDATE USING (is_scheme_manager(scheme_id))
  WITH CHECK (is_scheme_manager(scheme_id));

CREATE POLICY "works_requests_delete" ON works_requests
  FOR DELETE USING (is_scheme_manager(scheme_id));

-- ─── works_request_versions ────────────────────────────────────────────
ALTER TABLE works_request_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "works_request_versions_select" ON works_request_versions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM works_requests wr
      WHERE wr.id = works_request_versions.request_id
        AND is_scheme_member(wr.scheme_id)
    )
  );

CREATE POLICY "works_request_versions_insert" ON works_request_versions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM works_requests wr
      WHERE wr.id = works_request_versions.request_id
        AND is_scheme_member(wr.scheme_id)
    )
  );

CREATE POLICY "works_request_versions_update" ON works_request_versions
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM works_requests wr
      WHERE wr.id = works_request_versions.request_id
        AND is_scheme_manager(wr.scheme_id)
    )
  );

-- ─── works_request_reviews ─────────────────────────────────────────────
ALTER TABLE works_request_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "works_request_reviews_select" ON works_request_reviews
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM works_requests wr
      WHERE wr.id = works_request_reviews.request_id
        AND is_scheme_member(wr.scheme_id)
    )
  );

CREATE POLICY "works_request_reviews_insert" ON works_request_reviews
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM works_requests wr
      WHERE wr.id = works_request_reviews.request_id
        AND is_scheme_manager(wr.scheme_id)
    )
  );

CREATE POLICY "works_request_reviews_update" ON works_request_reviews
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM works_requests wr
      WHERE wr.id = works_request_reviews.request_id
        AND is_scheme_manager(wr.scheme_id)
    )
  );

-- ═══════════════════════════════════════════════════════════════════════
-- WORKS MODULE: SCOPE & RFQ
-- ═══════════════════════════════════════════════════════════════════════

-- ─── works_scopes ──────────────────────────────────────────────────────
ALTER TABLE works_scopes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "works_scopes_select" ON works_scopes
  FOR SELECT USING (is_scheme_member(scheme_id));

CREATE POLICY "works_scopes_insert" ON works_scopes
  FOR INSERT WITH CHECK (is_scheme_manager(scheme_id));

CREATE POLICY "works_scopes_update" ON works_scopes
  FOR UPDATE USING (is_scheme_manager(scheme_id))
  WITH CHECK (is_scheme_manager(scheme_id));

CREATE POLICY "works_scopes_delete" ON works_scopes
  FOR DELETE USING (is_scheme_manager(scheme_id));

-- ─── works_scope_versions ──────────────────────────────────────────────
ALTER TABLE works_scope_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "works_scope_versions_select" ON works_scope_versions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM works_scopes ws
      WHERE ws.id = works_scope_versions.scope_id
        AND is_scheme_member(ws.scheme_id)
    )
  );

CREATE POLICY "works_scope_versions_insert" ON works_scope_versions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM works_scopes ws
      WHERE ws.id = works_scope_versions.scope_id
        AND is_scheme_manager(ws.scheme_id)
    )
  );

-- ─── works_rfqs ────────────────────────────────────────────────────────
ALTER TABLE works_rfqs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "works_rfqs_select" ON works_rfqs
  FOR SELECT USING (is_scheme_member(scheme_id));

CREATE POLICY "works_rfqs_insert" ON works_rfqs
  FOR INSERT WITH CHECK (is_scheme_manager(scheme_id));

CREATE POLICY "works_rfqs_update" ON works_rfqs
  FOR UPDATE USING (is_scheme_manager(scheme_id))
  WITH CHECK (is_scheme_manager(scheme_id));

CREATE POLICY "works_rfqs_delete" ON works_rfqs
  FOR DELETE USING (is_scheme_manager(scheme_id));

-- ─── works_rfq_invitations ─────────────────────────────────────────────
ALTER TABLE works_rfq_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "works_rfq_invitations_select" ON works_rfq_invitations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM works_rfqs wr
      WHERE wr.id = works_rfq_invitations.rfq_id
        AND is_scheme_member(wr.scheme_id)
    )
  );

CREATE POLICY "works_rfq_invitations_insert" ON works_rfq_invitations
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM works_rfqs wr
      WHERE wr.id = works_rfq_invitations.rfq_id
        AND is_scheme_manager(wr.scheme_id)
    )
  );

CREATE POLICY "works_rfq_invitations_update" ON works_rfq_invitations
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM works_rfqs wr
      WHERE wr.id = works_rfq_invitations.rfq_id
        AND is_scheme_manager(wr.scheme_id)
    )
  );

-- ─── works_rfq_clarifications ──────────────────────────────────────────
ALTER TABLE works_rfq_clarifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "works_rfq_clarifications_select" ON works_rfq_clarifications
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM works_rfqs wr
      WHERE wr.id = works_rfq_clarifications.rfq_id
        AND is_scheme_member(wr.scheme_id)
    )
  );

CREATE POLICY "works_rfq_clarifications_insert" ON works_rfq_clarifications
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM works_rfqs wr
      WHERE wr.id = works_rfq_clarifications.rfq_id
        AND is_scheme_member(wr.scheme_id)
    )
  );

CREATE POLICY "works_rfq_clarifications_update" ON works_rfq_clarifications
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM works_rfqs wr
      WHERE wr.id = works_rfq_clarifications.rfq_id
        AND is_scheme_manager(wr.scheme_id)
    )
  );

-- ─── works_rfq_addenda ─────────────────────────────────────────────────
ALTER TABLE works_rfq_addenda ENABLE ROW LEVEL SECURITY;

CREATE POLICY "works_rfq_addenda_select" ON works_rfq_addenda
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM works_rfqs wr
      WHERE wr.id = works_rfq_addenda.rfq_id
        AND is_scheme_member(wr.scheme_id)
    )
  );

CREATE POLICY "works_rfq_addenda_insert" ON works_rfq_addenda
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM works_rfqs wr
      WHERE wr.id = works_rfq_addenda.rfq_id
        AND is_scheme_manager(wr.scheme_id)
    )
  );

-- ═══════════════════════════════════════════════════════════════════════
-- WORKS MODULE: COMPLIANCE (3-layer)
-- ═══════════════════════════════════════════════════════════════════════

-- ─── works_compliance_requirements ─────────────────────────────────────
-- Has nullable scheme_id and nullable org_id
ALTER TABLE works_compliance_requirements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "works_compliance_requirements_select" ON works_compliance_requirements
  FOR SELECT USING (
    (scheme_id IS NOT NULL AND is_scheme_member(scheme_id))
    OR (org_id IS NOT NULL AND is_org_member(org_id))
  );

CREATE POLICY "works_compliance_requirements_insert" ON works_compliance_requirements
  FOR INSERT WITH CHECK (
    (scheme_id IS NOT NULL AND is_scheme_manager(scheme_id))
    OR (org_id IS NOT NULL AND is_org_admin(org_id))
  );

CREATE POLICY "works_compliance_requirements_update" ON works_compliance_requirements
  FOR UPDATE USING (
    (scheme_id IS NOT NULL AND is_scheme_manager(scheme_id))
    OR (org_id IS NOT NULL AND is_org_admin(org_id))
  );

CREATE POLICY "works_compliance_requirements_delete" ON works_compliance_requirements
  FOR DELETE USING (
    (scheme_id IS NOT NULL AND is_scheme_manager(scheme_id))
    OR (org_id IS NOT NULL AND is_org_admin(org_id))
  );

-- ─── works_compliance_checks ───────────────────────────────────────────
-- Links to requirement, contractor, and optionally work_order
ALTER TABLE works_compliance_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "works_compliance_checks_select" ON works_compliance_checks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM works_compliance_requirements wcr
      WHERE wcr.id = works_compliance_checks.requirement_id
        AND (
          (wcr.scheme_id IS NOT NULL AND is_scheme_member(wcr.scheme_id))
          OR (wcr.org_id IS NOT NULL AND is_org_member(wcr.org_id))
        )
    )
  );

CREATE POLICY "works_compliance_checks_insert" ON works_compliance_checks
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM works_compliance_requirements wcr
      WHERE wcr.id = works_compliance_checks.requirement_id
        AND (
          (wcr.scheme_id IS NOT NULL AND is_scheme_manager(wcr.scheme_id))
          OR (wcr.org_id IS NOT NULL AND is_org_admin(wcr.org_id))
        )
    )
  );

CREATE POLICY "works_compliance_checks_update" ON works_compliance_checks
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM works_compliance_requirements wcr
      WHERE wcr.id = works_compliance_checks.requirement_id
        AND (
          (wcr.scheme_id IS NOT NULL AND is_scheme_manager(wcr.scheme_id))
          OR (wcr.org_id IS NOT NULL AND is_org_admin(wcr.org_id))
        )
    )
  );

-- ─── works_licences ────────────────────────────────────────────────────
-- Child of contractor_businesses (shared directory)
ALTER TABLE works_licences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "works_licences_select" ON works_licences
  FOR SELECT USING (current_profile_id() IS NOT NULL);

CREATE POLICY "works_licences_insert" ON works_licences
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM scheme_memberships sm
      WHERE sm.profile_id = current_profile_id()
        AND sm.role IN ('ADVISER', 'STRATA_MANAGER', 'BUILDING_MANAGER', 'COMPLIANCE_REVIEWER', 'ORG_ADMIN')
    )
  );

CREATE POLICY "works_licences_update" ON works_licences
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM scheme_memberships sm
      WHERE sm.profile_id = current_profile_id()
        AND sm.role IN ('ADVISER', 'STRATA_MANAGER', 'BUILDING_MANAGER', 'COMPLIANCE_REVIEWER', 'ORG_ADMIN')
    )
  );

-- ─── works_insurances ──────────────────────────────────────────────────
ALTER TABLE works_insurances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "works_insurances_select" ON works_insurances
  FOR SELECT USING (current_profile_id() IS NOT NULL);

CREATE POLICY "works_insurances_insert" ON works_insurances
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM scheme_memberships sm
      WHERE sm.profile_id = current_profile_id()
        AND sm.role IN ('ADVISER', 'STRATA_MANAGER', 'BUILDING_MANAGER', 'COMPLIANCE_REVIEWER', 'ORG_ADMIN')
    )
  );

CREATE POLICY "works_insurances_update" ON works_insurances
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM scheme_memberships sm
      WHERE sm.profile_id = current_profile_id()
        AND sm.role IN ('ADVISER', 'STRATA_MANAGER', 'BUILDING_MANAGER', 'COMPLIANCE_REVIEWER', 'ORG_ADMIN')
    )
  );

-- ─── works_verification_events ─────────────────────────────────────────
ALTER TABLE works_verification_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "works_verification_events_select" ON works_verification_events
  FOR SELECT USING (current_profile_id() IS NOT NULL);

CREATE POLICY "works_verification_events_insert" ON works_verification_events
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM scheme_memberships sm
      WHERE sm.profile_id = current_profile_id()
        AND sm.role IN ('ADVISER', 'STRATA_MANAGER', 'BUILDING_MANAGER', 'COMPLIANCE_REVIEWER', 'ORG_ADMIN')
    )
  );

-- ═══════════════════════════════════════════════════════════════════════
-- WORKS MODULE: QUOTATIONS & EVALUATION
-- ═══════════════════════════════════════════════════════════════════════

-- ─── works_quotations ──────────────────────────────────────────────────
-- Child of works_rfqs (which has scheme_id)
ALTER TABLE works_quotations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "works_quotations_select" ON works_quotations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM works_rfqs wr
      WHERE wr.id = works_quotations.rfq_id
        AND is_scheme_member(wr.scheme_id)
    )
  );

CREATE POLICY "works_quotations_insert" ON works_quotations
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM works_rfqs wr
      WHERE wr.id = works_quotations.rfq_id
        AND is_scheme_member(wr.scheme_id)
    )
  );

CREATE POLICY "works_quotations_update" ON works_quotations
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM works_rfqs wr
      WHERE wr.id = works_quotations.rfq_id
        AND is_scheme_manager(wr.scheme_id)
    )
  );

-- ─── works_quotation_versions ──────────────────────────────────────────
ALTER TABLE works_quotation_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "works_quotation_versions_select" ON works_quotation_versions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM works_quotations wq
      JOIN works_rfqs wr ON wr.id = wq.rfq_id
      WHERE wq.id = works_quotation_versions.quotation_id
        AND is_scheme_member(wr.scheme_id)
    )
  );

CREATE POLICY "works_quotation_versions_insert" ON works_quotation_versions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM works_quotations wq
      JOIN works_rfqs wr ON wr.id = wq.rfq_id
      WHERE wq.id = works_quotation_versions.quotation_id
        AND is_scheme_member(wr.scheme_id)
    )
  );

-- ─── works_quotation_line_items ────────────────────────────────────────
ALTER TABLE works_quotation_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "works_quotation_line_items_select" ON works_quotation_line_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM works_quotations wq
      JOIN works_rfqs wr ON wr.id = wq.rfq_id
      WHERE wq.id = works_quotation_line_items.quotation_id
        AND is_scheme_member(wr.scheme_id)
    )
  );

CREATE POLICY "works_quotation_line_items_insert" ON works_quotation_line_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM works_quotations wq
      JOIN works_rfqs wr ON wr.id = wq.rfq_id
      WHERE wq.id = works_quotation_line_items.quotation_id
        AND is_scheme_member(wr.scheme_id)
    )
  );

CREATE POLICY "works_quotation_line_items_update" ON works_quotation_line_items
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM works_quotations wq
      JOIN works_rfqs wr ON wr.id = wq.rfq_id
      WHERE wq.id = works_quotation_line_items.quotation_id
        AND is_scheme_manager(wr.scheme_id)
    )
  );

-- ─── works_evaluations ─────────────────────────────────────────────────
ALTER TABLE works_evaluations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "works_evaluations_select" ON works_evaluations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM works_rfqs wr
      WHERE wr.id = works_evaluations.rfq_id
        AND is_scheme_member(wr.scheme_id)
    )
  );

CREATE POLICY "works_evaluations_insert" ON works_evaluations
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM works_rfqs wr
      WHERE wr.id = works_evaluations.rfq_id
        AND is_scheme_manager(wr.scheme_id)
    )
  );

CREATE POLICY "works_evaluations_update" ON works_evaluations
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM works_rfqs wr
      WHERE wr.id = works_evaluations.rfq_id
        AND is_scheme_manager(wr.scheme_id)
    )
  );

-- ─── works_evaluation_criteria ─────────────────────────────────────────
ALTER TABLE works_evaluation_criteria ENABLE ROW LEVEL SECURITY;

CREATE POLICY "works_evaluation_criteria_select" ON works_evaluation_criteria
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM works_evaluations we
      JOIN works_rfqs wr ON wr.id = we.rfq_id
      WHERE we.id = works_evaluation_criteria.evaluation_id
        AND is_scheme_member(wr.scheme_id)
    )
  );

CREATE POLICY "works_evaluation_criteria_insert" ON works_evaluation_criteria
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM works_evaluations we
      JOIN works_rfqs wr ON wr.id = we.rfq_id
      WHERE we.id = works_evaluation_criteria.evaluation_id
        AND is_scheme_manager(wr.scheme_id)
    )
  );

-- ─── works_recommendations ─────────────────────────────────────────────
ALTER TABLE works_recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "works_recommendations_select" ON works_recommendations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM works_quotations wq
      JOIN works_rfqs wr ON wr.id = wq.rfq_id
      WHERE wq.id = works_recommendations.quotation_id
        AND is_scheme_member(wr.scheme_id)
    )
  );

CREATE POLICY "works_recommendations_insert" ON works_recommendations
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM works_quotations wq
      JOIN works_rfqs wr ON wr.id = wq.rfq_id
      WHERE wq.id = works_recommendations.quotation_id
        AND is_scheme_manager(wr.scheme_id)
    )
  );

CREATE POLICY "works_recommendations_update" ON works_recommendations
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM works_quotations wq
      JOIN works_rfqs wr ON wr.id = wq.rfq_id
      WHERE wq.id = works_recommendations.quotation_id
        AND is_scheme_manager(wr.scheme_id)
    )
  );

-- ═══════════════════════════════════════════════════════════════════════
-- WORKS MODULE: APPROVALS
-- ═══════════════════════════════════════════════════════════════════════

-- ─── works_approval_workflows ──────────────────────────────────────────
ALTER TABLE works_approval_workflows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "works_approval_workflows_select" ON works_approval_workflows
  FOR SELECT USING (is_scheme_member(scheme_id));

CREATE POLICY "works_approval_workflows_insert" ON works_approval_workflows
  FOR INSERT WITH CHECK (is_scheme_manager(scheme_id));

CREATE POLICY "works_approval_workflows_update" ON works_approval_workflows
  FOR UPDATE USING (is_scheme_manager(scheme_id))
  WITH CHECK (is_scheme_manager(scheme_id));

-- ─── works_approval_records ────────────────────────────────────────────
ALTER TABLE works_approval_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "works_approval_records_select" ON works_approval_records
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM works_approval_workflows waw
      WHERE waw.id = works_approval_records.workflow_id
        AND is_scheme_member(waw.scheme_id)
    )
  );

CREATE POLICY "works_approval_records_insert" ON works_approval_records
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM works_approval_workflows waw
      WHERE waw.id = works_approval_records.workflow_id
        AND is_scheme_member(waw.scheme_id)
    )
  );

-- ═══════════════════════════════════════════════════════════════════════
-- WORKS MODULE: CONTRACTS & DELIVERY
-- ═══════════════════════════════════════════════════════════════════════

-- ─── works_contracts ───────────────────────────────────────────────────
ALTER TABLE works_contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "works_contracts_select" ON works_contracts
  FOR SELECT USING (is_scheme_member(scheme_id));

CREATE POLICY "works_contracts_insert" ON works_contracts
  FOR INSERT WITH CHECK (is_scheme_manager(scheme_id));

CREATE POLICY "works_contracts_update" ON works_contracts
  FOR UPDATE USING (is_scheme_manager(scheme_id))
  WITH CHECK (is_scheme_manager(scheme_id));

CREATE POLICY "works_contracts_delete" ON works_contracts
  FOR DELETE USING (is_scheme_manager(scheme_id));

-- ─── works_work_orders ─────────────────────────────────────────────────
ALTER TABLE works_work_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "works_work_orders_select" ON works_work_orders
  FOR SELECT USING (is_scheme_member(scheme_id));

CREATE POLICY "works_work_orders_insert" ON works_work_orders
  FOR INSERT WITH CHECK (is_scheme_manager(scheme_id));

CREATE POLICY "works_work_orders_update" ON works_work_orders
  FOR UPDATE USING (is_scheme_manager(scheme_id))
  WITH CHECK (is_scheme_manager(scheme_id));

-- ─── works_milestones ──────────────────────────────────────────────────
ALTER TABLE works_milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "works_milestones_select" ON works_milestones
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM works_work_orders wwo
      WHERE wwo.id = works_milestones.work_order_id
        AND is_scheme_member(wwo.scheme_id)
    )
  );

CREATE POLICY "works_milestones_insert" ON works_milestones
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM works_work_orders wwo
      WHERE wwo.id = works_milestones.work_order_id
        AND is_scheme_manager(wwo.scheme_id)
    )
  );

CREATE POLICY "works_milestones_update" ON works_milestones
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM works_work_orders wwo
      WHERE wwo.id = works_milestones.work_order_id
        AND is_scheme_manager(wwo.scheme_id)
    )
  );

-- ─── works_site_visits ─────────────────────────────────────────────────
ALTER TABLE works_site_visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "works_site_visits_select" ON works_site_visits
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM works_work_orders wwo
      WHERE wwo.id = works_site_visits.work_order_id
        AND is_scheme_member(wwo.scheme_id)
    )
  );

CREATE POLICY "works_site_visits_insert" ON works_site_visits
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM works_work_orders wwo
      WHERE wwo.id = works_site_visits.work_order_id
        AND is_scheme_member(wwo.scheme_id)
    )
  );

-- ─── works_progress_reports ────────────────────────────────────────────
ALTER TABLE works_progress_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "works_progress_reports_select" ON works_progress_reports
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM works_work_orders wwo
      WHERE wwo.id = works_progress_reports.work_order_id
        AND is_scheme_member(wwo.scheme_id)
    )
  );

CREATE POLICY "works_progress_reports_insert" ON works_progress_reports
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM works_work_orders wwo
      WHERE wwo.id = works_progress_reports.work_order_id
        AND is_scheme_member(wwo.scheme_id)
    )
  );

-- ─── works_variations ──────────────────────────────────────────────────
ALTER TABLE works_variations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "works_variations_select" ON works_variations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM works_contracts wc
      WHERE wc.id = works_variations.contract_id
        AND is_scheme_member(wc.scheme_id)
    )
  );

CREATE POLICY "works_variations_insert" ON works_variations
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM works_contracts wc
      WHERE wc.id = works_variations.contract_id
        AND is_scheme_member(wc.scheme_id)
    )
  );

CREATE POLICY "works_variations_update" ON works_variations
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM works_contracts wc
      WHERE wc.id = works_variations.contract_id
        AND is_scheme_manager(wc.scheme_id)
    )
  );

-- ─── works_inspections ─────────────────────────────────────────────────
ALTER TABLE works_inspections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "works_inspections_select" ON works_inspections
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM works_work_orders wwo
      WHERE wwo.id = works_inspections.work_order_id
        AND is_scheme_member(wwo.scheme_id)
    )
  );

CREATE POLICY "works_inspections_insert" ON works_inspections
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM works_work_orders wwo
      WHERE wwo.id = works_inspections.work_order_id
        AND is_scheme_member(wwo.scheme_id)
    )
  );

-- ─── works_defects ─────────────────────────────────────────────────────
ALTER TABLE works_defects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "works_defects_select" ON works_defects
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM works_inspections wi
      JOIN works_work_orders wwo ON wwo.id = wi.work_order_id
      WHERE wi.id = works_defects.inspection_id
        AND is_scheme_member(wwo.scheme_id)
    )
  );

CREATE POLICY "works_defects_insert" ON works_defects
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM works_inspections wi
      JOIN works_work_orders wwo ON wwo.id = wi.work_order_id
      WHERE wi.id = works_defects.inspection_id
        AND is_scheme_member(wwo.scheme_id)
    )
  );

CREATE POLICY "works_defects_update" ON works_defects
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM works_inspections wi
      JOIN works_work_orders wwo ON wwo.id = wi.work_order_id
      WHERE wi.id = works_defects.inspection_id
        AND is_scheme_manager(wwo.scheme_id)
    )
  );

-- ─── works_completion_submissions ──────────────────────────────────────
ALTER TABLE works_completion_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "works_completion_submissions_select" ON works_completion_submissions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM works_work_orders wwo
      WHERE wwo.id = works_completion_submissions.work_order_id
        AND is_scheme_member(wwo.scheme_id)
    )
  );

CREATE POLICY "works_completion_submissions_insert" ON works_completion_submissions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM works_work_orders wwo
      WHERE wwo.id = works_completion_submissions.work_order_id
        AND is_scheme_member(wwo.scheme_id)
    )
  );

CREATE POLICY "works_completion_submissions_update" ON works_completion_submissions
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM works_work_orders wwo
      WHERE wwo.id = works_completion_submissions.work_order_id
        AND is_scheme_manager(wwo.scheme_id)
    )
  );

-- ═══════════════════════════════════════════════════════════════════════
-- WORKS MODULE: INVOICES & PAYMENTS
-- ═══════════════════════════════════════════════════════════════════════

-- ─── works_invoices ────────────────────────────────────────────────────
ALTER TABLE works_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "works_invoices_select" ON works_invoices
  FOR SELECT USING (is_scheme_member(scheme_id));

CREATE POLICY "works_invoices_insert" ON works_invoices
  FOR INSERT WITH CHECK (is_scheme_member(scheme_id));

CREATE POLICY "works_invoices_update" ON works_invoices
  FOR UPDATE USING (is_scheme_manager(scheme_id))
  WITH CHECK (is_scheme_manager(scheme_id));

-- ─── works_payment_assessments ─────────────────────────────────────────
ALTER TABLE works_payment_assessments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "works_payment_assessments_select" ON works_payment_assessments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM works_invoices wi
      WHERE wi.id = works_payment_assessments.invoice_id
        AND is_scheme_member(wi.scheme_id)
    )
  );

CREATE POLICY "works_payment_assessments_insert" ON works_payment_assessments
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM works_invoices wi
      WHERE wi.id = works_payment_assessments.invoice_id
        AND is_scheme_manager(wi.scheme_id)
    )
  );

-- ─── works_bank_detail_versions ────────────────────────────────────────
-- Child of contractor_businesses (shared directory, sensitive data)
ALTER TABLE works_bank_detail_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "works_bank_detail_versions_select" ON works_bank_detail_versions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM scheme_memberships sm
      WHERE sm.profile_id = current_profile_id()
        AND sm.role IN ('ADVISER', 'STRATA_MANAGER', 'ACCOUNTS_OFFICER', 'PAYMENT_AUTHORISER', 'ORG_ADMIN', 'AUDITOR')
    )
  );

CREATE POLICY "works_bank_detail_versions_insert" ON works_bank_detail_versions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM scheme_memberships sm
      WHERE sm.profile_id = current_profile_id()
        AND sm.role IN ('ADVISER', 'STRATA_MANAGER', 'ACCOUNTS_OFFICER', 'ORG_ADMIN')
    )
  );

CREATE POLICY "works_bank_detail_versions_update" ON works_bank_detail_versions
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM scheme_memberships sm
      WHERE sm.profile_id = current_profile_id()
        AND sm.role IN ('ADVISER', 'STRATA_MANAGER', 'ACCOUNTS_OFFICER', 'ORG_ADMIN')
    )
  );

-- ─── works_payment_instructions ────────────────────────────────────────
ALTER TABLE works_payment_instructions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "works_payment_instructions_select" ON works_payment_instructions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM works_invoices wi
      WHERE wi.id = works_payment_instructions.invoice_id
        AND is_scheme_member(wi.scheme_id)
    )
  );

CREATE POLICY "works_payment_instructions_insert" ON works_payment_instructions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM works_invoices wi
      WHERE wi.id = works_payment_instructions.invoice_id
        AND is_scheme_manager(wi.scheme_id)
    )
  );

CREATE POLICY "works_payment_instructions_update" ON works_payment_instructions
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM works_invoices wi
      WHERE wi.id = works_payment_instructions.invoice_id
        AND is_scheme_manager(wi.scheme_id)
    )
  );

-- ─── works_payment_records ─────────────────────────────────────────────
ALTER TABLE works_payment_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "works_payment_records_select" ON works_payment_records
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM works_payment_instructions wpi
      JOIN works_invoices wi ON wi.id = wpi.invoice_id
      WHERE wpi.id = works_payment_records.payment_instruction_id
        AND is_scheme_member(wi.scheme_id)
    )
  );

CREATE POLICY "works_payment_records_insert" ON works_payment_records
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM works_payment_instructions wpi
      JOIN works_invoices wi ON wi.id = wpi.invoice_id
      WHERE wpi.id = works_payment_records.payment_instruction_id
        AND is_scheme_manager(wi.scheme_id)
    )
  );

-- ═══════════════════════════════════════════════════════════════════════
-- WORKS MODULE: DOCUMENTS, NOTIFICATIONS & AUDIT
-- ═══════════════════════════════════════════════════════════════════════

-- ─── works_documents ───────────────────────────────────────────────────
ALTER TABLE works_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "works_documents_select" ON works_documents
  FOR SELECT USING (is_scheme_member(scheme_id));

CREATE POLICY "works_documents_insert" ON works_documents
  FOR INSERT WITH CHECK (is_scheme_member(scheme_id));

CREATE POLICY "works_documents_update" ON works_documents
  FOR UPDATE USING (is_scheme_manager(scheme_id))
  WITH CHECK (is_scheme_manager(scheme_id));

CREATE POLICY "works_documents_delete" ON works_documents
  FOR DELETE USING (is_scheme_manager(scheme_id));

-- ─── works_notifications ───────────────────────────────────────────────
ALTER TABLE works_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "works_notifications_select" ON works_notifications
  FOR SELECT USING (
    recipient_id = current_profile_id()
    OR is_scheme_manager(scheme_id)
  );

CREATE POLICY "works_notifications_insert" ON works_notifications
  FOR INSERT WITH CHECK (is_scheme_member(scheme_id));

CREATE POLICY "works_notifications_update" ON works_notifications
  FOR UPDATE USING (
    recipient_id = current_profile_id()
  );

-- ─── works_audit_events ────────────────────────────────────────────────
ALTER TABLE works_audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "works_audit_events_select" ON works_audit_events
  FOR SELECT USING (is_scheme_member(scheme_id));

CREATE POLICY "works_audit_events_insert" ON works_audit_events
  FOR INSERT WITH CHECK (is_scheme_member(scheme_id));

-- Audit events are immutable: no UPDATE or DELETE policies
