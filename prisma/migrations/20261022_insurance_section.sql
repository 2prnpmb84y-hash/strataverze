-- Insurance section foundation (Stage 0)
-- Idempotent: safe to re-run. Hand-applied via the Supabase SQL editor because
-- the build container cannot reach the database directly.

-- ─── 1. Extend insurance_policies ──────────────────────────────────────────
ALTER TABLE "insurance_policies"
  ALTER COLUMN "coverage_amount" TYPE numeric(14,2);

ALTER TABLE "insurance_policies" ADD COLUMN IF NOT EXISTS "insured_entity_name" text;
ALTER TABLE "insurance_policies" ADD COLUMN IF NOT EXISTS "insured_address" text;
ALTER TABLE "insurance_policies" ADD COLUMN IF NOT EXISTS "additional_insured" text;
ALTER TABLE "insurance_policies" ADD COLUMN IF NOT EXISTS "contact_person" text;
ALTER TABLE "insurance_policies" ADD COLUMN IF NOT EXISTS "contact_email" text;
ALTER TABLE "insurance_policies" ADD COLUMN IF NOT EXISTS "contact_phone" text;
ALTER TABLE "insurance_policies" ADD COLUMN IF NOT EXISTS "claims_contact" text;
ALTER TABLE "insurance_policies" ADD COLUMN IF NOT EXISTS "reference_numbers" text;
ALTER TABLE "insurance_policies" ADD COLUMN IF NOT EXISTS "coverage_summary" text;
ALTER TABLE "insurance_policies" ADD COLUMN IF NOT EXISTS "exclusions" text;
ALTER TABLE "insurance_policies" ADD COLUMN IF NOT EXISTS "conditions" text;
ALTER TABLE "insurance_policies" ADD COLUMN IF NOT EXISTS "endorsements" text;
ALTER TABLE "insurance_policies" ADD COLUMN IF NOT EXISTS "currency" text NOT NULL DEFAULT 'AUD';
ALTER TABLE "insurance_policies" ADD COLUMN IF NOT EXISTS "total_premium" numeric(12,2);
ALTER TABLE "insurance_policies" ADD COLUMN IF NOT EXISTS "payment_due_date" timestamptz;
ALTER TABLE "insurance_policies" ADD COLUMN IF NOT EXISTS "payment_status" text;
ALTER TABLE "insurance_policies" ADD COLUMN IF NOT EXISTS "payment_date" timestamptz;
ALTER TABLE "insurance_policies" ADD COLUMN IF NOT EXISTS "payment_reference" text;
ALTER TABLE "insurance_policies" ADD COLUMN IF NOT EXISTS "invoice_document_id" uuid;

-- ─── 2. insurance_coverage_items ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "insurance_coverage_items" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "policy_id"   uuid NOT NULL,
  "category"    text NOT NULL,
  "description" text,
  "sum_insured" numeric(14,2),
  "excess"      numeric(12,2),
  "conditions"  text,
  "position"    integer NOT NULL DEFAULT 0,
  "created_at"  timestamptz NOT NULL DEFAULT now(),
  "updated_at"  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE "insurance_coverage_items" ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS "insurance_coverage_items_policy_id_idx" ON "insurance_coverage_items" ("policy_id");

-- ─── 3. insurance_premium_line_items ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS "insurance_premium_line_items" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "policy_id"  uuid NOT NULL,
  "label"      text NOT NULL,
  "kind"       text NOT NULL DEFAULT 'BASE',
  "amount"     numeric(12,2) NOT NULL,
  "position"   integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE "insurance_premium_line_items" ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS "insurance_premium_line_items_policy_id_idx" ON "insurance_premium_line_items" ("policy_id");

-- ─── 4. insurance_claims ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "insurance_claims" (
  "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "scheme_id"         uuid NOT NULL,
  "policy_id"         uuid,
  "claim_number"      text,
  "title"             text NOT NULL,
  "incident_category" text,
  "incident_date"     timestamptz,
  "incident_time"     text,
  "discovered_date"   timestamptz,
  "incident_location" text,
  "lot_reference"     text,
  "common_property"   boolean,
  "individual_lot"    boolean,
  "description"       text,
  "damage_details"    text,
  "immediate_action"  text,
  "estimated_loss"    numeric(14,2),
  "reporter_type"     text,
  "reporter_name"     text,
  "contact_email"     text,
  "contact_phone"     text,
  "sms_updates"       boolean NOT NULL DEFAULT false,
  "other_parties"     text,
  "insurer_claim_ref" text,
  "status"            text NOT NULL DEFAULT 'DRAFT',
  "assigned_owner_id" uuid,
  "assessor_details"  text,
  "contractor_details" text,
  "claimed_amount"    numeric(14,2),
  "approved_amount"   numeric(14,2),
  "paid_amount"       numeric(14,2),
  "excess_amount"     numeric(12,2),
  "settlement_details" text,
  "decision_reason"   text,
  "lodged_at"         timestamptz,
  "lodged_channel"    text,
  "lodged_recipient"  text,
  "lodged_reference"  text,
  "lodged_by_id"      uuid,
  "closed_at"         timestamptz,
  "created_at"        timestamptz NOT NULL DEFAULT now(),
  "updated_at"        timestamptz NOT NULL DEFAULT now(),
  "deleted_at"        timestamptz
);
ALTER TABLE "insurance_claims" ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS "insurance_claims_scheme_id_status_idx" ON "insurance_claims" ("scheme_id", "status");
CREATE INDEX IF NOT EXISTS "insurance_claims_policy_id_idx" ON "insurance_claims" ("policy_id");

-- ─── 5. insurance_claim_events ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "insurance_claim_events" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "claim_id"    uuid NOT NULL,
  "event_type"  text NOT NULL,
  "from_status" text,
  "to_status"   text,
  "note"        text,
  "actor_id"    uuid,
  "payload"     jsonb,
  "created_at"  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE "insurance_claim_events" ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS "insurance_claim_events_claim_id_idx" ON "insurance_claim_events" ("claim_id");

-- ─── 6. insurance_renewals ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "insurance_renewals" (
  "id"                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "scheme_id"            uuid NOT NULL,
  "expiring_policy_id"   uuid NOT NULL,
  "stage"                text NOT NULL DEFAULT 'NOT_STARTED',
  "owner_id"             uuid,
  "due_date"             timestamptz,
  "reminder_lead_days"   integer,
  "declared_changes"     text,
  "outstanding_info"     text,
  "declaration"          jsonb,
  "selected_quote_id"    uuid,
  "selection_rationale"  text,
  "approved_by"          text,
  "placement_instructions" text,
  "cover_confirmed_at"   timestamptz,
  "successor_policy_id"  uuid,
  "not_proceeding_reason" text,
  "notes"                text,
  "created_at"           timestamptz NOT NULL DEFAULT now(),
  "updated_at"           timestamptz NOT NULL DEFAULT now(),
  "deleted_at"           timestamptz
);
ALTER TABLE "insurance_renewals" ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS "insurance_renewals_scheme_id_stage_idx" ON "insurance_renewals" ("scheme_id", "stage");
CREATE INDEX IF NOT EXISTS "insurance_renewals_expiring_policy_id_idx" ON "insurance_renewals" ("expiring_policy_id");
CREATE UNIQUE INDEX IF NOT EXISTS "insurance_renewals_successor_policy_id_key" ON "insurance_renewals" ("successor_policy_id") WHERE "successor_policy_id" IS NOT NULL;

-- ─── 7. insurance_renewal_quotes ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "insurance_renewal_quotes" (
  "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "renewal_id"          uuid NOT NULL,
  "insurer"             text NOT NULL,
  "broker"              text,
  "period_start"        timestamptz,
  "period_end"          timestamptz,
  "premium"             numeric(12,2),
  "itemised_charges"    jsonb,
  "sum_insured"         numeric(14,2),
  "coverage_limits"     jsonb,
  "excesses"            jsonb,
  "exclusions"          text,
  "conditions"          text,
  "endorsements"        text,
  "material_differences" text,
  "valid_until"         timestamptz,
  "notes"               text,
  "created_at"          timestamptz NOT NULL DEFAULT now(),
  "updated_at"          timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE "insurance_renewal_quotes" ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS "insurance_renewal_quotes_renewal_id_idx" ON "insurance_renewal_quotes" ("renewal_id");

-- ─── 8. insurance_documents ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "insurance_documents" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "scheme_id"     uuid NOT NULL,
  "policy_id"     uuid,
  "claim_id"      uuid,
  "renewal_id"    uuid,
  "category"      text NOT NULL,
  "title"         text NOT NULL,
  "file_url"      text NOT NULL,
  "file_name"     text NOT NULL,
  "file_size"     integer,
  "mime_type"     text,
  "version"       integer NOT NULL DEFAULT 1,
  "supersedes_id" uuid,
  "is_current"    boolean NOT NULL DEFAULT true,
  "access_level"  text NOT NULL DEFAULT 'RESTRICTED',
  "uploaded_by"   uuid NOT NULL,
  "document_date" timestamptz,
  "notes"         text,
  "created_at"    timestamptz NOT NULL DEFAULT now(),
  "deleted_at"    timestamptz
);
ALTER TABLE "insurance_documents" ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS "insurance_documents_policy_id_idx" ON "insurance_documents" ("policy_id");
CREATE INDEX IF NOT EXISTS "insurance_documents_claim_id_idx" ON "insurance_documents" ("claim_id");
CREATE INDEX IF NOT EXISTS "insurance_documents_renewal_id_idx" ON "insurance_documents" ("renewal_id");
CREATE INDEX IF NOT EXISTS "insurance_documents_scheme_id_category_idx" ON "insurance_documents" ("scheme_id", "category");

-- ─── 9. insurance_tasks ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "insurance_tasks" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "scheme_id"    uuid NOT NULL,
  "policy_id"    uuid,
  "claim_id"     uuid,
  "renewal_id"   uuid,
  "title"        text NOT NULL,
  "due_date"     timestamptz,
  "status"       text NOT NULL DEFAULT 'OPEN',
  "assigned_to"  uuid,
  "notes"        text,
  "completed_at" timestamptz,
  "created_at"   timestamptz NOT NULL DEFAULT now(),
  "updated_at"   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE "insurance_tasks" ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS "insurance_tasks_scheme_id_status_idx" ON "insurance_tasks" ("scheme_id", "status");
CREATE INDEX IF NOT EXISTS "insurance_tasks_claim_id_idx" ON "insurance_tasks" ("claim_id");

-- ─── 10. Foreign keys (idempotent) ─────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE "insurance_coverage_items" ADD CONSTRAINT "insurance_coverage_items_policy_id_fkey"
    FOREIGN KEY ("policy_id") REFERENCES "insurance_policies"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN RAISE NOTICE 'skip: %', SQLERRM; END $$;

DO $$ BEGIN
  ALTER TABLE "insurance_premium_line_items" ADD CONSTRAINT "insurance_premium_line_items_policy_id_fkey"
    FOREIGN KEY ("policy_id") REFERENCES "insurance_policies"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN RAISE NOTICE 'skip: %', SQLERRM; END $$;

DO $$ BEGIN
  ALTER TABLE "insurance_claims" ADD CONSTRAINT "insurance_claims_scheme_id_fkey"
    FOREIGN KEY ("scheme_id") REFERENCES "schemes"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN RAISE NOTICE 'skip: %', SQLERRM; END $$;

DO $$ BEGIN
  ALTER TABLE "insurance_claims" ADD CONSTRAINT "insurance_claims_policy_id_fkey"
    FOREIGN KEY ("policy_id") REFERENCES "insurance_policies"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN RAISE NOTICE 'skip: %', SQLERRM; END $$;

DO $$ BEGIN
  ALTER TABLE "insurance_claim_events" ADD CONSTRAINT "insurance_claim_events_claim_id_fkey"
    FOREIGN KEY ("claim_id") REFERENCES "insurance_claims"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN RAISE NOTICE 'skip: %', SQLERRM; END $$;

DO $$ BEGIN
  ALTER TABLE "insurance_renewals" ADD CONSTRAINT "insurance_renewals_scheme_id_fkey"
    FOREIGN KEY ("scheme_id") REFERENCES "schemes"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN RAISE NOTICE 'skip: %', SQLERRM; END $$;

DO $$ BEGIN
  ALTER TABLE "insurance_renewals" ADD CONSTRAINT "insurance_renewals_expiring_policy_id_fkey"
    FOREIGN KEY ("expiring_policy_id") REFERENCES "insurance_policies"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN RAISE NOTICE 'skip: %', SQLERRM; END $$;

DO $$ BEGIN
  ALTER TABLE "insurance_renewals" ADD CONSTRAINT "insurance_renewals_successor_policy_id_fkey"
    FOREIGN KEY ("successor_policy_id") REFERENCES "insurance_policies"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN RAISE NOTICE 'skip: %', SQLERRM; END $$;

DO $$ BEGIN
  ALTER TABLE "insurance_renewal_quotes" ADD CONSTRAINT "insurance_renewal_quotes_renewal_id_fkey"
    FOREIGN KEY ("renewal_id") REFERENCES "insurance_renewals"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN RAISE NOTICE 'skip: %', SQLERRM; END $$;

DO $$ BEGIN
  ALTER TABLE "insurance_documents" ADD CONSTRAINT "insurance_documents_scheme_id_fkey"
    FOREIGN KEY ("scheme_id") REFERENCES "schemes"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN RAISE NOTICE 'skip: %', SQLERRM; END $$;

DO $$ BEGIN
  ALTER TABLE "insurance_documents" ADD CONSTRAINT "insurance_documents_policy_id_fkey"
    FOREIGN KEY ("policy_id") REFERENCES "insurance_policies"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN RAISE NOTICE 'skip: %', SQLERRM; END $$;

DO $$ BEGIN
  ALTER TABLE "insurance_documents" ADD CONSTRAINT "insurance_documents_claim_id_fkey"
    FOREIGN KEY ("claim_id") REFERENCES "insurance_claims"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN RAISE NOTICE 'skip: %', SQLERRM; END $$;

DO $$ BEGIN
  ALTER TABLE "insurance_documents" ADD CONSTRAINT "insurance_documents_renewal_id_fkey"
    FOREIGN KEY ("renewal_id") REFERENCES "insurance_renewals"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN RAISE NOTICE 'skip: %', SQLERRM; END $$;

DO $$ BEGIN
  ALTER TABLE "insurance_documents" ADD CONSTRAINT "insurance_documents_supersedes_id_fkey"
    FOREIGN KEY ("supersedes_id") REFERENCES "insurance_documents"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN RAISE NOTICE 'skip: %', SQLERRM; END $$;

DO $$ BEGIN
  ALTER TABLE "insurance_tasks" ADD CONSTRAINT "insurance_tasks_scheme_id_fkey"
    FOREIGN KEY ("scheme_id") REFERENCES "schemes"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN RAISE NOTICE 'skip: %', SQLERRM; END $$;

DO $$ BEGIN
  ALTER TABLE "insurance_tasks" ADD CONSTRAINT "insurance_tasks_claim_id_fkey"
    FOREIGN KEY ("claim_id") REFERENCES "insurance_claims"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN RAISE NOTICE 'skip: %', SQLERRM; END $$;
