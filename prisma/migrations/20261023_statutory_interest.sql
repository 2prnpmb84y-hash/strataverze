-- Finance hardening Stage 2: statutory interest setting
-- Idempotent: safe to re-run. Hand-applied via the Supabase SQL editor because
-- the build container cannot reach the database directly.
--
-- Interest on overdue levies is fixed by the Strata Schemes Management Act
-- 2015 (NSW) s 85: simple interest at 10% a year, none if paid within one
-- month of the due date. The owners corporation may resolve that contributions
-- bear no interest (s 85(3)); it cannot set another rate. The scheme records
-- which applies and, for no interest, the meeting and agenda item (motion)
-- that resolved it. schemes.interest_rate is no longer used for calculation.
--
-- RLS: schemes already has RLS; these are new columns on it.

ALTER TABLE "schemes" ADD COLUMN IF NOT EXISTS "interest_mode" text NOT NULL DEFAULT 'STATUTORY';
ALTER TABLE "schemes" DROP CONSTRAINT IF EXISTS "schemes_interest_mode_check";
ALTER TABLE "schemes" ADD CONSTRAINT "schemes_interest_mode_check" CHECK ("interest_mode" IN ('STATUTORY','NO_INTEREST'));
ALTER TABLE "schemes" ADD COLUMN IF NOT EXISTS "interest_resolution_meeting_id" uuid REFERENCES "meetings"("id") ON DELETE SET NULL;
ALTER TABLE "schemes" ADD COLUMN IF NOT EXISTS "interest_resolution_motion_id" uuid REFERENCES "agenda_items"("id") ON DELETE SET NULL;
ALTER TABLE "schemes" ADD COLUMN IF NOT EXISTS "interest_resolution_recorded_by" uuid REFERENCES "profiles"("id");
ALTER TABLE "schemes" ADD COLUMN IF NOT EXISTS "interest_resolution_recorded_at" timestamptz;
ALTER TABLE "schemes" DROP CONSTRAINT IF EXISTS "schemes_no_interest_resolution_check";
ALTER TABLE "schemes" ADD CONSTRAINT "schemes_no_interest_resolution_check"
  CHECK ("interest_mode" = 'STATUTORY' OR ("interest_resolution_meeting_id" IS NOT NULL AND "interest_resolution_motion_id" IS NOT NULL));
