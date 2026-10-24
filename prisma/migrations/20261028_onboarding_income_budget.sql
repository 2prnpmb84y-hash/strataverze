-- Onboarding (24 Oct): last year's income and expenditure, a budget adopted
-- before StrataVerze took over, and the first due date of a levy schedule.
--
-- 1. prior_year_actuals: the actuals of the last financial year before the
--    takeover, by fund and account, as printed in the previous manager's
--    statements. They are comparatives only and are never posted: the fund
--    balances in the opening balances already include that year's result.
-- 2. budgets.adopted_before_takeover_on: the date of the general meeting,
--    held before the takeover, that adopted the budget. Such a budget is
--    ADOPTED with no meeting or motion in StrataVerze.
-- 3. levy_schedules.first_due_date: the first instalment's due date, entered
--    at onboarding and offered when the notices are generated.
--
-- Additive only: one new table and two nullable columns. Must be applied
-- BEFORE the code that reads them is deployed, because the app selects every
-- column of budgets and levy_schedules.
--
-- RLS: finance readers of the scheme can read the new table, as for budgets.
-- No write policies: the application writes through its own connection.
--
-- Idempotent. Applied by hand through the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS public.prior_year_actuals (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "scheme_id"       uuid NOT NULL REFERENCES public.schemes("id") ON DELETE CASCADE,
  "fund_id"         uuid NOT NULL REFERENCES public.funds("id") ON DELETE CASCADE,
  "account_code_id" uuid NOT NULL REFERENCES public.account_codes("id") ON DELETE CASCADE,
  "financial_year"  integer NOT NULL CHECK ("financial_year" BETWEEN 1990 AND 2200),
  "amount"          numeric(12, 2) NOT NULL,
  "source"          text NOT NULL DEFAULT 'onboarding' CHECK ("source" IN ('onboarding')),
  "created_by"      uuid REFERENCES public.profiles("id"),
  "created_at"      timestamptz NOT NULL DEFAULT now(),
  "updated_at"      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "prior_year_actuals_fund_account_year_key" UNIQUE ("fund_id", "account_code_id", "financial_year")
);
CREATE INDEX IF NOT EXISTS "prior_year_actuals_scheme_year_idx" ON public.prior_year_actuals ("scheme_id", "financial_year");
ALTER TABLE public.prior_year_actuals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "prior_year_actuals_select" ON public.prior_year_actuals;
CREATE POLICY "prior_year_actuals_select" ON public.prior_year_actuals
  FOR SELECT TO authenticated USING (public.can_view_scheme_finance_controls("scheme_id"));
COMMENT ON TABLE public.prior_year_actuals IS
  'Last year''s income and expenditure by fund and account, from the previous manager''s statements (onboarding, 24 Oct 2026). Comparatives only, never posted.';

ALTER TABLE public.budgets ADD COLUMN IF NOT EXISTS "adopted_before_takeover_on" date;
ALTER TABLE public.budgets DROP CONSTRAINT IF EXISTS "budgets_adopted_before_takeover_check";
ALTER TABLE public.budgets ADD CONSTRAINT "budgets_adopted_before_takeover_check"
  CHECK ("adopted_before_takeover_on" IS NULL OR ("status" IN ('ADOPTED', 'SUPERSEDED') AND "adopted_meeting_id" IS NULL));
COMMENT ON COLUMN public.budgets.adopted_before_takeover_on IS
  'The date of the general meeting, held before StrataVerze took over, that adopted this budget (onboarding, 24 Oct 2026).';

ALTER TABLE public.levy_schedules ADD COLUMN IF NOT EXISTS "first_due_date" date;
COMMENT ON COLUMN public.levy_schedules.first_due_date IS
  'The due date of the first instalment, entered at onboarding (24 Oct 2026).';
