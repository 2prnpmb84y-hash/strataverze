-- NSW payment plans (26 Oct 2026): an owner's request on the standard form,
-- the decision of the owners corporation or strata committee meeting on it,
-- and the payment plan statement details.
--
-- - payment_plan_requests: one row per request, with the reply due date
--   (28 days from a complete request in NSW, from the rule pack) and the
--   meeting's decision.
-- - payment_plans: a plan may now exist without a debt recovery case (an
--   owner can ask before any recovery starts), and a case may have more
--   than one plan over time, so case_id is optional and no longer unique.
--   At most one plan per lot can be ACTIVE (being followed) at a time.
-- - The StrataVerze payment plan set-up fee is charged to the owners
--   corporation only. No fee or charge for a payment plan can be passed to
--   the owner (NSW, from 27 Oct 2025); decided by StrataVerze on 26 Oct 2026.
--
-- On 26 Oct 2026 production had no payment plans and no debt recovery cases.
-- APPLY THIS BEFORE DEPLOYING THE CODE THAT NEEDS IT: the app reads every
-- column of payment_plans. The old code works against the new tables.
-- Applied by hand in the Supabase SQL editor, like the other migrations.

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.payment_plan_requests (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id                 uuid NOT NULL REFERENCES public.schemes(id),
  lot_id                    uuid NOT NULL REFERENCES public.lots(id),
  case_id                   uuid REFERENCES public.debt_recovery_cases(id) ON DELETE SET NULL,
  owner_names               text NOT NULL,
  hardship_statement        boolean NOT NULL,
  current_debt              numeric(12, 2),
  proposed_instalment       numeric(12, 2),
  proposed_frequency        text CHECK (proposed_frequency IN ('WEEKLY', 'FORTNIGHTLY', 'MONTHLY')),
  proposed_months           integer CHECK (proposed_months > 0),
  interest_waiver_requested boolean NOT NULL DEFAULT false,
  received_on               date NOT NULL,
  reply_due_on              date NOT NULL,
  source                    text NOT NULL CHECK (source IN ('OWNER_PORTAL', 'RECEIVED')),
  submitted_by              uuid,
  status                    text NOT NULL DEFAULT 'RECEIVED' CHECK (status IN ('RECEIVED', 'APPROVED', 'REFUSED', 'WITHDRAWN')),
  decision_body             text CHECK (decision_body IN ('STRATA_COMMITTEE', 'OWNERS_CORPORATION')),
  decided_on                date,
  decision_recorded_by      uuid,
  decision_recorded_at      timestamptz,
  refusal_reasons           text,
  interest_waiver           text CHECK (interest_waiver IN ('WAIVED', 'NOT_WAIVED')),
  replied_on                date,
  rule_pack                 varchar(40),
  notes                     text,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_plan_requests_refusal_reasons CHECK (status <> 'REFUSED' OR coalesce(length(trim(refusal_reasons)), 0) > 0)
);
CREATE INDEX IF NOT EXISTS idx_payment_plan_requests_scheme_status ON public.payment_plan_requests(scheme_id, status);
CREATE INDEX IF NOT EXISTS idx_payment_plan_requests_lot ON public.payment_plan_requests(lot_id);
-- RLS on, no policies: the Data API is denied; the app connects as the owner.
ALTER TABLE public.payment_plan_requests ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.payment_plans DROP CONSTRAINT IF EXISTS payment_plans_case_id_key;
ALTER TABLE public.payment_plans ALTER COLUMN case_id DROP NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_plans_case ON public.payment_plans(case_id);
ALTER TABLE public.payment_plans
  ADD COLUMN IF NOT EXISTS request_id uuid UNIQUE REFERENCES public.payment_plan_requests(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS agreed_on date,
  ADD COLUMN IF NOT EXISTS covers_current_levies boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS levies_owing numeric(12, 2),
  ADD COLUMN IF NOT EXISTS interest_owing numeric(12, 2),
  ADD COLUMN IF NOT EXISTS interest_method text,
  ADD COLUMN IF NOT EXISTS payment_methods text,
  ADD COLUMN IF NOT EXISTS contact_details text,
  ADD COLUMN IF NOT EXISTS rule_pack varchar(40);
CREATE UNIQUE INDEX IF NOT EXISTS payment_plans_one_active_per_lot ON public.payment_plans(lot_id) WHERE status = 'ACTIVE';

UPDATE public.platform_price_book
SET payer_type = 'OC',
    recoverable_from_owner = false,
    description = 'Debt recovery: payment plan set-up (charged to the owners corporation)',
    notes = 'Charged to the owners corporation only. No fee for a payment plan can be passed to the owner (NSW, from 27 Oct 2025). Decided 26 Oct 2026.'
WHERE code = 'RECOVERY_STEP' AND variant = 'PAYMENT_PLAN';

COMMIT;
