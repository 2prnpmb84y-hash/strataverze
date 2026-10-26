-- Multi-jurisdiction plan, phase 1b (26 Oct 2026): record the rule pack a
-- levy notice, an interest charge or a debt recovery case was worked out
-- under, for example "AU-NSW 2026.10.1" (pack code and version).
--
-- APPLY THIS BEFORE DEPLOYING THE CODE THAT NEEDS IT: the app reads every
-- column of these tables, so the new code fails against the old tables. The
-- old code works against the new tables (the columns are nullable).
--
-- No backfill. Records made before this change stay null: the rules in force
-- when they were made were NSW's, but not necessarily version 2026.10.1, so
-- no version is claimed for them. Notices brought across at takeover also
-- stay null (they were raised in the old system).
--
-- Applied by hand in the Supabase SQL editor, like the other migrations.

BEGIN;
ALTER TABLE public.levy_notices ADD COLUMN IF NOT EXISTS rule_pack varchar(40);
ALTER TABLE public.journal_entries ADD COLUMN IF NOT EXISTS rule_pack varchar(40);
ALTER TABLE public.debt_recovery_cases ADD COLUMN IF NOT EXISTS rule_pack varchar(40);
COMMIT;
