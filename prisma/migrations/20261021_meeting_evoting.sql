-- Meeting-Management Wizard — Pre-meeting electronic voting (Epic 7)
-- Additive and idempotent.

ALTER TABLE "schemes" ADD COLUMN IF NOT EXISTS "pre_meeting_evoting_adopted" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "electronic_ballots" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "meeting_id" UUID NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "opens_at" TIMESTAMPTZ NOT NULL,
  "closes_at" TIMESTAMPTZ NOT NULL,
  "created_by_id" UUID,
  "closed_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE "electronic_ballots" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS "electronic_votes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "ballot_id" UUID NOT NULL,
  "agenda_item_id" UUID NOT NULL,
  "lot_id" UUID,
  "profile_id" UUID,
  "unit_entitlement" INTEGER NOT NULL DEFAULT 0,
  "vote_value" TEXT NOT NULL,
  "is_informal" BOOLEAN NOT NULL DEFAULT false,
  "cast_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE "electronic_votes" ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS "electronic_votes_ballot_id_agenda_item_id_idx" ON "electronic_votes" ("ballot_id", "agenda_item_id");

DO $$ BEGIN
  ALTER TABLE "electronic_ballots" ADD CONSTRAINT "electronic_ballots_meeting_id_key" UNIQUE ("meeting_id");
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN RAISE NOTICE 'skip: %', SQLERRM; END $$;
DO $$ BEGIN
  ALTER TABLE "electronic_ballots" ADD CONSTRAINT "electronic_ballots_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN RAISE NOTICE 'skip: %', SQLERRM; END $$;
DO $$ BEGIN
  ALTER TABLE "electronic_votes" ADD CONSTRAINT "electronic_votes_ballot_item_lot_key" UNIQUE ("ballot_id", "agenda_item_id", "lot_id");
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN RAISE NOTICE 'skip: %', SQLERRM; END $$;
DO $$ BEGIN
  ALTER TABLE "electronic_votes" ADD CONSTRAINT "electronic_votes_ballot_id_fkey" FOREIGN KEY ("ballot_id") REFERENCES "electronic_ballots"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN RAISE NOTICE 'skip: %', SQLERRM; END $$;
