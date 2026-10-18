-- ============================================================
-- CREATE 13 MISSING FINANCIAL MANAGEMENT TABLES
-- Run this in Supabase SQL Editor
-- Uses IF NOT EXISTS so safe to re-run
-- Tables ordered by dependency (referenced tables first)
-- ============================================================

-- suppliers
CREATE TABLE IF NOT EXISTS public.suppliers (
  abn varchar(11),
  bank_account_name varchar(200),
  bank_account_number varchar(20),
  bank_bsb varchar(7),
  company_name varchar(200) NOT NULL,
  contact_name varchar(200),
  created_at timestamptz NOT NULL DEFAULT now(),
  email varchar(320),
  gst_registered boolean NOT NULL DEFAULT false,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  is_active boolean NOT NULL DEFAULT true,
  payment_terms integer,
  phone varchar(20),
  scheme_id uuid,
  trading_name varchar(200),
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS suppliers_scheme_id_idx ON public.suppliers (scheme_id);

-- scheme_bank_accounts
CREATE TABLE IF NOT EXISTS public.scheme_bank_accounts (
  account_name text NOT NULL,
  account_number varchar(20) NOT NULL,
  account_type text NOT NULL DEFAULT 'CHEQUE',
  bank_feed_enabled boolean NOT NULL DEFAULT false,
  bank_name text,
  bsb varchar(7) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  is_active boolean NOT NULL DEFAULT true,
  is_operating boolean NOT NULL DEFAULT false,
  last_reconciled_balance numeric(12,2),
  last_reconciled_date date,
  scheme_id uuid NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS scheme_bank_accounts_scheme_id_idx ON public.scheme_bank_accounts (scheme_id);

-- account_codes
CREATE TABLE IF NOT EXISTS public.account_codes (
  account_sub_type text,
  account_type text NOT NULL,
  code varchar(10) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  description text,
  fund_id uuid,
  gst_applicable boolean NOT NULL DEFAULT false,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  is_active boolean NOT NULL DEFAULT true,
  is_system_account boolean NOT NULL DEFAULT false,
  name varchar(200) NOT NULL,
  parent_account_id uuid,
  scheme_id uuid NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS account_codes_scheme_id_account_type_idx ON public.account_codes (scheme_id, account_type);
CREATE UNIQUE INDEX IF NOT EXISTS account_codes_scheme_id_code_key ON public.account_codes (scheme_id, code);

-- financial_periods
CREATE TABLE IF NOT EXISTS public.financial_periods (
  closed_at timestamptz,
  closed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  end_date date NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name varchar(100) NOT NULL,
  period_type text NOT NULL,
  scheme_id uuid NOT NULL,
  start_date date NOT NULL,
  status text NOT NULL DEFAULT 'OPEN',
  PRIMARY KEY (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS financial_periods_scheme_id_start_date_end_date_key ON public.financial_periods (scheme_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS financial_periods_scheme_id_status_idx ON public.financial_periods (scheme_id, status);

-- journal_entries
CREATE TABLE IF NOT EXISTS public.journal_entries (
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  description varchar(500) NOT NULL,
  entry_number varchar(20) NOT NULL,
  entry_type text NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  posted_at timestamptz,
  posted_by uuid,
  posting_date date NOT NULL DEFAULT now(),
  reversal_of_id uuid,
  scheme_id uuid NOT NULL,
  source_id uuid,
  source_type text NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT',
  transaction_date date NOT NULL,
  PRIMARY KEY (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS journal_entries_scheme_id_entry_number_key ON public.journal_entries (scheme_id, entry_number);
CREATE INDEX IF NOT EXISTS journal_entries_scheme_id_entry_type_idx ON public.journal_entries (scheme_id, entry_type);
CREATE INDEX IF NOT EXISTS journal_entries_scheme_id_status_idx ON public.journal_entries (scheme_id, status);
CREATE INDEX IF NOT EXISTS journal_entries_scheme_id_transaction_date_idx ON public.journal_entries (scheme_id, transaction_date);

-- journal_lines
CREATE TABLE IF NOT EXISTS public.journal_lines (
  account_code_id uuid NOT NULL,
  bank_transaction_id uuid,
  credit numeric(12,2),
  debit numeric(12,2),
  description varchar(500),
  fund_id uuid NOT NULL,
  gst_amount numeric(12,2),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  journal_entry_id uuid NOT NULL,
  lot_id uuid,
  supplier_id uuid,
  PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS journal_lines_account_code_id_idx ON public.journal_lines (account_code_id);
CREATE INDEX IF NOT EXISTS journal_lines_fund_id_idx ON public.journal_lines (fund_id);
CREATE INDEX IF NOT EXISTS journal_lines_journal_entry_id_idx ON public.journal_lines (journal_entry_id);

-- budget_lines
CREATE TABLE IF NOT EXISTS public.budget_lines (
  account_code_id uuid NOT NULL,
  budget_amount numeric(12,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  financial_year integer NOT NULL,
  fund_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  notes text,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS budget_lines_fund_id_account_code_id_financial_year_key ON public.budget_lines (fund_id, account_code_id, financial_year);

-- matching_rules
CREATE TABLE IF NOT EXISTS public.matching_rules (
  auto_post boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  description varchar(500),
  description_pattern varchar(500),
  exact_amount numeric(12,2),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  is_active boolean NOT NULL DEFAULT true,
  last_matched_at timestamptz,
  match_count integer NOT NULL DEFAULT 0,
  match_type text NOT NULL,
  max_amount numeric(12,2),
  min_amount numeric(12,2),
  name varchar(200) NOT NULL,
  priority integer NOT NULL DEFAULT 0,
  reference_pattern varchar(200),
  scheme_id uuid NOT NULL,
  target_account_code_id uuid,
  target_fund_id uuid,
  transaction_sign text,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS matching_rules_scheme_id_is_active_idx ON public.matching_rules (scheme_id, is_active);

-- bank_transactions
CREATE TABLE IF NOT EXISTS public.bank_transactions (
  amount numeric(12,2) NOT NULL,
  balance numeric(12,2),
  bank_account_id uuid NOT NULL,
  description varchar(500) NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  import_batch_id uuid,
  import_source text NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  is_duplicate boolean NOT NULL DEFAULT false,
  matched_at timestamptz,
  matched_by uuid,
  matched_journal_entry_id uuid,
  matching_rule_id uuid,
  reconciliation_status text NOT NULL DEFAULT 'UNMATCHED',
  reference varchar(100),
  scheme_id uuid NOT NULL,
  transaction_date date NOT NULL,
  PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS bank_transactions_bank_account_id_amount_transaction_date_idx ON public.bank_transactions (bank_account_id, amount, transaction_date);
CREATE INDEX IF NOT EXISTS bank_transactions_bank_account_id_transaction_date_idx ON public.bank_transactions (bank_account_id, transaction_date);
CREATE INDEX IF NOT EXISTS bank_transactions_scheme_id_reconciliation_status_idx ON public.bank_transactions (scheme_id, reconciliation_status);

-- levy_schedules
CREATE TABLE IF NOT EXISTS public.levy_schedules (
  approved_at timestamptz,
  approved_by uuid,
  budget_amount numeric(12,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  financial_year integer NOT NULL,
  frequency text NOT NULL,
  fund_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  scheme_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT',
  total_entitlement numeric(12,2) NOT NULL,
  total_lots integer NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS levy_schedules_scheme_id_financial_year_idx ON public.levy_schedules (scheme_id, financial_year);

-- levy_notices
CREATE TABLE IF NOT EXISTS public.levy_notices (
  amount_due numeric(12,2) NOT NULL,
  amount_paid numeric(12,2) NOT NULL DEFAULT '0',
  balance_outstanding numeric(12,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  due_date date NOT NULL,
  fund_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  interest_charged numeric(12,2) NOT NULL DEFAULT '0',
  issued_at timestamptz,
  levy_schedule_id uuid NOT NULL,
  lot_id uuid NOT NULL,
  notice_number varchar(20) NOT NULL,
  owner_id uuid NOT NULL,
  paid_in_full_at timestamptz,
  period_end date NOT NULL,
  period_start date NOT NULL,
  scheme_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT',
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS levy_notices_lot_id_status_idx ON public.levy_notices (lot_id, status);
CREATE INDEX IF NOT EXISTS levy_notices_owner_id_idx ON public.levy_notices (owner_id);
CREATE UNIQUE INDEX IF NOT EXISTS levy_notices_scheme_id_notice_number_key ON public.levy_notices (scheme_id, notice_number);
CREATE INDEX IF NOT EXISTS levy_notices_scheme_id_status_idx ON public.levy_notices (scheme_id, status);

-- supplier_invoices
CREATE TABLE IF NOT EXISTS public.supplier_invoices (
  account_code_id uuid NOT NULL,
  amount_paid numeric(12,2) NOT NULL DEFAULT '0',
  approved_at timestamptz,
  approved_by uuid,
  balance_outstanding numeric(12,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  description varchar(500) NOT NULL,
  due_date date NOT NULL,
  fund_id uuid NOT NULL,
  gst_amount numeric(12,2) NOT NULL DEFAULT '0',
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  invoice_date date NOT NULL,
  invoice_number varchar(50) NOT NULL,
  journal_entry_id uuid,
  scheme_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT',
  subtotal numeric(12,2) NOT NULL,
  supplier_id uuid NOT NULL,
  total_amount numeric(12,2) NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS supplier_invoices_scheme_id_due_date_idx ON public.supplier_invoices (scheme_id, due_date);
CREATE INDEX IF NOT EXISTS supplier_invoices_scheme_id_status_idx ON public.supplier_invoices (scheme_id, status);
CREATE INDEX IF NOT EXISTS supplier_invoices_supplier_id_idx ON public.supplier_invoices (supplier_id);

-- financial_documents
CREATE TABLE IF NOT EXISTS public.financial_documents (
  amount numeric(12,2),
  bank_transaction_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  document_date date,
  document_status text NOT NULL DEFAULT 'UPLOADED',
  document_type text NOT NULL,
  file_name varchar(500) NOT NULL,
  file_size integer NOT NULL,
  file_url text NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  levy_notice_id uuid,
  lot_id uuid,
  mime_type varchar(100) NOT NULL,
  payee_reference varchar(200),
  payer_name varchar(200),
  review_notes text,
  reviewed_at timestamptz,
  reviewed_by uuid,
  scheme_id uuid NOT NULL,
  supplier_id uuid,
  supplier_invoice_id uuid,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  uploaded_by uuid NOT NULL,
  verification_status text NOT NULL DEFAULT 'PENDING',
  PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS financial_documents_scheme_id_document_status_idx ON public.financial_documents (scheme_id, document_status);
CREATE INDEX IF NOT EXISTS financial_documents_scheme_id_document_type_idx ON public.financial_documents (scheme_id, document_type);


-- ============================================================
-- FOREIGN KEY CONSTRAINTS
-- Added after all tables exist to avoid ordering issues
-- ============================================================

DO $$ BEGIN
  ALTER TABLE public.suppliers
    ADD CONSTRAINT fk_suppliers_scheme_id
    FOREIGN KEY (scheme_id)
    REFERENCES public.schemes (id)
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.scheme_bank_accounts
    ADD CONSTRAINT fk_scheme_bank_accounts_scheme_id
    FOREIGN KEY (scheme_id)
    REFERENCES public.schemes (id)
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.account_codes
    ADD CONSTRAINT fk_account_codes_scheme_id
    FOREIGN KEY (scheme_id)
    REFERENCES public.schemes (id)
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.account_codes
    ADD CONSTRAINT fk_account_codes_fund_id
    FOREIGN KEY (fund_id)
    REFERENCES public.funds (id)
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.account_codes
    ADD CONSTRAINT fk_account_codes_parent_account_id
    FOREIGN KEY (parent_account_id)
    REFERENCES public.account_codes (id)
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.financial_periods
    ADD CONSTRAINT fk_financial_periods_scheme_id
    FOREIGN KEY (scheme_id)
    REFERENCES public.schemes (id)
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.journal_entries
    ADD CONSTRAINT fk_journal_entries_scheme_id
    FOREIGN KEY (scheme_id)
    REFERENCES public.schemes (id)
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.journal_entries
    ADD CONSTRAINT fk_journal_entries_reversal_of_id
    FOREIGN KEY (reversal_of_id)
    REFERENCES public.journal_entries (id)
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.journal_lines
    ADD CONSTRAINT fk_journal_lines_journal_entry_id
    FOREIGN KEY (journal_entry_id)
    REFERENCES public.journal_entries (id)
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.journal_lines
    ADD CONSTRAINT fk_journal_lines_account_code_id
    FOREIGN KEY (account_code_id)
    REFERENCES public.account_codes (id)
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.journal_lines
    ADD CONSTRAINT fk_journal_lines_fund_id
    FOREIGN KEY (fund_id)
    REFERENCES public.funds (id)
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.journal_lines
    ADD CONSTRAINT fk_journal_lines_lot_id
    FOREIGN KEY (lot_id)
    REFERENCES public.lots (id)
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.journal_lines
    ADD CONSTRAINT fk_journal_lines_supplier_id
    FOREIGN KEY (supplier_id)
    REFERENCES public.suppliers (id)
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.journal_lines
    ADD CONSTRAINT fk_journal_lines_bank_transaction_id
    FOREIGN KEY (bank_transaction_id)
    REFERENCES public.bank_transactions (id)
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.budget_lines
    ADD CONSTRAINT fk_budget_lines_fund_id
    FOREIGN KEY (fund_id)
    REFERENCES public.funds (id)
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.matching_rules
    ADD CONSTRAINT fk_matching_rules_scheme_id
    FOREIGN KEY (scheme_id)
    REFERENCES public.schemes (id)
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.matching_rules
    ADD CONSTRAINT fk_matching_rules_target_account_code_id
    FOREIGN KEY (target_account_code_id)
    REFERENCES public.account_codes (id)
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.matching_rules
    ADD CONSTRAINT fk_matching_rules_target_fund_id
    FOREIGN KEY (target_fund_id)
    REFERENCES public.funds (id)
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.bank_transactions
    ADD CONSTRAINT fk_bank_transactions_bank_account_id
    FOREIGN KEY (bank_account_id)
    REFERENCES public.scheme_bank_accounts (id)
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.bank_transactions
    ADD CONSTRAINT fk_bank_transactions_scheme_id
    FOREIGN KEY (scheme_id)
    REFERENCES public.schemes (id)
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.bank_transactions
    ADD CONSTRAINT fk_bank_transactions_matched_journal_entry_id
    FOREIGN KEY (matched_journal_entry_id)
    REFERENCES public.journal_entries (id)
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.bank_transactions
    ADD CONSTRAINT fk_bank_transactions_matching_rule_id
    FOREIGN KEY (matching_rule_id)
    REFERENCES public.matching_rules (id)
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.levy_schedules
    ADD CONSTRAINT fk_levy_schedules_scheme_id
    FOREIGN KEY (scheme_id)
    REFERENCES public.schemes (id)
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.levy_schedules
    ADD CONSTRAINT fk_levy_schedules_fund_id
    FOREIGN KEY (fund_id)
    REFERENCES public.funds (id)
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.levy_notices
    ADD CONSTRAINT fk_levy_notices_scheme_id
    FOREIGN KEY (scheme_id)
    REFERENCES public.schemes (id)
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.levy_notices
    ADD CONSTRAINT fk_levy_notices_levy_schedule_id
    FOREIGN KEY (levy_schedule_id)
    REFERENCES public.levy_schedules (id)
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.levy_notices
    ADD CONSTRAINT fk_levy_notices_lot_id
    FOREIGN KEY (lot_id)
    REFERENCES public.lots (id)
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.levy_notices
    ADD CONSTRAINT fk_levy_notices_fund_id
    FOREIGN KEY (fund_id)
    REFERENCES public.funds (id)
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.supplier_invoices
    ADD CONSTRAINT fk_supplier_invoices_scheme_id
    FOREIGN KEY (scheme_id)
    REFERENCES public.schemes (id)
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.supplier_invoices
    ADD CONSTRAINT fk_supplier_invoices_supplier_id
    FOREIGN KEY (supplier_id)
    REFERENCES public.suppliers (id)
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.supplier_invoices
    ADD CONSTRAINT fk_supplier_invoices_fund_id
    FOREIGN KEY (fund_id)
    REFERENCES public.funds (id)
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.supplier_invoices
    ADD CONSTRAINT fk_supplier_invoices_account_code_id
    FOREIGN KEY (account_code_id)
    REFERENCES public.account_codes (id)
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.financial_documents
    ADD CONSTRAINT fk_financial_documents_scheme_id
    FOREIGN KEY (scheme_id)
    REFERENCES public.schemes (id)
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.financial_documents
    ADD CONSTRAINT fk_financial_documents_lot_id
    FOREIGN KEY (lot_id)
    REFERENCES public.lots (id)
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.financial_documents
    ADD CONSTRAINT fk_financial_documents_supplier_id
    FOREIGN KEY (supplier_id)
    REFERENCES public.suppliers (id)
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.financial_documents
    ADD CONSTRAINT fk_financial_documents_supplier_invoice_id
    FOREIGN KEY (supplier_invoice_id)
    REFERENCES public.supplier_invoices (id)
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.financial_documents
    ADD CONSTRAINT fk_financial_documents_levy_notice_id
    FOREIGN KEY (levy_notice_id)
    REFERENCES public.levy_notices (id)
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.financial_documents
    ADD CONSTRAINT fk_financial_documents_bank_transaction_id
    FOREIGN KEY (bank_transaction_id)
    REFERENCES public.bank_transactions (id)
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================
-- VERIFY: List all newly created tables
-- ============================================================
SELECT table_name, (SELECT count(*) FROM information_schema.columns c WHERE c.table_name = t.table_name AND c.table_schema = 'public') as column_count
FROM information_schema.tables t
WHERE table_schema = 'public'
  AND table_name IN ('suppliers', 'scheme_bank_accounts', 'account_codes', 'financial_periods', 'journal_entries', 'journal_lines', 'budget_lines', 'matching_rules', 'bank_transactions', 'levy_schedules', 'levy_notices', 'supplier_invoices', 'financial_documents')
ORDER BY table_name;
