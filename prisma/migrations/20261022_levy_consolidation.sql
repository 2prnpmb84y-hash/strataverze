-- StrataVerze: levy consolidation, stage 1
-- Depends on: supabase/migrations/003-create-financial-tables.sql
--
-- Levy schedules and notices become the single levy system.
-- 1. Special levies: a levy schedule can now be a one-off SPECIAL levy with
--    its own title, description and due date (frequency ONE_OFF).
-- 2. A levy is owed by the lot whether or not its owner has a portal account,
--    so levy_notices.owner_id becomes optional (set when the lot has an owner).
--
-- Additive and backwards compatible: run it before deploying the code.

ALTER TABLE "levy_schedules" ADD COLUMN IF NOT EXISTS "levy_type"   text NOT NULL DEFAULT 'ORDINARY';
ALTER TABLE "levy_schedules" ADD COLUMN IF NOT EXISTS "title"       text;
ALTER TABLE "levy_schedules" ADD COLUMN IF NOT EXISTS "description" text;
ALTER TABLE "levy_schedules" ADD COLUMN IF NOT EXISTS "due_date"    date;

ALTER TABLE "levy_notices" ALTER COLUMN "owner_id" DROP NOT NULL;
