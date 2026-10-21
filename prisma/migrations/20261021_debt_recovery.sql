-- Debt Recovery Module Tables
-- Creates tables for the NSW levy debt recovery workflow

-- Debt Recovery Cases
CREATE TABLE IF NOT EXISTS debt_recovery_cases (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id             UUID NOT NULL REFERENCES schemes(id) ON DELETE CASCADE,
  lot_id                UUID NOT NULL REFERENCES lots(id),
  owner_id              UUID NOT NULL REFERENCES profiles(id),
  case_number           VARCHAR(30) NOT NULL UNIQUE,
  -- Debt summary
  principal_owed        DECIMAL(12, 2) NOT NULL,
  interest_owed         DECIMAL(12, 2) NOT NULL DEFAULT 0,
  costs_owed            DECIMAL(12, 2) NOT NULL DEFAULT 0,
  total_owed            DECIMAL(12, 2) NOT NULL,
  -- Status tracking
  status                TEXT NOT NULL DEFAULT 'OPEN',
  current_step          TEXT NOT NULL DEFAULT 'LEDGER_VERIFICATION',
  priority              TEXT NOT NULL DEFAULT 'NORMAL',
  -- Initiator
  initiated_by          UUID NOT NULL REFERENCES profiles(id),
  initiated_role        TEXT NOT NULL,
  -- Authority and approvals
  committee_approval    BOOLEAN NOT NULL DEFAULT false,
  approval_motion_id    UUID REFERENCES motions(id),
  approval_date         DATE,
  -- Legal tracking
  solicitor_ref         VARCHAR(100),
  solicitor_name        VARCHAR(200),
  court_file_number     VARCHAR(50),
  -- Dispute and hardship
  has_dispute           BOOLEAN NOT NULL DEFAULT false,
  dispute_details       TEXT,
  has_hardship_request  BOOLEAN NOT NULL DEFAULT false,
  hardship_details      TEXT,
  -- Exclusion
  exclude_from_recovery BOOLEAN NOT NULL DEFAULT false,
  exclusion_reason      TEXT,
  -- Metadata
  notes                 TEXT,
  closed_at             TIMESTAMPTZ,
  closed_reason         TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_debt_recovery_cases_scheme_status ON debt_recovery_cases(scheme_id, status);
CREATE INDEX IF NOT EXISTS idx_debt_recovery_cases_lot ON debt_recovery_cases(lot_id);
CREATE INDEX IF NOT EXISTS idx_debt_recovery_cases_owner ON debt_recovery_cases(owner_id);

-- Debt Recovery Steps (10-step workflow)
CREATE TABLE IF NOT EXISTS debt_recovery_steps (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id             UUID NOT NULL REFERENCES debt_recovery_cases(id) ON DELETE CASCADE,
  step_type           TEXT NOT NULL,
  step_order          INTEGER NOT NULL,
  status              TEXT NOT NULL DEFAULT 'PENDING',
  -- Action details
  action_required     TEXT NOT NULL,
  legal_basis         TEXT,
  responsible_party   TEXT NOT NULL,
  approval_required   BOOLEAN NOT NULL DEFAULT false,
  approved_by         UUID,
  approved_at         TIMESTAMPTZ,
  -- Timing
  trigger_condition   TEXT,
  due_date            DATE,
  completed_at        TIMESTAMPTZ,
  completed_by        UUID,
  -- Correspondence
  notice_type         TEXT,
  notice_sent_at      TIMESTAMPTZ,
  notice_method       TEXT,
  -- Evidence and outcome
  evidence_notes      TEXT,
  outcome             TEXT,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_debt_recovery_steps_case_order ON debt_recovery_steps(case_id, step_order);

-- Payment Plans
CREATE TABLE IF NOT EXISTS payment_plans (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id               UUID NOT NULL UNIQUE REFERENCES debt_recovery_cases(id) ON DELETE CASCADE,
  scheme_id             UUID NOT NULL REFERENCES schemes(id),
  lot_id                UUID NOT NULL REFERENCES lots(id),
  -- Plan terms
  total_amount          DECIMAL(12, 2) NOT NULL,
  instalment_amount     DECIMAL(12, 2) NOT NULL,
  frequency             TEXT NOT NULL,
  start_date            DATE NOT NULL,
  end_date              DATE NOT NULL,
  number_of_instalments INTEGER NOT NULL,
  -- Interest and ongoing levies
  includes_interest     BOOLEAN NOT NULL DEFAULT false,
  includes_ongoing      BOOLEAN NOT NULL DEFAULT false,
  interest_waived       BOOLEAN NOT NULL DEFAULT false,
  -- Status
  status                TEXT NOT NULL DEFAULT 'PROPOSED',
  approved_by           UUID,
  approved_at           TIMESTAMPTZ,
  defaulted_at          TIMESTAMPTZ,
  default_reason        TEXT,
  -- Conditions
  conditions            TEXT,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_plans_scheme ON payment_plans(scheme_id);
CREATE INDEX IF NOT EXISTS idx_payment_plans_lot ON payment_plans(lot_id);

-- Payment Plan Instalments
CREATE TABLE IF NOT EXISTS payment_plan_instalments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id             UUID NOT NULL REFERENCES payment_plans(id) ON DELETE CASCADE,
  instalment_number   INTEGER NOT NULL,
  due_date            DATE NOT NULL,
  amount              DECIMAL(12, 2) NOT NULL,
  amount_paid         DECIMAL(12, 2) NOT NULL DEFAULT 0,
  status              TEXT NOT NULL DEFAULT 'UPCOMING',
  paid_at             TIMESTAMPTZ,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(plan_id, instalment_number)
);

CREATE INDEX IF NOT EXISTS idx_payment_plan_instalments_plan_status ON payment_plan_instalments(plan_id, status);

-- Debt Recovery Documents
CREATE TABLE IF NOT EXISTS debt_recovery_documents (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id             UUID NOT NULL REFERENCES debt_recovery_cases(id) ON DELETE CASCADE,
  document_type       TEXT NOT NULL,
  title               VARCHAR(300) NOT NULL,
  description         TEXT,
  file_url            TEXT,
  generated_content   TEXT,
  is_draft            BOOLEAN NOT NULL DEFAULT true,
  issued_at           TIMESTAMPTZ,
  created_by          UUID NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_debt_recovery_documents_case_type ON debt_recovery_documents(case_id, document_type);

-- Debt Recovery Activity Log
CREATE TABLE IF NOT EXISTS debt_recovery_activities (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id             UUID NOT NULL REFERENCES debt_recovery_cases(id) ON DELETE CASCADE,
  activity_type       TEXT NOT NULL,
  description         TEXT NOT NULL,
  performed_by        UUID NOT NULL,
  metadata            JSONB,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_debt_recovery_activities_case_created ON debt_recovery_activities(case_id, created_at);
