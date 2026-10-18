-- ============================================================================
-- Migration 4: Row Level Security (RLS) Policies
-- ============================================================================
-- Enables RLS on ALL tables and creates policies that restrict access based
-- on the authenticated user's scheme memberships.
--
-- Design:
--   auth.uid() → profiles.auth_id → profiles.id → scheme_memberships
--   Tables with scheme_id: checked directly via scheme_memberships
--   Tables without scheme_id: joined through parent tables
--   Roles: OWNER, COMMITTEE, ADVISER, SUPPLIER, ACCOUNTANT
--
-- Run this in Supabase SQL Editor AFTER Migration 3 (financial tables).
-- ============================================================================

-- Helper function: get the profile ID for the current auth user
CREATE OR REPLACE FUNCTION public.current_profile_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM profiles WHERE auth_id = auth.uid() LIMIT 1;
$$;

-- Helper function: check if current user is a member of a scheme
CREATE OR REPLACE FUNCTION public.is_scheme_member(p_scheme_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM scheme_memberships
    WHERE scheme_id = p_scheme_id
      AND profile_id = public.current_profile_id()
      AND is_active = true
  );
$$;

-- Helper function: check if current user has a specific role in a scheme
CREATE OR REPLACE FUNCTION public.has_scheme_role(p_scheme_id uuid, p_role text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM scheme_memberships
    WHERE scheme_id = p_scheme_id
      AND profile_id = public.current_profile_id()
      AND role = p_role::"PortalRole"
      AND is_active = true
  );
$$;

-- Helper function: check if current user has any management role in a scheme
-- (ADVISER, COMMITTEE, or ACCOUNTANT)
CREATE OR REPLACE FUNCTION public.is_scheme_manager(p_scheme_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM scheme_memberships
    WHERE scheme_id = p_scheme_id
      AND profile_id = public.current_profile_id()
      AND role IN ('ADVISER'::"PortalRole", 'COMMITTEE'::"PortalRole", 'ACCOUNTANT'::"PortalRole")
      AND is_active = true
  );
$$;


-- ============================================================================
-- 1. PROFILES
-- ============================================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
CREATE POLICY profiles_select_own ON profiles
  FOR SELECT USING (auth_id = auth.uid());

-- Users can also read profiles of people in the same schemes
CREATE POLICY profiles_select_scheme_members ON profiles
  FOR SELECT USING (
    id IN (
      SELECT sm2.profile_id
      FROM scheme_memberships sm1
      JOIN scheme_memberships sm2 ON sm1.scheme_id = sm2.scheme_id
      WHERE sm1.profile_id = public.current_profile_id()
        AND sm1.is_active = true
        AND sm2.is_active = true
    )
  );

-- Users can update only their own profile
CREATE POLICY profiles_update_own ON profiles
  FOR UPDATE USING (auth_id = auth.uid())
  WITH CHECK (auth_id = auth.uid());

-- Users can insert their own profile (on first signup)
CREATE POLICY profiles_insert_own ON profiles
  FOR INSERT WITH CHECK (auth_id = auth.uid());


-- ============================================================================
-- 2. SCHEMES
-- ============================================================================
ALTER TABLE schemes ENABLE ROW LEVEL SECURITY;

-- Users can read schemes they are members of
CREATE POLICY schemes_select ON schemes
  FOR SELECT USING (public.is_scheme_member(id));

-- Only advisers can insert new schemes
CREATE POLICY schemes_insert ON schemes
  FOR INSERT WITH CHECK (true);
  -- Note: advisers create schemes via server actions using service role key

-- Only advisers can update schemes
CREATE POLICY schemes_update ON schemes
  FOR UPDATE USING (public.has_scheme_role(id, 'ADVISER'))
  WITH CHECK (public.has_scheme_role(id, 'ADVISER'));


-- ============================================================================
-- 3. SCHEME_MEMBERSHIPS
-- ============================================================================
ALTER TABLE scheme_memberships ENABLE ROW LEVEL SECURITY;

-- Members can see other members of their schemes
CREATE POLICY scheme_memberships_select ON scheme_memberships
  FOR SELECT USING (public.is_scheme_member(scheme_id));

-- Only advisers can insert memberships
CREATE POLICY scheme_memberships_insert ON scheme_memberships
  FOR INSERT WITH CHECK (public.has_scheme_role(scheme_id, 'ADVISER'));

-- Only advisers can update memberships
CREATE POLICY scheme_memberships_update ON scheme_memberships
  FOR UPDATE USING (public.has_scheme_role(scheme_id, 'ADVISER'))
  WITH CHECK (public.has_scheme_role(scheme_id, 'ADVISER'));


-- ============================================================================
-- 4. SCHEME_IMAGES
-- ============================================================================
ALTER TABLE scheme_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY scheme_images_select ON scheme_images
  FOR SELECT USING (public.is_scheme_member(scheme_id));

CREATE POLICY scheme_images_insert ON scheme_images
  FOR INSERT WITH CHECK (public.has_scheme_role(scheme_id, 'ADVISER'));

CREATE POLICY scheme_images_update ON scheme_images
  FOR UPDATE USING (public.has_scheme_role(scheme_id, 'ADVISER'))
  WITH CHECK (public.has_scheme_role(scheme_id, 'ADVISER'));

CREATE POLICY scheme_images_delete ON scheme_images
  FOR DELETE USING (public.has_scheme_role(scheme_id, 'ADVISER'));


-- ============================================================================
-- 5. LOTS
-- ============================================================================
ALTER TABLE lots ENABLE ROW LEVEL SECURITY;

CREATE POLICY lots_select ON lots
  FOR SELECT USING (public.is_scheme_member(scheme_id));

CREATE POLICY lots_insert ON lots
  FOR INSERT WITH CHECK (public.is_scheme_manager(scheme_id));

CREATE POLICY lots_update ON lots
  FOR UPDATE USING (public.is_scheme_manager(scheme_id))
  WITH CHECK (public.is_scheme_manager(scheme_id));


-- ============================================================================
-- 6. FUNDS
-- ============================================================================
ALTER TABLE funds ENABLE ROW LEVEL SECURITY;

CREATE POLICY funds_select ON funds
  FOR SELECT USING (public.is_scheme_member(scheme_id));

CREATE POLICY funds_insert ON funds
  FOR INSERT WITH CHECK (public.is_scheme_manager(scheme_id));

CREATE POLICY funds_update ON funds
  FOR UPDATE USING (public.is_scheme_manager(scheme_id))
  WITH CHECK (public.is_scheme_manager(scheme_id));


-- ============================================================================
-- 7. LEVIES
-- ============================================================================
ALTER TABLE levies ENABLE ROW LEVEL SECURITY;

CREATE POLICY levies_select ON levies
  FOR SELECT USING (public.is_scheme_member(scheme_id));

CREATE POLICY levies_insert ON levies
  FOR INSERT WITH CHECK (public.is_scheme_manager(scheme_id));

CREATE POLICY levies_update ON levies
  FOR UPDATE USING (public.is_scheme_manager(scheme_id))
  WITH CHECK (public.is_scheme_manager(scheme_id));


-- ============================================================================
-- 8. LEVY_ITEMS (no direct scheme_id, joins through levies)
-- ============================================================================
ALTER TABLE levy_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY levy_items_select ON levy_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM levies
      WHERE levies.id = levy_items.levy_id
        AND public.is_scheme_member(levies.scheme_id)
    )
  );

CREATE POLICY levy_items_insert ON levy_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM levies
      WHERE levies.id = levy_items.levy_id
        AND public.is_scheme_manager(levies.scheme_id)
    )
  );

CREATE POLICY levy_items_update ON levy_items
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM levies
      WHERE levies.id = levy_items.levy_id
        AND public.is_scheme_manager(levies.scheme_id)
    )
  );


-- ============================================================================
-- 9. MEETINGS
-- ============================================================================
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;

CREATE POLICY meetings_select ON meetings
  FOR SELECT USING (public.is_scheme_member(scheme_id));

CREATE POLICY meetings_insert ON meetings
  FOR INSERT WITH CHECK (public.is_scheme_manager(scheme_id));

CREATE POLICY meetings_update ON meetings
  FOR UPDATE USING (public.is_scheme_manager(scheme_id))
  WITH CHECK (public.is_scheme_manager(scheme_id));


-- ============================================================================
-- 10. MOTIONS
-- ============================================================================
ALTER TABLE motions ENABLE ROW LEVEL SECURITY;

CREATE POLICY motions_select ON motions
  FOR SELECT USING (public.is_scheme_member(scheme_id));

CREATE POLICY motions_insert ON motions
  FOR INSERT WITH CHECK (public.is_scheme_member(scheme_id));

CREATE POLICY motions_update ON motions
  FOR UPDATE USING (public.is_scheme_manager(scheme_id))
  WITH CHECK (public.is_scheme_manager(scheme_id));


-- ============================================================================
-- 11. VOTES (no direct scheme_id, joins through motions)
-- ============================================================================
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY votes_select ON votes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM motions
      WHERE motions.id = votes.motion_id
        AND public.is_scheme_member(motions.scheme_id)
    )
  );

-- Owners can insert their own votes
CREATE POLICY votes_insert ON votes
  FOR INSERT WITH CHECK (
    profile_id = public.current_profile_id()
    AND EXISTS (
      SELECT 1 FROM motions
      WHERE motions.id = votes.motion_id
        AND public.is_scheme_member(motions.scheme_id)
    )
  );

-- Users can update their own votes
CREATE POLICY votes_update ON votes
  FOR UPDATE USING (
    profile_id = public.current_profile_id()
  );


-- ============================================================================
-- 12. DOCUMENTS
-- ============================================================================
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY documents_select ON documents
  FOR SELECT USING (public.is_scheme_member(scheme_id));

CREATE POLICY documents_insert ON documents
  FOR INSERT WITH CHECK (public.is_scheme_member(scheme_id));

CREATE POLICY documents_update ON documents
  FOR UPDATE USING (public.is_scheme_manager(scheme_id))
  WITH CHECK (public.is_scheme_manager(scheme_id));

CREATE POLICY documents_delete ON documents
  FOR DELETE USING (public.is_scheme_manager(scheme_id));


-- ============================================================================
-- 13. WORK_ORDERS
-- ============================================================================
ALTER TABLE work_orders ENABLE ROW LEVEL SECURITY;

-- Members and assigned suppliers can read work orders
CREATE POLICY work_orders_select ON work_orders
  FOR SELECT USING (
    public.is_scheme_member(scheme_id)
    OR supplier_id = public.current_profile_id()
  );

CREATE POLICY work_orders_insert ON work_orders
  FOR INSERT WITH CHECK (public.is_scheme_member(scheme_id));

CREATE POLICY work_orders_update ON work_orders
  FOR UPDATE USING (
    public.is_scheme_manager(scheme_id)
    OR supplier_id = public.current_profile_id()
  );


-- ============================================================================
-- 14. COMMENTS (no direct scheme_id, joins through work_orders)
-- ============================================================================
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY comments_select ON comments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM work_orders
      WHERE work_orders.id = comments.work_order_id
        AND (
          public.is_scheme_member(work_orders.scheme_id)
          OR work_orders.supplier_id = public.current_profile_id()
        )
    )
  );

CREATE POLICY comments_insert ON comments
  FOR INSERT WITH CHECK (
    author_id = public.current_profile_id()
    AND EXISTS (
      SELECT 1 FROM work_orders
      WHERE work_orders.id = comments.work_order_id
        AND (
          public.is_scheme_member(work_orders.scheme_id)
          OR work_orders.supplier_id = public.current_profile_id()
        )
    )
  );


-- ============================================================================
-- 15. QUOTE_REQUESTS
-- ============================================================================
ALTER TABLE quote_requests ENABLE ROW LEVEL SECURITY;

-- Members can see their scheme's quote requests; suppliers see OPEN ones
CREATE POLICY quote_requests_select ON quote_requests
  FOR SELECT USING (
    public.is_scheme_member(scheme_id)
    OR (
      status = 'OPEN'
      AND EXISTS (
        SELECT 1 FROM scheme_memberships
        WHERE scheme_id = quote_requests.scheme_id
          AND profile_id = public.current_profile_id()
          AND role = 'SUPPLIER'::"PortalRole"
          AND is_active = true
      )
    )
  );

CREATE POLICY quote_requests_insert ON quote_requests
  FOR INSERT WITH CHECK (public.is_scheme_manager(scheme_id));

CREATE POLICY quote_requests_update ON quote_requests
  FOR UPDATE USING (public.is_scheme_manager(scheme_id))
  WITH CHECK (public.is_scheme_manager(scheme_id));


-- ============================================================================
-- 16. QUOTES (no direct scheme_id, joins through quote_requests)
-- ============================================================================
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY quotes_select ON quotes
  FOR SELECT USING (
    supplier_id = public.current_profile_id()
    OR EXISTS (
      SELECT 1 FROM quote_requests
      WHERE quote_requests.id = quotes.quote_request_id
        AND public.is_scheme_manager(quote_requests.scheme_id)
    )
  );

CREATE POLICY quotes_insert ON quotes
  FOR INSERT WITH CHECK (
    supplier_id = public.current_profile_id()
  );

CREATE POLICY quotes_update ON quotes
  FOR UPDATE USING (
    supplier_id = public.current_profile_id()
  );


-- ============================================================================
-- 17. INVOICES
-- ============================================================================
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY invoices_select ON invoices
  FOR SELECT USING (
    public.is_scheme_member(scheme_id)
    OR supplier_id = public.current_profile_id()
  );

CREATE POLICY invoices_insert ON invoices
  FOR INSERT WITH CHECK (
    public.is_scheme_member(scheme_id)
    OR supplier_id = public.current_profile_id()
  );

CREATE POLICY invoices_update ON invoices
  FOR UPDATE USING (
    public.is_scheme_manager(scheme_id)
    OR supplier_id = public.current_profile_id()
  );


-- ============================================================================
-- 18. COMPLIANCE_ITEMS
-- ============================================================================
ALTER TABLE compliance_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY compliance_items_select ON compliance_items
  FOR SELECT USING (public.is_scheme_member(scheme_id));

CREATE POLICY compliance_items_insert ON compliance_items
  FOR INSERT WITH CHECK (public.is_scheme_manager(scheme_id));

CREATE POLICY compliance_items_update ON compliance_items
  FOR UPDATE USING (public.is_scheme_manager(scheme_id))
  WITH CHECK (public.is_scheme_manager(scheme_id));


-- ============================================================================
-- 19. ANNOUNCEMENTS
-- ============================================================================
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY announcements_select ON announcements
  FOR SELECT USING (public.is_scheme_member(scheme_id));

CREATE POLICY announcements_insert ON announcements
  FOR INSERT WITH CHECK (public.is_scheme_manager(scheme_id));

CREATE POLICY announcements_update ON announcements
  FOR UPDATE USING (public.is_scheme_manager(scheme_id))
  WITH CHECK (public.is_scheme_manager(scheme_id));


-- ============================================================================
-- 20. BYLAWS
-- ============================================================================
ALTER TABLE bylaws ENABLE ROW LEVEL SECURITY;

CREATE POLICY bylaws_select ON bylaws
  FOR SELECT USING (public.is_scheme_member(scheme_id));

CREATE POLICY bylaws_insert ON bylaws
  FOR INSERT WITH CHECK (public.is_scheme_manager(scheme_id));

CREATE POLICY bylaws_update ON bylaws
  FOR UPDATE USING (public.is_scheme_manager(scheme_id))
  WITH CHECK (public.is_scheme_manager(scheme_id));


-- ============================================================================
-- 21. INSURANCE_POLICIES
-- ============================================================================
ALTER TABLE insurance_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY insurance_policies_select ON insurance_policies
  FOR SELECT USING (public.is_scheme_member(scheme_id));

CREATE POLICY insurance_policies_insert ON insurance_policies
  FOR INSERT WITH CHECK (public.is_scheme_manager(scheme_id));

CREATE POLICY insurance_policies_update ON insurance_policies
  FOR UPDATE USING (public.is_scheme_manager(scheme_id))
  WITH CHECK (public.is_scheme_manager(scheme_id));


-- ============================================================================
-- 22. CONTACTS
-- ============================================================================
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY contacts_select ON contacts
  FOR SELECT USING (public.is_scheme_member(scheme_id));

CREATE POLICY contacts_insert ON contacts
  FOR INSERT WITH CHECK (public.is_scheme_manager(scheme_id));

CREATE POLICY contacts_update ON contacts
  FOR UPDATE USING (public.is_scheme_manager(scheme_id))
  WITH CHECK (public.is_scheme_manager(scheme_id));


-- ============================================================================
-- 23. INVITATIONS
-- ============================================================================
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY invitations_select ON invitations
  FOR SELECT USING (public.is_scheme_member(scheme_id));

CREATE POLICY invitations_insert ON invitations
  FOR INSERT WITH CHECK (public.has_scheme_role(scheme_id, 'ADVISER'));

CREATE POLICY invitations_update ON invitations
  FOR UPDATE USING (public.has_scheme_role(scheme_id, 'ADVISER'))
  WITH CHECK (public.has_scheme_role(scheme_id, 'ADVISER'));


-- ============================================================================
-- 24. ACTIVITY_LOGS
-- ============================================================================
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY activity_logs_select ON activity_logs
  FOR SELECT USING (public.is_scheme_member(scheme_id));

CREATE POLICY activity_logs_insert ON activity_logs
  FOR INSERT WITH CHECK (public.is_scheme_member(scheme_id));


-- ============================================================================
-- 25. ACCOUNT_CODES (Financial)
-- ============================================================================
ALTER TABLE account_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY account_codes_select ON account_codes
  FOR SELECT USING (public.is_scheme_member(scheme_id));

CREATE POLICY account_codes_insert ON account_codes
  FOR INSERT WITH CHECK (public.is_scheme_manager(scheme_id));

CREATE POLICY account_codes_update ON account_codes
  FOR UPDATE USING (public.is_scheme_manager(scheme_id))
  WITH CHECK (public.is_scheme_manager(scheme_id));


-- ============================================================================
-- 26. FINANCIAL_PERIODS
-- ============================================================================
ALTER TABLE financial_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY financial_periods_select ON financial_periods
  FOR SELECT USING (public.is_scheme_member(scheme_id));

CREATE POLICY financial_periods_insert ON financial_periods
  FOR INSERT WITH CHECK (public.is_scheme_manager(scheme_id));

CREATE POLICY financial_periods_update ON financial_periods
  FOR UPDATE USING (public.is_scheme_manager(scheme_id))
  WITH CHECK (public.is_scheme_manager(scheme_id));


-- ============================================================================
-- 27. SCHEME_BANK_ACCOUNTS
-- ============================================================================
ALTER TABLE scheme_bank_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY scheme_bank_accounts_select ON scheme_bank_accounts
  FOR SELECT USING (public.is_scheme_member(scheme_id));

CREATE POLICY scheme_bank_accounts_insert ON scheme_bank_accounts
  FOR INSERT WITH CHECK (public.is_scheme_manager(scheme_id));

CREATE POLICY scheme_bank_accounts_update ON scheme_bank_accounts
  FOR UPDATE USING (public.is_scheme_manager(scheme_id))
  WITH CHECK (public.is_scheme_manager(scheme_id));


-- ============================================================================
-- 28. JOURNAL_ENTRIES
-- ============================================================================
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY journal_entries_select ON journal_entries
  FOR SELECT USING (public.is_scheme_member(scheme_id));

CREATE POLICY journal_entries_insert ON journal_entries
  FOR INSERT WITH CHECK (public.is_scheme_manager(scheme_id));

CREATE POLICY journal_entries_update ON journal_entries
  FOR UPDATE USING (public.is_scheme_manager(scheme_id))
  WITH CHECK (public.is_scheme_manager(scheme_id));


-- ============================================================================
-- 29. JOURNAL_LINES (no direct scheme_id, joins through journal_entries)
-- ============================================================================
ALTER TABLE journal_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY journal_lines_select ON journal_lines
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM journal_entries
      WHERE journal_entries.id = journal_lines.journal_entry_id
        AND public.is_scheme_member(journal_entries.scheme_id)
    )
  );

CREATE POLICY journal_lines_insert ON journal_lines
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM journal_entries
      WHERE journal_entries.id = journal_lines.journal_entry_id
        AND public.is_scheme_manager(journal_entries.scheme_id)
    )
  );

CREATE POLICY journal_lines_update ON journal_lines
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM journal_entries
      WHERE journal_entries.id = journal_lines.journal_entry_id
        AND public.is_scheme_manager(journal_entries.scheme_id)
    )
  );


-- ============================================================================
-- 30. BUDGET_LINES (no direct scheme_id, joins through account_codes)
-- ============================================================================
ALTER TABLE budget_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY budget_lines_select ON budget_lines
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM account_codes
      WHERE account_codes.id = budget_lines.account_code_id
        AND public.is_scheme_member(account_codes.scheme_id)
    )
  );

CREATE POLICY budget_lines_insert ON budget_lines
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM account_codes
      WHERE account_codes.id = budget_lines.account_code_id
        AND public.is_scheme_manager(account_codes.scheme_id)
    )
  );

CREATE POLICY budget_lines_update ON budget_lines
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM account_codes
      WHERE account_codes.id = budget_lines.account_code_id
        AND public.is_scheme_manager(account_codes.scheme_id)
    )
  );


-- ============================================================================
-- 31. BANK_TRANSACTIONS
-- ============================================================================
ALTER TABLE bank_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY bank_transactions_select ON bank_transactions
  FOR SELECT USING (public.is_scheme_member(scheme_id));

CREATE POLICY bank_transactions_insert ON bank_transactions
  FOR INSERT WITH CHECK (public.is_scheme_manager(scheme_id));

CREATE POLICY bank_transactions_update ON bank_transactions
  FOR UPDATE USING (public.is_scheme_manager(scheme_id))
  WITH CHECK (public.is_scheme_manager(scheme_id));


-- ============================================================================
-- 32. MATCHING_RULES
-- ============================================================================
ALTER TABLE matching_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY matching_rules_select ON matching_rules
  FOR SELECT USING (public.is_scheme_member(scheme_id));

CREATE POLICY matching_rules_insert ON matching_rules
  FOR INSERT WITH CHECK (public.is_scheme_manager(scheme_id));

CREATE POLICY matching_rules_update ON matching_rules
  FOR UPDATE USING (public.is_scheme_manager(scheme_id))
  WITH CHECK (public.is_scheme_manager(scheme_id));

CREATE POLICY matching_rules_delete ON matching_rules
  FOR DELETE USING (public.is_scheme_manager(scheme_id));


-- ============================================================================
-- 33. LEVY_SCHEDULES
-- ============================================================================
ALTER TABLE levy_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY levy_schedules_select ON levy_schedules
  FOR SELECT USING (public.is_scheme_member(scheme_id));

CREATE POLICY levy_schedules_insert ON levy_schedules
  FOR INSERT WITH CHECK (public.is_scheme_manager(scheme_id));

CREATE POLICY levy_schedules_update ON levy_schedules
  FOR UPDATE USING (public.is_scheme_manager(scheme_id))
  WITH CHECK (public.is_scheme_manager(scheme_id));


-- ============================================================================
-- 34. LEVY_NOTICES
-- ============================================================================
ALTER TABLE levy_notices ENABLE ROW LEVEL SECURITY;

-- Members can see all notices; owners only their own would be too restrictive
-- since committee members need to see the full picture
CREATE POLICY levy_notices_select ON levy_notices
  FOR SELECT USING (public.is_scheme_member(scheme_id));

CREATE POLICY levy_notices_insert ON levy_notices
  FOR INSERT WITH CHECK (public.is_scheme_manager(scheme_id));

CREATE POLICY levy_notices_update ON levy_notices
  FOR UPDATE USING (public.is_scheme_manager(scheme_id))
  WITH CHECK (public.is_scheme_manager(scheme_id));


-- ============================================================================
-- 35. SUPPLIERS
-- ============================================================================
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY suppliers_select ON suppliers
  FOR SELECT USING (public.is_scheme_member(scheme_id));

CREATE POLICY suppliers_insert ON suppliers
  FOR INSERT WITH CHECK (public.is_scheme_manager(scheme_id));

CREATE POLICY suppliers_update ON suppliers
  FOR UPDATE USING (public.is_scheme_manager(scheme_id))
  WITH CHECK (public.is_scheme_manager(scheme_id));


-- ============================================================================
-- 36. SUPPLIER_INVOICES
-- ============================================================================
ALTER TABLE supplier_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY supplier_invoices_select ON supplier_invoices
  FOR SELECT USING (
    public.is_scheme_member(scheme_id)
    OR supplier_id = public.current_profile_id()
  );

CREATE POLICY supplier_invoices_insert ON supplier_invoices
  FOR INSERT WITH CHECK (
    public.is_scheme_member(scheme_id)
    OR supplier_id = public.current_profile_id()
  );

CREATE POLICY supplier_invoices_update ON supplier_invoices
  FOR UPDATE USING (
    public.is_scheme_manager(scheme_id)
    OR supplier_id = public.current_profile_id()
  );


-- ============================================================================
-- 37. FINANCIAL_DOCUMENTS
-- ============================================================================
ALTER TABLE financial_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY financial_documents_select ON financial_documents
  FOR SELECT USING (public.is_scheme_member(scheme_id));

CREATE POLICY financial_documents_insert ON financial_documents
  FOR INSERT WITH CHECK (public.is_scheme_member(scheme_id));

CREATE POLICY financial_documents_update ON financial_documents
  FOR UPDATE USING (public.is_scheme_manager(scheme_id))
  WITH CHECK (public.is_scheme_manager(scheme_id));


-- ============================================================================
-- IMPORTANT: Service role bypass
-- ============================================================================
-- Supabase service_role key bypasses RLS by default. Our server actions use
-- the service role key (via Prisma), so the application layer continues to
-- work without changes. RLS provides defence in depth: if a client ever
-- connects with the anon key or a user JWT directly, they are restricted
-- to only their own data.
--
-- To verify RLS is working, you can test with the anon key and a user JWT
-- in the Supabase dashboard API explorer.
-- ============================================================================
