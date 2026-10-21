-- Meeting-Management Wizard — Stage B notices
-- Additive and idempotent. Adds the notice and notice-recipient tables.

CREATE TABLE IF NOT EXISTS "notices" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "meeting_id" UUID NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "status" TEXT NOT NULL DEFAULT 'ISSUED',
  "issued_by_id" UUID,
  "issued_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "notice_period_days" INTEGER,
  "compliant" BOOLEAN NOT NULL DEFAULT true,
  "content" JSONB NOT NULL,
  "document_url" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE "notices" ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS "notices_meeting_id_version_idx" ON "notices" ("meeting_id", "version");

CREATE TABLE IF NOT EXISTS "notice_recipients" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "notice_id" UUID NOT NULL,
  "lot_id" UUID,
  "profile_id" UUID,
  "name" TEXT,
  "email" TEXT,
  "method" TEXT NOT NULL DEFAULT 'EMAIL',
  "sent_at" TIMESTAMPTZ,
  "delivery_outcome" TEXT NOT NULL DEFAULT 'PENDING',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE "notice_recipients" ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS "notice_recipients_notice_id_idx" ON "notice_recipients" ("notice_id");

DO $$ BEGIN
  ALTER TABLE "notices" ADD CONSTRAINT "notices_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN RAISE NOTICE 'skip: %', SQLERRM; END $$;
DO $$ BEGIN
  ALTER TABLE "notice_recipients" ADD CONSTRAINT "notice_recipients_notice_id_fkey" FOREIGN KEY ("notice_id") REFERENCES "notices"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN RAISE NOTICE 'skip: %', SQLERRM; END $$;
