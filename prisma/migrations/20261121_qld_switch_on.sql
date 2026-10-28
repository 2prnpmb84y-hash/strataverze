-- Queensland switch-on (QLD stage 2, step 11, 28 Oct 2026). Idempotent.
-- Applied by hand in the Supabase SQL editor, like the other migrations.
--
-- APPLY THIS BEFORE DEPLOYING THE CODE THAT NEEDS IT. The code lets an
-- administrator set up a Queensland building and lets an NSW and a
-- Queensland building share a plan number. Against the old database both
-- are refused at insert: schemes_state_has_rule_pack_check allows NSW only,
-- and schemes_plan_number_key is unique across the platform. No column is
-- added or read, so NSW keeps working if the code goes first, and the
-- refusal is safe (nothing is half created, the wizard shows "Failed to
-- create scheme"). But the Add Property wizard offers Queensland as soon as
-- the code is live, so apply this first. The old code works against the new
-- database: it never writes a Queensland building, and its own duplicate
-- check still looks across the platform.
--
-- Migrations 20261116 to 20261120 must already be applied (the Queensland
-- building data, insurance shares, payment late charge, proceedings
-- reminders and building selectors). 20261119 in particular: the daily
-- proceedings reminder starts reading proceedings_deadline_reminders for
-- Queensland buildings once this pack is live.
--
-- 1. schemes_state_has_rule_pack_check now allows NSW and QLD, the states
--    with a live rule pack (RULE_PACKS in src/config/statutory.ts,
--    SUPPORTED_SCHEME_STATES in src/config/jurisdictions.ts).
--
-- 2. schemes_time_zone_check already allows Australia/Brisbane (migration
--    20261109), the zone every Queensland building is given
--    (src/lib/jurisdiction/time-zone.ts defaultTimeZone). It is not changed.
--    Check before applying:
--      SELECT pg_get_constraintdef(oid) FROM pg_constraint
--      WHERE conname = 'schemes_time_zone_check';
--
-- 3. Plan numbers are unique within each state, not across the platform
--    (decided 27 Oct 2026): the unique index schemes_plan_number_key
--    (plan_number), created by the ORM migration 20261017T1439 as a unique
--    index, is replaced by schemes_state_plan_number_key (state,
--    plan_number). The old one is dropped as a constraint and as an index,
--    so this works whichever form the database holds.
--
-- Checked 28 Oct 2026: every building is NSW (the state check allows NSW
-- only) and every plan number is unique across the platform (the old
-- index), so every existing row is unique on (state, plan_number) and passes
-- every check here. The new index is built before the old one is dropped,
-- so plan numbers are never left unchecked. Run before applying, expecting
-- no rows:
--   SELECT state, plan_number, count(*) FROM public.schemes
--   GROUP BY state, plan_number HAVING count(*) > 1;
--   SELECT id, state FROM public.schemes WHERE state NOT IN ('NSW', 'QLD');

BEGIN;
SET LOCAL lock_timeout = '5s';

-- 1. Buildings in New South Wales and Queensland.
ALTER TABLE public.schemes DROP CONSTRAINT IF EXISTS schemes_state_has_rule_pack_check;
ALTER TABLE public.schemes ADD CONSTRAINT schemes_state_has_rule_pack_check CHECK (state IN ('NSW', 'QLD'));

-- 2. schemes_time_zone_check: unchanged (already allows Australia/Brisbane).

-- 3. Plan numbers unique within each state.
CREATE UNIQUE INDEX IF NOT EXISTS schemes_state_plan_number_key ON public.schemes (state, plan_number);
ALTER TABLE public.schemes DROP CONSTRAINT IF EXISTS schemes_plan_number_key;
DROP INDEX IF EXISTS public.schemes_plan_number_key;

COMMIT;
