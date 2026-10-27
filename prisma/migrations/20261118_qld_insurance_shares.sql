-- Queensland insurance in contributions (QLD go-live gap, 27 Oct 2026). Idempotent.
-- Applied by hand in the Supabase SQL editor, like the other migrations, and
-- before the code deploys: the ORM selects every column of schemes and
-- levy_notices, so the new code fails against the old tables. The old code
-- works against the new tables (both columns are nullable, with no default).
--
-- schemes.plan_format: the plan format of a Queensland building's lots, from
-- the pack's PLAN_FORMAT selector (building, volumetric or standard format
-- plan of subdivision; Standard Module ss 198, 199, 201). It decides how the
-- insurance part of a contribution is shared (s 201(1)). The check allows
-- every value the selector lists. Which of them StrataVerze applies (building
-- and volumetric format only, decided 27 Oct 2026) is the app's check, from
-- the pack. A plan format is held for a Queensland building only, and a
-- Queensland building may have none: the app flags it and refuses a
-- contribution that includes insurance until it is recorded.
--
-- levy_notices.insurance_amount: the part of the notice's amount_due that
-- pays for insurance, where the contribution was split (Standard Module
-- s 162(5)): shared by the interest schedule, the rest by the contribution
-- schedule. Null for every other notice, including every NSW notice. Never
-- negative and never more than the notice's amount.
--
-- Checked 27 Oct 2026: every building is NSW (schemes_state_has_rule_pack_check
-- allows NSW only), so every existing row has both columns null and satisfies
-- every check.

BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.schemes ADD COLUMN IF NOT EXISTS plan_format text;

ALTER TABLE public.schemes DROP CONSTRAINT IF EXISTS schemes_plan_format_check;
ALTER TABLE public.schemes ADD CONSTRAINT schemes_plan_format_check
  CHECK (plan_format IS NULL OR plan_format IN ('BUILDING', 'VOLUMETRIC', 'STANDARD'));

-- A plan format is held for a Queensland building only.
ALTER TABLE public.schemes DROP CONSTRAINT IF EXISTS schemes_plan_format_state_check;
ALTER TABLE public.schemes ADD CONSTRAINT schemes_plan_format_state_check
  CHECK (plan_format IS NULL OR state = 'QLD');

ALTER TABLE public.levy_notices ADD COLUMN IF NOT EXISTS insurance_amount numeric(12,2);

ALTER TABLE public.levy_notices DROP CONSTRAINT IF EXISTS levy_notices_insurance_amount_check;
ALTER TABLE public.levy_notices ADD CONSTRAINT levy_notices_insurance_amount_check
  CHECK (insurance_amount IS NULL OR (insurance_amount >= 0 AND insurance_amount <= amount_due));

COMMIT;
