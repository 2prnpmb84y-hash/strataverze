-- Meeting-Management Wizard — Epic 0 foundations
-- Additive and idempotent. Extends meetings and adds the structured agenda,
-- the versioned rules layer, the applied-rule snapshot, and the append-only event log.
-- Safe to run more than once.

-- 1. Extend meetings (all additive; nullable except updated_at which backfills now())
ALTER TABLE "meetings" ADD COLUMN IF NOT EXISTS "timezone" TEXT;
ALTER TABLE "meetings" ADD COLUMN IF NOT EXISTS "format" TEXT;
ALTER TABLE "meetings" ADD COLUMN IF NOT EXISTS "start_time" TIMESTAMPTZ;
ALTER TABLE "meetings" ADD COLUMN IF NOT EXISTS "end_time" TIMESTAMPTZ;
ALTER TABLE "meetings" ADD COLUMN IF NOT EXISTS "convenor_id" UUID;
ALTER TABLE "meetings" ADD COLUMN IF NOT EXISTS "chairperson_id" UUID;
ALTER TABLE "meetings" ADD COLUMN IF NOT EXISTS "financial_period_id" UUID;
ALTER TABLE "meetings" ADD COLUMN IF NOT EXISTS "join_url" TEXT;
ALTER TABLE "meetings" ADD COLUMN IF NOT EXISTS "join_details" TEXT;
ALTER TABLE "meetings" ADD COLUMN IF NOT EXISTS "cancelled_reason" TEXT;
ALTER TABLE "meetings" ADD COLUMN IF NOT EXISTS "opened_at" TIMESTAMPTZ;
ALTER TABLE "meetings" ADD COLUMN IF NOT EXISTS "closed_at" TIMESTAMPTZ;
ALTER TABLE "meetings" ADD COLUMN IF NOT EXISTS "quorum_met" BOOLEAN;
ALTER TABLE "meetings" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now();

-- 2. Structured agenda items
CREATE TABLE IF NOT EXISTS "agenda_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "meeting_id" UUID NOT NULL,
  "position" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "resolution_text" TEXT,
  "explanatory_note" TEXT,
  "resolution_category" TEXT,
  "submitter_id" UUID,
  "motion_library_entry_id" UUID,
  "outcome" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE "agenda_items" ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS "agenda_items_meeting_id_position_idx" ON "agenda_items" ("meeting_id", "position");

-- 3. Meeting templates (rules-layer data)
CREATE TABLE IF NOT EXISTS "meeting_templates" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "state" TEXT NOT NULL,
  "meeting_type" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "items" JSONB NOT NULL,
  "rule_set_version" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE "meeting_templates" ENABLE ROW LEVEL SECURITY;

-- 4. Motion library (rules-layer data)
CREATE TABLE IF NOT EXISTS "motion_library_entries" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "state" TEXT NOT NULL,
  "meeting_type" TEXT,
  "category" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "resolution_text" TEXT NOT NULL,
  "explanatory_note" TEXT,
  "default_resolution_category" TEXT,
  "placeholders" JSONB,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE "motion_library_entries" ENABLE ROW LEVEL SECURITY;

-- 5. Versioned jurisdiction rule set
CREATE TABLE IF NOT EXISTS "meeting_rule_sets" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "state" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "effective_from" DATE NOT NULL,
  "notice_periods" JSONB NOT NULL,
  "minutes_deadlines" JSONB NOT NULL,
  "quorum_rules" JSONB NOT NULL,
  "resolution_categories" JSONB NOT NULL,
  "retention" JSONB NOT NULL,
  "notes" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE "meeting_rule_sets" ENABLE ROW LEVEL SECURITY;

-- 6. Applied-rule snapshot (one per meeting)
CREATE TABLE IF NOT EXISTS "applied_rule_sets" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "meeting_id" UUID NOT NULL,
  "rule_set_state" TEXT NOT NULL,
  "rule_set_version" TEXT NOT NULL,
  "snapshot" JSONB NOT NULL,
  "applied_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE "applied_rule_sets" ENABLE ROW LEVEL SECURITY;

-- 7. Append-only meeting event log
CREATE TABLE IF NOT EXISTS "meeting_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "meeting_id" UUID NOT NULL,
  "actor_id" UUID,
  "event_type" TEXT NOT NULL,
  "payload" JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE "meeting_events" ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS "meeting_events_meeting_id_created_at_idx" ON "meeting_events" ("meeting_id", "created_at");

-- 8. Constraints (wrapped: skip if present, log and continue on any error)
DO $$ BEGIN
  ALTER TABLE "meeting_templates" ADD CONSTRAINT "meeting_templates_state_meeting_type_name_key" UNIQUE ("state", "meeting_type", "name");
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN RAISE NOTICE 'skip meeting_templates uq: %', SQLERRM; END $$;
DO $$ BEGIN
  ALTER TABLE "meeting_rule_sets" ADD CONSTRAINT "meeting_rule_sets_state_version_key" UNIQUE ("state", "version");
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN RAISE NOTICE 'skip meeting_rule_sets uq: %', SQLERRM; END $$;
DO $$ BEGIN
  ALTER TABLE "applied_rule_sets" ADD CONSTRAINT "applied_rule_sets_meeting_id_key" UNIQUE ("meeting_id");
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN RAISE NOTICE 'skip applied_rule_sets uq: %', SQLERRM; END $$;
DO $$ BEGIN
  ALTER TABLE "agenda_items" ADD CONSTRAINT "agenda_items_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN RAISE NOTICE 'skip agenda_items fk: %', SQLERRM; END $$;
DO $$ BEGIN
  ALTER TABLE "applied_rule_sets" ADD CONSTRAINT "applied_rule_sets_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN RAISE NOTICE 'skip applied_rule_sets fk: %', SQLERRM; END $$;
DO $$ BEGIN
  ALTER TABLE "meeting_events" ADD CONSTRAINT "meeting_events_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN RAISE NOTICE 'skip meeting_events fk: %', SQLERRM; END $$;
