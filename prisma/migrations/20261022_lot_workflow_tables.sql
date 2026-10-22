-- StrataVerze: lot workflow tables (tracking migration)
--
-- These seven tables are in the Prisma schema and already exist in production,
-- but no migration in the repo created them. This file records them exactly as
-- they exist in production (read from the production catalogue on 2026-10-22)
-- so a fresh environment can be built from the repo. Every statement is
-- idempotent (IF NOT EXISTS), so running it against production changes nothing.
--
-- RLS is enabled with no policies, matching production: the Supabase Data API
-- is denied and the application connects as the table owner through Prisma.

-- ─── property_managers ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "property_managers" (
  "id"          uuid NOT NULL DEFAULT gen_random_uuid(),
  "lot_id"      uuid NOT NULL,
  "agent_name"  text,
  "company"     text,
  "address"     text,
  "agent_email" text,
  "phone"       text,
  "fax"         text,
  "email"       text,
  "created_at"  timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"  timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "property_managers_pkey" PRIMARY KEY (id),
  CONSTRAINT "property_managers_lot_id_key" UNIQUE (lot_id),
  CONSTRAINT "property_managers_lot_id_fkey" FOREIGN KEY (lot_id) REFERENCES lots(id) ON DELETE CASCADE
);
ALTER TABLE "property_managers" ENABLE ROW LEVEL SECURITY;

-- ─── lot_details ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "lot_details" (
  "id"                  uuid NOT NULL DEFAULT gen_random_uuid(),
  "lot_id"              uuid NOT NULL,
  "owner_phone"         text,
  "owner_mobile"        text,
  "contact_name"        text,
  "owner_address"       text,
  "owner_email"         text,
  "is_committee_member" boolean NOT NULL DEFAULT false,
  "paid_to_date"        date,
  "last_settled"        date,
  "created_at"          timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"          timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "lot_details_pkey" PRIMARY KEY (id),
  CONSTRAINT "lot_details_lot_id_key" UNIQUE (lot_id),
  CONSTRAINT "lot_details_lot_id_fkey" FOREIGN KEY (lot_id) REFERENCES lots(id) ON DELETE CASCADE
);
ALTER TABLE "lot_details" ENABLE ROW LEVEL SECURITY;

-- ─── lot_tenants ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "lot_tenants" (
  "id"                uuid NOT NULL DEFAULT gen_random_uuid(),
  "lot_id"            uuid NOT NULL,
  "tenant_number"     integer NOT NULL DEFAULT 1,
  "is_owner_occupier" boolean NOT NULL DEFAULT false,
  "is_formal_tenant"  boolean NOT NULL DEFAULT false,
  "date_received"     date,
  "delivery_by"       text NOT NULL DEFAULT 'EMAIL'::text,
  "salutation"        text,
  "name"              text,
  "contact_name"      text,
  "mobile"            text,
  "email"             text,
  "lease_start"       date,
  "lease_expiry"      date,
  "notes"             text,
  "created_at"        timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"        timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "lot_tenants_pkey" PRIMARY KEY (id),
  CONSTRAINT "lot_tenants_lot_id_tenant_number_key" UNIQUE (lot_id, tenant_number),
  CONSTRAINT "lot_tenants_lot_id_fkey" FOREIGN KEY (lot_id) REFERENCES lots(id) ON DELETE CASCADE
);
ALTER TABLE "lot_tenants" ENABLE ROW LEVEL SECURITY;

-- ─── lot_delivery_preferences ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "lot_delivery_preferences" (
  "id"                uuid NOT NULL DEFAULT gen_random_uuid(),
  "lot_id"            uuid NOT NULL,
  "category"          text NOT NULL,
  "delivery_method"   text NOT NULL DEFAULT 'EMAIL'::text,
  "recipient_type"    text NOT NULL DEFAULT 'OWNER'::text,
  "recipient_name"    text,
  "recipient_email"   text,
  "recipient_address" text,
  "recipient_suburb"  text,
  "recipient_state"   text,
  "recipient_postcode" text,
  "created_at"        timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"        timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "lot_delivery_preferences_pkey" PRIMARY KEY (id),
  CONSTRAINT "lot_delivery_preferences_lot_id_category_key" UNIQUE (lot_id, category),
  CONSTRAINT "lot_delivery_preferences_lot_id_fkey" FOREIGN KEY (lot_id) REFERENCES lots(id) ON DELETE CASCADE
);
ALTER TABLE "lot_delivery_preferences" ENABLE ROW LEVEL SECURITY;

-- ─── lot_debt_collections ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "lot_debt_collections" (
  "id"                       uuid NOT NULL DEFAULT gen_random_uuid(),
  "lot_id"                   uuid NOT NULL,
  "stage"                    text NOT NULL DEFAULT 'NONE'::text,
  "notes"                    text,
  "exclude_from_collection"  boolean NOT NULL DEFAULT false,
  "has_payment_plan"         boolean NOT NULL DEFAULT false,
  "building_debt_collection" boolean NOT NULL DEFAULT false,
  "repayment_plan"           boolean NOT NULL DEFAULT false,
  "legal_action"             boolean NOT NULL DEFAULT false,
  "created_at"               timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"               timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "lot_debt_collections_pkey" PRIMARY KEY (id),
  CONSTRAINT "lot_debt_collections_lot_id_key" UNIQUE (lot_id),
  CONSTRAINT "lot_debt_collections_lot_id_fkey" FOREIGN KEY (lot_id) REFERENCES lots(id) ON DELETE CASCADE
);
ALTER TABLE "lot_debt_collections" ENABLE ROW LEVEL SECURITY;

-- ─── lot_powers_of_attorney ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "lot_powers_of_attorney" (
  "id"               uuid NOT NULL DEFAULT gen_random_uuid(),
  "lot_id"           uuid NOT NULL,
  "attorney_name"    text NOT NULL,
  "attorney_email"   text,
  "attorney_phone"   text,
  "attorney_address" text,
  "start_date"       date,
  "end_date"         date,
  "is_active"        boolean NOT NULL DEFAULT true,
  "notes"            text,
  "created_at"       timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"       timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "lot_powers_of_attorney_pkey" PRIMARY KEY (id),
  CONSTRAINT "lot_powers_of_attorney_lot_id_fkey" FOREIGN KEY (lot_id) REFERENCES lots(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS lot_powers_of_attorney_lot_id_is_active_idx ON public.lot_powers_of_attorney USING btree (lot_id, is_active);
ALTER TABLE "lot_powers_of_attorney" ENABLE ROW LEVEL SECURITY;

-- ─── lot_proxies ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "lot_proxies" (
  "id"            uuid NOT NULL DEFAULT gen_random_uuid(),
  "lot_id"        uuid NOT NULL,
  "proxy_name"    text NOT NULL,
  "proxy_email"   text,
  "proxy_phone"   text,
  "meeting_date"  date,
  "meeting_title" text,
  "is_active"     boolean NOT NULL DEFAULT true,
  "notes"         text,
  "created_at"    timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"    timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "lot_proxies_pkey" PRIMARY KEY (id),
  CONSTRAINT "lot_proxies_lot_id_fkey" FOREIGN KEY (lot_id) REFERENCES lots(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS lot_proxies_lot_id_is_active_idx ON public.lot_proxies USING btree (lot_id, is_active);
ALTER TABLE "lot_proxies" ENABLE ROW LEVEL SECURITY;
