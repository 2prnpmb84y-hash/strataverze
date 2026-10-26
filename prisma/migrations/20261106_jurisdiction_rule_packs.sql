-- Multi-jurisdiction plan, phase 1a (26 Oct 2026): buildings only in a
-- jurisdiction with a rule pack.
-- Plan: https://claude.ai/artifact/4mgrKi2E7VeBdSqTSgZhyc
--
-- The app now refuses a building in a state without a rule pack
-- (RULE_PACKS in src/config/statutory.ts), and no longer falls back to the
-- NSW rules. This check holds the same line in the database, so no path
-- (an import, a script, an older deploy) can store a building elsewhere.
-- When a new jurisdiction's pack is added, replace this constraint with one
-- that lists it, in the same release.
--
-- Checked 26 Oct 2026: both buildings in production are NSW, so the
-- constraint validates. Safe in either order with the code. Idempotent.
--
-- Applied by hand in the Supabase SQL editor, like the other migrations.

BEGIN;
ALTER TABLE public.schemes DROP CONSTRAINT IF EXISTS schemes_state_has_rule_pack_check;
ALTER TABLE public.schemes ADD CONSTRAINT schemes_state_has_rule_pack_check CHECK (state IN ('NSW'));
COMMIT;
