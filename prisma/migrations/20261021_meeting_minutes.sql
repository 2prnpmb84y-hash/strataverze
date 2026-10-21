-- Meeting-Management Wizard — Stage E minutes
-- Additive and idempotent. Adds the minutes table.

CREATE TABLE IF NOT EXISTS "minutes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "meeting_id" UUID NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "state" TEXT NOT NULL DEFAULT 'DRAFT',
  "content" JSONB NOT NULL,
  "document_url" TEXT,
  "prepared_by_id" UUID,
  "confirmed_at" TIMESTAMPTZ,
  "confirmed_by_id" UUID,
  "distributed_at" TIMESTAMPTZ,
  "retention_until" DATE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE "minutes" ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS "minutes_meeting_id_version_idx" ON "minutes" ("meeting_id", "version");

DO $$ BEGIN
  ALTER TABLE "minutes" ADD CONSTRAINT "minutes_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN RAISE NOTICE 'skip: %', SQLERRM; END $$;
