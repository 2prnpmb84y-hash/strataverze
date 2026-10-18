-- ============================================================
-- CREATE 13 MISSING FINANCIAL MANAGEMENT TABLES
-- Run this in Supabase SQL Editor
-- All tables use gen_random_uuid() for id defaults
-- and now() for timestamp defaults
-- ============================================================

-- ============================================================
-- 1. SUPPLIERS (no FK dependencies on other missing tables)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id uuid NOT NULL REFERENCES public.schemes(id) ON DELETE CASCADE,
  company_name varchar(200) NOT NULL,
  trading_name varchar(200),
  abn varchar(11),
  contact_name varchar(200),
  email varchar(320),
  phone varchar(20),
  bank_account_name varchar(200),
  bank_account_number varchar(20),
  bank_bsb varchar(7),
  gst_registered boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  payment_terms integer NOT NULL DEFAULT 30,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 2. SCHEME_BANK_ACCOUNTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.scheme_bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id uuid NOT NULL REFERENCES public.schemes(id) ON DELETE CASCADE,
  account_name text NOT NULL,
  bank_name text NOT NULL,
  bsb varchar(7) NOT NULL,
  account_number varchar(20) NOT NULL,
  account_type text NOT NULL DEFAULT 'OPERATING',
  is_active boolean NOT NULL DEFAULT true,
  is_operating boolean NOT NULL DEFAULT false,
  bank_feed_enabled boolean NOT NULL DEFAULT false,
  last_reconciled_balance numeric(12,2),
  last_reconciled_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 3. ACCOUNT_CODES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.account_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id uuid NOT NULL REFERENCES public.schemes(id) ON DELETE CASCADE,
  fund_id uuid NOT NULL REFERENCES public.funds(id) ON DELETE CASCADE,
  code varchar(10) NOT NULL,
  name varchar(200) NOT NULL,
  description text NOT NULL DEFAULT '',
  account_type text NOT NULL,
  account_sub_type text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  is_system_account boolean NOT NULL DEFAULT false,
  gst_applicable boolean NOT NULL DEFAULT false,
  parent_account_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scheme_id, code)
);

-- Self-referencing FK for parent_account_id
ALTER TABLE public.account_codes
  ADD CONSTRAINT fk_account_codes_parent
  FOREIGN KEY (parent_account_id) REFERENCES public.account_codes(id)
  ON DELETE SET NULL;

-- ============================================================
-- 4. FINANCIAL_PERIODS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.financial_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id uuid NOT NULL REFERENCES public.schemes(id) ON DELETE CASCADE,
  name varchar(100) NOT NULL,
  period_type text NOT NULL DEFAULT 'MONTHLY',
  start_date date NOT NULL,
  end_date date NOT NULL,
  status text NOT NULL DEFAULT 'OPEN',
  closed_at timestamptz,
  closed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 5. JOURNAL_ENTRIES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id uuid NOT NULL REFERENCES public.schemes(id) ON DELETE CASCADE,
  entry_number varchar(20) NOT NULL,
  entry_type text NOT NULL DEFAULT 'STANDARD',
  description varchar(500) NOT NULL DEFAULT '',
  transaction_date date NOT NULL,
  posting_date date,
  status text NOT NULL DEFAULT 'DRAFT',
  source_type text,
  source_id uuid,
  reversal_of_id uuid,
  created_by uuid,
  posted_by uuid,
  posted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Self-referencing FK for reversal_of_id
ALTER TABLE public.journal_entries
  ADD CONSTRAINT fk_journal_entries_reversal
  FOREIGN KEY (reversal_of_id) REFERENCES public.journal_entries(id)
  ON DELETE SET NULL;

-- ============================================================
-- 6. JOURNAL_LINES (depends on journal_entries, account_codes, funds)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.journal_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id uuid NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  account_code_id uuid NOT NULL REFERENCES public.account_codes(id) ON DELETE RESTRICT,
  fund_id uuid NOT NULL REFERENCES public.funds(id) ON DELETE RESTRICT,
  debit numeric(12,2) NOT NULL DEFAULT 0,
  credit numeric(12,2) NOT NULL DEFAULT 0,
  gst_amount numeric(12,2) NOT NULL DEFAULT 0,
  description varchar(500),
  lot_id uuid REFERENCES public.lots(id) ON DELETE SET NULL,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  bank_transaction_id uuid
);

-- ============================================================
-- 7. BANK_TRANSACTIONS (depends on scheme_bank_accounts)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.bank_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id uuid NOT NULL REFERENCES public.schemes(id) ON DELETE CASCADE,
  bank_account_id uuid NOT NULL REFERENCES public.scheme_bank_accounts(id) ON DELETE CASCADE,
  transaction_date date NOT NULL,
  description varchar(500) NOT NULL DEFAULT '',
  reference varchar(100),
  amount numeric(12,2) NOT NULL,
  balance numeric(12,2),
  reconciliation_status text NOT NULL DEFAULT 'UNMATCHED',
  matched_journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  matched_at timestamptz,
  matched_by uuid,
  matching_rule_id uuid,
  is_duplicate boolean NOT NULL DEFAULT false,
  import_source text,
  import_batch_id uuid,
  imported_at timestamptz
);

-- ============================================================
-- 8. BUDGET_LINES (depends on account_codes, funds)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.budget_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_code_id uuid NOT NULL REFERENCES public.account_codes(id) ON DELETE CASCADE,
  fund_id uuid NOT NULL REFERENCES public.funds(id) ON DELETE CASCADE,
  financial_year integer NOT NULL,
  budget_amount numeric(12,2) NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 9. LEVY_SCHEDULES (depends on funds)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.levy_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id uuid NOT NULL REFERENCES public.schemes(id) ON DELETE CASCADE,
  fund_id uuid NOT NULL REFERENCES public.funds(id) ON DELETE CASCADE,
  financial_year integer NOT NULL,
  frequency text NOT NULL DEFAULT 'QUARTERLY',
  budget_amount numeric(12,2) NOT NULL DEFAULT 0,
  total_lots integer NOT NULL DEFAULT 0,
  total_entitlement numeric(10,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'DRAFT',
  approved_at timestamptz,
  approved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 10. LEVY_NOTICES (depends on levy_schedules, lots, funds)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.levy_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id uuid NOT NULL REFERENCES public.schemes(id) ON DELETE CASCADE,
  levy_schedule_id uuid NOT NULL REFERENCES public.levy_schedules(id) ON DELETE CASCADE,
  lot_id uuid NOT NULL REFERENCES public.lots(id) ON DELETE CASCADE,
  fund_id uuid NOT NULL REFERENCES public.funds(id) ON DELETE CASCADE,
  owner_id uuid,
  notice_number varchar(20) NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  due_date date NOT NULL,
  amount_due numeric(12,2) NOT NULL DEFAULT 0,
  amount_paid numeric(12,2) NOT NULL DEFAULT 0,
  balance_outstanding numeric(12,2) NOT NULL DEFAULT 0,
  interest_charged numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'ISSUED',
  issued_at timestamptz,
  paid_in_full_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 11. SUPPLIER_INVOICES (depends on suppliers, account_codes, funds)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.supplier_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id uuid NOT NULL REFERENCES public.schemes(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  fund_id uuid REFERENCES public.funds(id) ON DELETE SET NULL,
  account_code_id uuid REFERENCES public.account_codes(id) ON DELETE SET NULL,
  journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  invoice_number varchar(50) NOT NULL,
  invoice_date date NOT NULL,
  due_date date NOT NULL,
  description varchar(500),
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  gst_amount numeric(12,2) NOT NULL DEFAULT 0,
  total_amount numeric(12,2) NOT NULL DEFAULT 0,
  amount_paid numeric(12,2) NOT NULL DEFAULT 0,
  balance_outstanding numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'DRAFT',
  approved_at timestamptz,
  approved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 12. FINANCIAL_DOCUMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.financial_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id uuid NOT NULL REFERENCES public.schemes(id) ON DELETE CASCADE,
  document_type text NOT NULL,
  document_status text NOT NULL DEFAULT 'PENDING',
  document_date date NOT NULL,
  file_name varchar(500) NOT NULL,
  file_url text NOT NULL,
  mime_type varchar(100),
  file_size integer,
  amount numeric(12,2),
  payer_name varchar(200),
  payee_reference varchar(200),
  verification_status text NOT NULL DEFAULT 'UNVERIFIED',
  lot_id uuid REFERENCES public.lots(id) ON DELETE SET NULL,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  supplier_invoice_id uuid REFERENCES public.supplier_invoices(id) ON DELETE SET NULL,
  bank_transaction_id uuid REFERENCES public.bank_transactions(id) ON DELETE SET NULL,
  levy_notice_id uuid REFERENCES public.levy_notices(id) ON DELETE SET NULL,
  uploaded_by uuid,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 13. MATCHING_RULES (depends on account_codes, funds)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.matching_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id uuid NOT NULL REFERENCES public.schemes(id) ON DELETE CASCADE,
  name varchar(200) NOT NULL,
  description varchar(500),
  match_type text NOT NULL DEFAULT 'DESCRIPTION',
  description_pattern varchar(500),
  reference_pattern varchar(200),
  transaction_sign text,
  min_amount numeric(12,2),
  max_amount numeric(12,2),
  exact_amount numeric(12,2),
  target_account_code_id uuid REFERENCES public.account_codes(id) ON DELETE SET NULL,
  target_fund_id uuid REFERENCES public.funds(id) ON DELETE SET NULL,
  auto_post boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  priority integer NOT NULL DEFAULT 0,
  match_count integer NOT NULL DEFAULT 0,
  last_matched_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- Add the deferred FK from journal_lines.bank_transaction_id
-- ============================================================
ALTER TABLE public.journal_lines
  ADD CONSTRAINT fk_journal_lines_bank_transaction
  FOREIGN KEY (bank_transaction_id) REFERENCES public.bank_transactions(id)
  ON DELETE SET NULL;

-- Add the deferred FK from bank_transactions.matching_rule_id
ALTER TABLE public.bank_transactions
  ADD CONSTRAINT fk_bank_transactions_matching_rule
  FOREIGN KEY (matching_rule_id) REFERENCES public.matching_rules(id)
  ON DELETE SET NULL;

-- Add the FK from funds.bank_account_id to scheme_bank_accounts
ALTER TABLE public.funds
  ADD CONSTRAINT fk_funds_bank_account
  FOREIGN KEY (bank_account_id) REFERENCES public.scheme_bank_accounts(id)
  ON DELETE SET NULL;

-- ============================================================
-- INDEXES for common query patterns
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_suppliers_scheme ON public.suppliers(scheme_id);
CREATE INDEX IF NOT EXISTS idx_scheme_bank_accounts_scheme ON public.scheme_bank_accounts(scheme_id);
CREATE INDEX IF NOT EXISTS idx_account_codes_scheme ON public.account_codes(scheme_id);
CREATE INDEX IF NOT EXISTS idx_account_codes_fund ON public.account_codes(fund_id);
CREATE INDEX IF NOT EXISTS idx_financial_periods_scheme ON public.financial_periods(scheme_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_scheme ON public.journal_entries(scheme_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_date ON public.journal_entries(transaction_date);
CREATE INDEX IF NOT EXISTS idx_journal_lines_entry ON public.journal_lines(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_account ON public.journal_lines(account_code_id);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_scheme ON public.bank_transactions(scheme_id);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_account ON public.bank_transactions(bank_account_id);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_date ON public.bank_transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_budget_lines_account ON public.budget_lines(account_code_id);
CREATE INDEX IF NOT EXISTS idx_budget_lines_fund_year ON public.budget_lines(fund_id, financial_year);
CREATE INDEX IF NOT EXISTS idx_levy_schedules_scheme ON public.levy_schedules(scheme_id);
CREATE INDEX IF NOT EXISTS idx_levy_schedules_fund ON public.levy_schedules(fund_id);
CREATE INDEX IF NOT EXISTS idx_levy_notices_scheme ON public.levy_notices(scheme_id);
CREATE INDEX IF NOT EXISTS idx_levy_notices_schedule ON public.levy_notices(levy_schedule_id);
CREATE INDEX IF NOT EXISTS idx_levy_notices_lot ON public.levy_notices(lot_id);
CREATE INDEX IF NOT EXISTS idx_levy_notices_status ON public.levy_notices(status);
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_scheme ON public.supplier_invoices(scheme_id);
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_supplier ON public.supplier_invoices(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_status ON public.supplier_invoices(status);
CREATE INDEX IF NOT EXISTS idx_financial_documents_scheme ON public.financial_documents(scheme_id);
CREATE INDEX IF NOT EXISTS idx_matching_rules_scheme ON public.matching_rules(scheme_id);

-- ============================================================
-- Verify all tables were created
-- ============================================================
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'suppliers', 'scheme_bank_accounts', 'account_codes',
    'financial_periods', 'journal_entries', 'journal_lines',
    'bank_transactions', 'budget_lines', 'levy_schedules',
    'levy_notices', 'supplier_invoices', 'financial_documents',
    'matching_rules'
  )
ORDER BY table_name;
