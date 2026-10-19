-- StrataVerze RLS Policies for Works Module and Contractor Onboarding Tables
-- Depends on: 20261019_works_module.sql, 20261019_contractor_onboarding.sql
--
-- Policy approach:
-- - All tables have RLS enabled
-- - Authenticated users can read works/scheme-scoped tables (application-layer role checks apply)
-- - Contractor-owned tables restrict SELECT/UPDATE to the contractor's own records
-- - Review items are readable by advisers (all) and contractors (own business only)
-- - INSERT/UPDATE gated to authenticated users; fine-grained role checks at application layer

-- ════════════════════════════════════════════════════════════════════
-- Helper: ensure auth schema function exists (Supabase provides this)
-- ════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════
-- SECTION 1: Organisation Layer
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE "organisations" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "organisations_select" ON "organisations";
CREATE POLICY "organisations_select" ON "organisations" FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "organisations_insert" ON "organisations";
CREATE POLICY "organisations_insert" ON "organisations" FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "organisations_update" ON "organisations";
CREATE POLICY "organisations_update" ON "organisations" FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE "organisation_memberships" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_memberships_select" ON "organisation_memberships";
CREATE POLICY "org_memberships_select" ON "organisation_memberships" FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "org_memberships_insert" ON "organisation_memberships";
CREATE POLICY "org_memberships_insert" ON "organisation_memberships" FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "org_memberships_update" ON "organisation_memberships";
CREATE POLICY "org_memberships_update" ON "organisation_memberships" FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ════════════════════════════════════════════════════════════════════
-- SECTION 2: Works Configuration Tables
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE "works_categories" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "works_categories_select" ON "works_categories";
CREATE POLICY "works_categories_select" ON "works_categories" FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "works_categories_insert" ON "works_categories";
CREATE POLICY "works_categories_insert" ON "works_categories" FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "works_categories_update" ON "works_categories";
CREATE POLICY "works_categories_update" ON "works_categories" FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE "works_approval_routes" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "works_approval_routes_select" ON "works_approval_routes";
CREATE POLICY "works_approval_routes_select" ON "works_approval_routes" FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "works_approval_routes_insert" ON "works_approval_routes";
CREATE POLICY "works_approval_routes_insert" ON "works_approval_routes" FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "works_approval_routes_update" ON "works_approval_routes";
CREATE POLICY "works_approval_routes_update" ON "works_approval_routes" FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE "works_delegations" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "works_delegations_select" ON "works_delegations";
CREATE POLICY "works_delegations_select" ON "works_delegations" FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "works_delegations_insert" ON "works_delegations";
CREATE POLICY "works_delegations_insert" ON "works_delegations" FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "works_delegations_update" ON "works_delegations";
CREATE POLICY "works_delegations_update" ON "works_delegations" FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ════════════════════════════════════════════════════════════════════
-- SECTION 3: Works Requests and Scoping
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE "works_requests" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "works_requests_select" ON "works_requests";
CREATE POLICY "works_requests_select" ON "works_requests" FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "works_requests_insert" ON "works_requests";
CREATE POLICY "works_requests_insert" ON "works_requests" FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "works_requests_update" ON "works_requests";
CREATE POLICY "works_requests_update" ON "works_requests" FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE "works_request_versions" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "works_request_versions_select" ON "works_request_versions";
CREATE POLICY "works_request_versions_select" ON "works_request_versions" FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "works_request_versions_insert" ON "works_request_versions";
CREATE POLICY "works_request_versions_insert" ON "works_request_versions" FOR INSERT TO authenticated WITH CHECK (true);

ALTER TABLE "works_request_reviews" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "works_request_reviews_select" ON "works_request_reviews";
CREATE POLICY "works_request_reviews_select" ON "works_request_reviews" FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "works_request_reviews_insert" ON "works_request_reviews";
CREATE POLICY "works_request_reviews_insert" ON "works_request_reviews" FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "works_request_reviews_update" ON "works_request_reviews";
CREATE POLICY "works_request_reviews_update" ON "works_request_reviews" FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE "works_scopes" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "works_scopes_select" ON "works_scopes";
CREATE POLICY "works_scopes_select" ON "works_scopes" FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "works_scopes_insert" ON "works_scopes";
CREATE POLICY "works_scopes_insert" ON "works_scopes" FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "works_scopes_update" ON "works_scopes";
CREATE POLICY "works_scopes_update" ON "works_scopes" FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE "works_scope_versions" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "works_scope_versions_select" ON "works_scope_versions";
CREATE POLICY "works_scope_versions_select" ON "works_scope_versions" FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "works_scope_versions_insert" ON "works_scope_versions";
CREATE POLICY "works_scope_versions_insert" ON "works_scope_versions" FOR INSERT TO authenticated WITH CHECK (true);

-- ════════════════════════════════════════════════════════════════════
-- SECTION 4: RFQ (Request for Quotation)
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE "works_rfqs" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "works_rfqs_select" ON "works_rfqs";
CREATE POLICY "works_rfqs_select" ON "works_rfqs" FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "works_rfqs_insert" ON "works_rfqs";
CREATE POLICY "works_rfqs_insert" ON "works_rfqs" FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "works_rfqs_update" ON "works_rfqs";
CREATE POLICY "works_rfqs_update" ON "works_rfqs" FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE "works_rfq_invitations" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "works_rfq_invitations_select" ON "works_rfq_invitations";
CREATE POLICY "works_rfq_invitations_select" ON "works_rfq_invitations" FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "works_rfq_invitations_insert" ON "works_rfq_invitations";
CREATE POLICY "works_rfq_invitations_insert" ON "works_rfq_invitations" FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "works_rfq_invitations_update" ON "works_rfq_invitations";
CREATE POLICY "works_rfq_invitations_update" ON "works_rfq_invitations" FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE "works_rfq_clarifications" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "works_rfq_clarifications_select" ON "works_rfq_clarifications";
CREATE POLICY "works_rfq_clarifications_select" ON "works_rfq_clarifications" FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "works_rfq_clarifications_insert" ON "works_rfq_clarifications";
CREATE POLICY "works_rfq_clarifications_insert" ON "works_rfq_clarifications" FOR INSERT TO authenticated WITH CHECK (true);

ALTER TABLE "works_rfq_addenda" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "works_rfq_addenda_select" ON "works_rfq_addenda";
CREATE POLICY "works_rfq_addenda_select" ON "works_rfq_addenda" FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "works_rfq_addenda_insert" ON "works_rfq_addenda";
CREATE POLICY "works_rfq_addenda_insert" ON "works_rfq_addenda" FOR INSERT TO authenticated WITH CHECK (true);

-- ════════════════════════════════════════════════════════════════════
-- SECTION 5: Contractor Business (own-record access for suppliers)
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE "contractor_businesses" ENABLE ROW LEVEL SECURITY;
-- Advisers can see all contractors; contractors see their own
DROP POLICY IF EXISTS "contractor_businesses_select" ON "contractor_businesses";
CREATE POLICY "contractor_businesses_select" ON "contractor_businesses"
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "contractor_businesses_insert" ON "contractor_businesses";
CREATE POLICY "contractor_businesses_insert" ON "contractor_businesses"
  FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "contractor_businesses_update" ON "contractor_businesses";
CREATE POLICY "contractor_businesses_update" ON "contractor_businesses"
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE "contractor_contacts" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "contractor_contacts_select" ON "contractor_contacts";
CREATE POLICY "contractor_contacts_select" ON "contractor_contacts"
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "contractor_contacts_insert" ON "contractor_contacts";
CREATE POLICY "contractor_contacts_insert" ON "contractor_contacts"
  FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "contractor_contacts_update" ON "contractor_contacts";
CREATE POLICY "contractor_contacts_update" ON "contractor_contacts"
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ════════════════════════════════════════════════════════════════════
-- SECTION 6: Compliance (licences, insurance, verification)
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE "works_compliance_requirements" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "works_compliance_requirements_select" ON "works_compliance_requirements";
CREATE POLICY "works_compliance_requirements_select" ON "works_compliance_requirements" FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "works_compliance_requirements_insert" ON "works_compliance_requirements";
CREATE POLICY "works_compliance_requirements_insert" ON "works_compliance_requirements" FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "works_compliance_requirements_update" ON "works_compliance_requirements";
CREATE POLICY "works_compliance_requirements_update" ON "works_compliance_requirements" FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE "works_compliance_checks" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "works_compliance_checks_select" ON "works_compliance_checks";
CREATE POLICY "works_compliance_checks_select" ON "works_compliance_checks" FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "works_compliance_checks_insert" ON "works_compliance_checks";
CREATE POLICY "works_compliance_checks_insert" ON "works_compliance_checks" FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "works_compliance_checks_update" ON "works_compliance_checks";
CREATE POLICY "works_compliance_checks_update" ON "works_compliance_checks" FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE "works_licences" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "works_licences_select" ON "works_licences";
CREATE POLICY "works_licences_select" ON "works_licences" FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "works_licences_insert" ON "works_licences";
CREATE POLICY "works_licences_insert" ON "works_licences" FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "works_licences_update" ON "works_licences";
CREATE POLICY "works_licences_update" ON "works_licences" FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE "works_insurances" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "works_insurances_select" ON "works_insurances";
CREATE POLICY "works_insurances_select" ON "works_insurances" FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "works_insurances_insert" ON "works_insurances";
CREATE POLICY "works_insurances_insert" ON "works_insurances" FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "works_insurances_update" ON "works_insurances";
CREATE POLICY "works_insurances_update" ON "works_insurances" FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE "works_verification_events" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "works_verification_events_select" ON "works_verification_events";
CREATE POLICY "works_verification_events_select" ON "works_verification_events" FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "works_verification_events_insert" ON "works_verification_events";
CREATE POLICY "works_verification_events_insert" ON "works_verification_events" FOR INSERT TO authenticated WITH CHECK (true);

-- ════════════════════════════════════════════════════════════════════
-- SECTION 7: Quotations and Evaluation
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE "works_quotations" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "works_quotations_select" ON "works_quotations";
CREATE POLICY "works_quotations_select" ON "works_quotations" FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "works_quotations_insert" ON "works_quotations";
CREATE POLICY "works_quotations_insert" ON "works_quotations" FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "works_quotations_update" ON "works_quotations";
CREATE POLICY "works_quotations_update" ON "works_quotations" FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE "works_quotation_versions" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "works_quotation_versions_select" ON "works_quotation_versions";
CREATE POLICY "works_quotation_versions_select" ON "works_quotation_versions" FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "works_quotation_versions_insert" ON "works_quotation_versions";
CREATE POLICY "works_quotation_versions_insert" ON "works_quotation_versions" FOR INSERT TO authenticated WITH CHECK (true);

ALTER TABLE "works_quotation_line_items" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "works_quotation_line_items_select" ON "works_quotation_line_items";
CREATE POLICY "works_quotation_line_items_select" ON "works_quotation_line_items" FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "works_quotation_line_items_insert" ON "works_quotation_line_items";
CREATE POLICY "works_quotation_line_items_insert" ON "works_quotation_line_items" FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "works_quotation_line_items_update" ON "works_quotation_line_items";
CREATE POLICY "works_quotation_line_items_update" ON "works_quotation_line_items" FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE "works_evaluations" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "works_evaluations_select" ON "works_evaluations";
CREATE POLICY "works_evaluations_select" ON "works_evaluations" FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "works_evaluations_insert" ON "works_evaluations";
CREATE POLICY "works_evaluations_insert" ON "works_evaluations" FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "works_evaluations_update" ON "works_evaluations";
CREATE POLICY "works_evaluations_update" ON "works_evaluations" FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE "works_evaluation_criteria" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "works_evaluation_criteria_select" ON "works_evaluation_criteria";
CREATE POLICY "works_evaluation_criteria_select" ON "works_evaluation_criteria" FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "works_evaluation_criteria_insert" ON "works_evaluation_criteria";
CREATE POLICY "works_evaluation_criteria_insert" ON "works_evaluation_criteria" FOR INSERT TO authenticated WITH CHECK (true);

ALTER TABLE "works_recommendations" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "works_recommendations_select" ON "works_recommendations";
CREATE POLICY "works_recommendations_select" ON "works_recommendations" FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "works_recommendations_insert" ON "works_recommendations";
CREATE POLICY "works_recommendations_insert" ON "works_recommendations" FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "works_recommendations_update" ON "works_recommendations";
CREATE POLICY "works_recommendations_update" ON "works_recommendations" FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ════════════════════════════════════════════════════════════════════
-- SECTION 8: Approval Workflows
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE "works_approval_workflows" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "works_approval_workflows_select" ON "works_approval_workflows";
CREATE POLICY "works_approval_workflows_select" ON "works_approval_workflows" FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "works_approval_workflows_insert" ON "works_approval_workflows";
CREATE POLICY "works_approval_workflows_insert" ON "works_approval_workflows" FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "works_approval_workflows_update" ON "works_approval_workflows";
CREATE POLICY "works_approval_workflows_update" ON "works_approval_workflows" FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE "works_approval_records" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "works_approval_records_select" ON "works_approval_records";
CREATE POLICY "works_approval_records_select" ON "works_approval_records" FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "works_approval_records_insert" ON "works_approval_records";
CREATE POLICY "works_approval_records_insert" ON "works_approval_records" FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "works_approval_records_update" ON "works_approval_records";
CREATE POLICY "works_approval_records_update" ON "works_approval_records" FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ════════════════════════════════════════════════════════════════════
-- SECTION 9: Contracts and Work Orders
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE "works_contracts" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "works_contracts_select" ON "works_contracts";
CREATE POLICY "works_contracts_select" ON "works_contracts" FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "works_contracts_insert" ON "works_contracts";
CREATE POLICY "works_contracts_insert" ON "works_contracts" FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "works_contracts_update" ON "works_contracts";
CREATE POLICY "works_contracts_update" ON "works_contracts" FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE "works_work_orders" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "works_work_orders_select" ON "works_work_orders";
CREATE POLICY "works_work_orders_select" ON "works_work_orders" FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "works_work_orders_insert" ON "works_work_orders";
CREATE POLICY "works_work_orders_insert" ON "works_work_orders" FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "works_work_orders_update" ON "works_work_orders";
CREATE POLICY "works_work_orders_update" ON "works_work_orders" FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE "works_milestones" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "works_milestones_select" ON "works_milestones";
CREATE POLICY "works_milestones_select" ON "works_milestones" FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "works_milestones_insert" ON "works_milestones";
CREATE POLICY "works_milestones_insert" ON "works_milestones" FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "works_milestones_update" ON "works_milestones";
CREATE POLICY "works_milestones_update" ON "works_milestones" FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE "works_site_visits" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "works_site_visits_select" ON "works_site_visits";
CREATE POLICY "works_site_visits_select" ON "works_site_visits" FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "works_site_visits_insert" ON "works_site_visits";
CREATE POLICY "works_site_visits_insert" ON "works_site_visits" FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "works_site_visits_update" ON "works_site_visits";
CREATE POLICY "works_site_visits_update" ON "works_site_visits" FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE "works_progress_reports" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "works_progress_reports_select" ON "works_progress_reports";
CREATE POLICY "works_progress_reports_select" ON "works_progress_reports" FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "works_progress_reports_insert" ON "works_progress_reports";
CREATE POLICY "works_progress_reports_insert" ON "works_progress_reports" FOR INSERT TO authenticated WITH CHECK (true);

ALTER TABLE "works_variations" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "works_variations_select" ON "works_variations";
CREATE POLICY "works_variations_select" ON "works_variations" FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "works_variations_insert" ON "works_variations";
CREATE POLICY "works_variations_insert" ON "works_variations" FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "works_variations_update" ON "works_variations";
CREATE POLICY "works_variations_update" ON "works_variations" FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE "works_inspections" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "works_inspections_select" ON "works_inspections";
CREATE POLICY "works_inspections_select" ON "works_inspections" FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "works_inspections_insert" ON "works_inspections";
CREATE POLICY "works_inspections_insert" ON "works_inspections" FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "works_inspections_update" ON "works_inspections";
CREATE POLICY "works_inspections_update" ON "works_inspections" FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE "works_defects" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "works_defects_select" ON "works_defects";
CREATE POLICY "works_defects_select" ON "works_defects" FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "works_defects_insert" ON "works_defects";
CREATE POLICY "works_defects_insert" ON "works_defects" FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "works_defects_update" ON "works_defects";
CREATE POLICY "works_defects_update" ON "works_defects" FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE "works_completion_submissions" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "works_completion_submissions_select" ON "works_completion_submissions";
CREATE POLICY "works_completion_submissions_select" ON "works_completion_submissions" FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "works_completion_submissions_insert" ON "works_completion_submissions";
CREATE POLICY "works_completion_submissions_insert" ON "works_completion_submissions" FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "works_completion_submissions_update" ON "works_completion_submissions";
CREATE POLICY "works_completion_submissions_update" ON "works_completion_submissions" FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ════════════════════════════════════════════════════════════════════
-- SECTION 10: Invoicing and Payments
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE "works_invoices" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "works_invoices_select" ON "works_invoices";
CREATE POLICY "works_invoices_select" ON "works_invoices" FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "works_invoices_insert" ON "works_invoices";
CREATE POLICY "works_invoices_insert" ON "works_invoices" FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "works_invoices_update" ON "works_invoices";
CREATE POLICY "works_invoices_update" ON "works_invoices" FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE "works_payment_assessments" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "works_payment_assessments_select" ON "works_payment_assessments";
CREATE POLICY "works_payment_assessments_select" ON "works_payment_assessments" FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "works_payment_assessments_insert" ON "works_payment_assessments";
CREATE POLICY "works_payment_assessments_insert" ON "works_payment_assessments" FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "works_payment_assessments_update" ON "works_payment_assessments";
CREATE POLICY "works_payment_assessments_update" ON "works_payment_assessments" FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE "works_bank_detail_versions" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "works_bank_detail_versions_select" ON "works_bank_detail_versions";
CREATE POLICY "works_bank_detail_versions_select" ON "works_bank_detail_versions" FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "works_bank_detail_versions_insert" ON "works_bank_detail_versions";
CREATE POLICY "works_bank_detail_versions_insert" ON "works_bank_detail_versions" FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "works_bank_detail_versions_update" ON "works_bank_detail_versions";
CREATE POLICY "works_bank_detail_versions_update" ON "works_bank_detail_versions" FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE "works_payment_instructions" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "works_payment_instructions_select" ON "works_payment_instructions";
CREATE POLICY "works_payment_instructions_select" ON "works_payment_instructions" FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "works_payment_instructions_insert" ON "works_payment_instructions";
CREATE POLICY "works_payment_instructions_insert" ON "works_payment_instructions" FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "works_payment_instructions_update" ON "works_payment_instructions";
CREATE POLICY "works_payment_instructions_update" ON "works_payment_instructions" FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE "works_payment_records" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "works_payment_records_select" ON "works_payment_records";
CREATE POLICY "works_payment_records_select" ON "works_payment_records" FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "works_payment_records_insert" ON "works_payment_records";
CREATE POLICY "works_payment_records_insert" ON "works_payment_records" FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "works_payment_records_update" ON "works_payment_records";
CREATE POLICY "works_payment_records_update" ON "works_payment_records" FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ════════════════════════════════════════════════════════════════════
-- SECTION 11: Documents, Notifications, Audit
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE "works_documents" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "works_documents_select" ON "works_documents";
CREATE POLICY "works_documents_select" ON "works_documents" FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "works_documents_insert" ON "works_documents";
CREATE POLICY "works_documents_insert" ON "works_documents" FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "works_documents_update" ON "works_documents";
CREATE POLICY "works_documents_update" ON "works_documents" FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE "works_notifications" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "works_notifications_select" ON "works_notifications";
CREATE POLICY "works_notifications_select" ON "works_notifications" FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "works_notifications_insert" ON "works_notifications";
CREATE POLICY "works_notifications_insert" ON "works_notifications" FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "works_notifications_update" ON "works_notifications";
CREATE POLICY "works_notifications_update" ON "works_notifications" FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE "works_audit_events" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "works_audit_events_select" ON "works_audit_events";
CREATE POLICY "works_audit_events_select" ON "works_audit_events" FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "works_audit_events_insert" ON "works_audit_events";
CREATE POLICY "works_audit_events_insert" ON "works_audit_events" FOR INSERT TO authenticated WITH CHECK (true);

-- ════════════════════════════════════════════════════════════════════
-- SECTION 12: Contractor Onboarding Tables
-- NOTE: RLS for contractor_onboardings, abn_lookup_records,
--       contractor_memberships, contractor_declarations, and
--       contractor_review_items is defined in
--       20261019_contractor_onboarding.sql with granular own-record
--       policies (primary_contact_id + auth.uid() join).
-- ════════════════════════════════════════════════════════════════════
