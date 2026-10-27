-- Queensland building data (QLD stage 2, step 10, 27 Oct 2026). Idempotent.
-- Applied by hand in the Supabase SQL editor, like the other migrations.
-- Apply it before the code deploys: the app reads every column of schemes and
-- lots, so the new code fails against the old tables. The old code works
-- against the new tables (both columns are nullable, with no default).
--
-- schemes.regulation_module: the Queensland regulation module named in the
-- building's community management statement (BCCMA s 21; Standard Module
-- s 3(2)), from the pack's REGULATION_MODULE selector. The check allows every
-- value the selector lists; which of them StrataVerze applies (the Standard
-- Module only, decided 27 Oct 2026) is the app's check, from the pack.
-- A module is held only for a Queensland building. A Queensland building may
-- still have none: the app flags it to the adviser until it is recorded.
-- Once the onboarding wizard asks for the module, the state check can be
-- tightened to require it for Queensland.
--
-- lots.interest_schedule_entitlement: the lot's interest schedule lot
-- entitlement (BCCMA s 46), the pack's second schedule. The contribution
-- schedule lot entitlement stays in lots.entitlement. Each entitlement is a
-- whole number, not 0 (s 46): integer, and positive when set. NSW lots leave
-- it null.
--
-- Checked 27 Oct 2026: every building is NSW (schemes_state_has_rule_pack_check
-- allows NSW only), so every existing row has both columns null and satisfies
-- every check.

BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.schemes ADD COLUMN IF NOT EXISTS regulation_module text;

ALTER TABLE public.schemes DROP CONSTRAINT IF EXISTS schemes_regulation_module_check;
ALTER TABLE public.schemes ADD CONSTRAINT schemes_regulation_module_check
  CHECK (regulation_module IS NULL OR regulation_module IN ('STANDARD', 'ACCOMMODATION', 'COMMERCIAL', 'SMALL_SCHEMES', 'SPECIFIED_TWO_LOT'));

-- A regulation module is held for a Queensland building only.
ALTER TABLE public.schemes DROP CONSTRAINT IF EXISTS schemes_regulation_module_state_check;
ALTER TABLE public.schemes ADD CONSTRAINT schemes_regulation_module_state_check
  CHECK (regulation_module IS NULL OR state = 'QLD');

ALTER TABLE public.lots ADD COLUMN IF NOT EXISTS interest_schedule_entitlement integer;

ALTER TABLE public.lots DROP CONSTRAINT IF EXISTS lots_interest_schedule_entitlement_check;
ALTER TABLE public.lots ADD CONSTRAINT lots_interest_schedule_entitlement_check
  CHECK (interest_schedule_entitlement IS NULL OR interest_schedule_entitlement > 0);

COMMIT;
