-- Building vault, trial (24 Oct 2026). Design: "StrataVerze Building Vault:
-- Design and MVP Plan". One vault per building (scheme).
--
-- vaults           one row per building that has opened its vault
-- vault_records    a record (a document) in a vault
-- vault_versions   each version of a record: its SHA-256, size, type and
--                  storage path. Numbered and linked to the version before
--                  it by the database.
-- vault_receipts   each time a version was received. The same file
--                  received twice is one version with two receipts.
-- vault_events     the vault's ledger: every capture, version, receipt,
--                  annotation and export, numbered and hash-chained per
--                  building by the database.
-- vault_checks     each verification run, with the head of the chain it
--                  saw, so events later removed from the end are detected.
--
-- Every table is append-only: a trigger refuses UPDATE, DELETE and
-- TRUNCATE. Times are set by the database (to the millisecond). No Data API
-- role has access (RLS on, no policies); the app reaches them through its
-- own database connection after checking the person's access.
--
-- The event hash (documented for people checking an export, see VERIFY.md
-- in each evidence package) is the SHA-256, as lower-case hex, of these
-- fields joined by a newline character, as UTF-8:
--   prev_hash, scheme_id, seq, occurred_at (YYYY-MM-DDTHH:MM:SS.mmmZ, UTC),
--   event_type, record_id, version_id, content_hash, actor_profile_id,
--   details
-- with an empty string for a missing value. The first event's prev_hash is
-- 64 zeros.
--
-- Limitation, as for the security audit log: the database owner role the
-- app uses can disable triggers. The chain and the recorded checks detect
-- changes by anything less privileged, and the evidence package lets a
-- reader check a copy independently. Off-platform signed checkpoints are
-- planned after the trial.
--
-- Additive and idempotent. Applied by hand through the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS public.vaults (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- RESTRICT: a building with a vault cannot be deleted by accident.
  scheme_id  uuid NOT NULL UNIQUE REFERENCES public.schemes(id) ON DELETE RESTRICT,
  opened_by  uuid NOT NULL REFERENCES public.profiles(id),
  opened_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.vault_records (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vault_id      uuid NOT NULL REFERENCES public.vaults(id) ON DELETE RESTRICT,
  scheme_id     uuid NOT NULL,
  record_type   text NOT NULL CHECK (record_type IN (
                  'LEVY_NOTICE', 'REMITTANCE_ADVICE', 'COMMITTEE_PACK', 'STATUTORY_PACK',
                  'MEETING_NOTICE', 'MINUTES', 'CORRESPONDENCE', 'CONTRACT', 'INSURANCE',
                  'REPORT', 'FINANCIAL', 'PLAN_OR_BYLAW', 'OTHER')),
  title         text NOT NULL CHECK (length(title) BETWEEN 1 AND 300),
  -- UPLOAD: added by a person. STRATAVERZE: created by StrataVerze itself.
  source        text NOT NULL CHECK (source IN ('UPLOAD', 'STRATAVERZE')),
  -- For StrataVerze documents, what produced it ("FinancialDocument:<id>").
  source_ref    text CHECK (source_ref IS NULL OR length(source_ref) <= 200),
  -- The date the document says it is from, as reported, and who reported it.
  -- Never treated as checked.
  reported_date date,
  reported_by   text CHECK (reported_by IS NULL OR length(reported_by) <= 200),
  created_by    uuid REFERENCES public.profiles(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scheme_id, source_ref)
);
CREATE INDEX IF NOT EXISTS vault_records_scheme_idx ON public.vault_records (scheme_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.vault_versions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id           uuid NOT NULL REFERENCES public.vault_records(id) ON DELETE RESTRICT,
  -- scheme_id, version_no and previous_version_id are set by the trigger.
  scheme_id           uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
  version_no          integer NOT NULL DEFAULT 0,
  previous_version_id uuid REFERENCES public.vault_versions(id) ON DELETE RESTRICT,
  content_hash        text NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  size_bytes          bigint NOT NULL CHECK (size_bytes > 0),
  mime_type           text NOT NULL CHECK (length(mime_type) <= 100),
  file_name           text NOT NULL CHECK (length(file_name) BETWEEN 1 AND 255),
  storage_path        text NOT NULL UNIQUE,
  captured_by         uuid REFERENCES public.profiles(id),
  captured_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (record_id, version_no),
  -- The same file in the same vault is one version (a second receipt, not a copy).
  UNIQUE (scheme_id, content_hash)
);

CREATE TABLE IF NOT EXISTS public.vault_receipts (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id         uuid NOT NULL REFERENCES public.vault_versions(id) ON DELETE RESTRICT,
  scheme_id          uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
  source             text NOT NULL CHECK (source IN ('UPLOAD', 'STRATAVERZE')),
  source_ref         text CHECK (source_ref IS NULL OR length(source_ref) <= 200),
  original_file_name text NOT NULL CHECK (length(original_file_name) BETWEEN 1 AND 255),
  received_by        uuid REFERENCES public.profiles(id),
  received_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vault_receipts_version_idx ON public.vault_receipts (version_id, received_at);

CREATE TABLE IF NOT EXISTS public.vault_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id        uuid NOT NULL,
  -- seq, occurred_at, prev_hash and row_hash are set by the trigger.
  seq              bigint NOT NULL DEFAULT 0,
  occurred_at      timestamptz NOT NULL DEFAULT now(),
  event_type       text NOT NULL CHECK (event_type ~ '^[a-z][a-z0-9_.]{1,60}$'),
  record_id        uuid REFERENCES public.vault_records(id) ON DELETE RESTRICT,
  version_id       uuid REFERENCES public.vault_versions(id) ON DELETE RESTRICT,
  content_hash     text CHECK (content_hash IS NULL OR content_hash ~ '^[0-9a-f]{64}$'),
  actor_profile_id uuid,
  -- Canonical JSON written by the app (keys sorted). Hashed as written.
  details          text NOT NULL DEFAULT '{}' CHECK (length(details) <= 20000),
  prev_hash        text NOT NULL DEFAULT '',
  row_hash         text NOT NULL DEFAULT '',
  UNIQUE (scheme_id, seq)
);
CREATE INDEX IF NOT EXISTS vault_events_record_idx ON public.vault_events (record_id, seq);

CREATE TABLE IF NOT EXISTS public.vault_checks (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id      uuid NOT NULL,
  checked_at     timestamptz NOT NULL DEFAULT now(),
  checked_by     uuid,
  ok             boolean NOT NULL,
  events_checked integer NOT NULL,
  files_checked  integer NOT NULL,
  head_seq       bigint,
  head_hash      text,
  problem        text CHECK (problem IS NULL OR length(problem) <= 2000)
);
CREATE INDEX IF NOT EXISTS vault_checks_scheme_idx ON public.vault_checks (scheme_id, checked_at DESC);

-- No Data API access.
ALTER TABLE public.vaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vault_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vault_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vault_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vault_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vault_checks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vaults, public.vault_records, public.vault_versions, public.vault_receipts, public.vault_events, public.vault_checks
  FROM PUBLIC, anon, authenticated, service_role;

-- Database time, to the millisecond (what the app and the export print).
CREATE OR REPLACE FUNCTION public.vault_now()
RETURNS timestamptz
LANGUAGE sql
VOLATILE
SET search_path = public, pg_temp
AS $$ SELECT date_trunc('milliseconds', clock_timestamp()) $$;
REVOKE EXECUTE ON FUNCTION public.vault_now() FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.vault_stamp()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_TABLE_NAME = 'vaults' THEN NEW.opened_at := public.vault_now();
  ELSIF TG_TABLE_NAME = 'vault_records' THEN
    NEW.created_at := public.vault_now();
    IF NOT EXISTS (SELECT 1 FROM public.vaults v WHERE v.id = NEW.vault_id AND v.scheme_id = NEW.scheme_id) THEN
      RAISE EXCEPTION 'StrataVerze: the record''s building does not match its vault' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'vault_receipts' THEN
    NEW.received_at := public.vault_now();
    SELECT v.scheme_id INTO NEW.scheme_id FROM public.vault_versions v WHERE v.id = NEW.version_id;
  ELSIF TG_TABLE_NAME = 'vault_checks' THEN NEW.checked_at := public.vault_now();
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.vault_stamp() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS vaults_stamp ON public.vaults;
CREATE TRIGGER vaults_stamp BEFORE INSERT ON public.vaults FOR EACH ROW EXECUTE FUNCTION public.vault_stamp();
DROP TRIGGER IF EXISTS vault_records_stamp ON public.vault_records;
CREATE TRIGGER vault_records_stamp BEFORE INSERT ON public.vault_records FOR EACH ROW EXECUTE FUNCTION public.vault_stamp();
DROP TRIGGER IF EXISTS vault_receipts_stamp ON public.vault_receipts;
CREATE TRIGGER vault_receipts_stamp BEFORE INSERT ON public.vault_receipts FOR EACH ROW EXECUTE FUNCTION public.vault_stamp();
DROP TRIGGER IF EXISTS vault_checks_stamp ON public.vault_checks;
CREATE TRIGGER vault_checks_stamp BEFORE INSERT ON public.vault_checks FOR EACH ROW EXECUTE FUNCTION public.vault_stamp();

-- Number each new version of a record and link it to the one before.
CREATE OR REPLACE FUNCTION public.vault_version_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  rec_scheme uuid;
  last_no integer;
  last_id uuid;
BEGIN
  -- Lock the record so two versions added at once cannot share a number.
  SELECT r.scheme_id INTO rec_scheme FROM public.vault_records r WHERE r.id = NEW.record_id FOR UPDATE;
  IF rec_scheme IS NULL THEN
    RAISE EXCEPTION 'StrataVerze: vault record not found' USING ERRCODE = '23503';
  END IF;
  SELECT v.version_no, v.id INTO last_no, last_id
  FROM public.vault_versions v WHERE v.record_id = NEW.record_id ORDER BY v.version_no DESC LIMIT 1;
  NEW.scheme_id := rec_scheme;
  NEW.version_no := coalesce(last_no, 0) + 1;
  NEW.previous_version_id := last_id;
  NEW.captured_at := public.vault_now();
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.vault_version_number() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS vault_versions_number ON public.vault_versions;
CREATE TRIGGER vault_versions_number BEFORE INSERT ON public.vault_versions FOR EACH ROW EXECUTE FUNCTION public.vault_version_number();

-- The event hash. See the header for the field order.
CREATE OR REPLACE FUNCTION public.vault_event_hash(e public.vault_events)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT encode(sha256(convert_to(concat_ws(E'\n',
    e.prev_hash,
    e.scheme_id::text,
    e.seq::text,
    to_char(e.occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    e.event_type,
    coalesce(e.record_id::text, ''),
    coalesce(e.version_id::text, ''),
    coalesce(e.content_hash, ''),
    coalesce(e.actor_profile_id::text, ''),
    e.details
  ), 'UTF8')), 'hex');
$$;
REVOKE EXECUTE ON FUNCTION public.vault_event_hash(public.vault_events) FROM PUBLIC, anon, authenticated, service_role;

-- Number, stamp and chain each new event, per building.
CREATE OR REPLACE FUNCTION public.vault_event_chain()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  last_seq bigint;
  last_hash text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.vaults v WHERE v.scheme_id = NEW.scheme_id) THEN
    RAISE EXCEPTION 'StrataVerze: this building has no vault' USING ERRCODE = '23503';
  END IF;
  IF NEW.record_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.vault_records r WHERE r.id = NEW.record_id AND r.scheme_id = NEW.scheme_id
  ) THEN
    RAISE EXCEPTION 'StrataVerze: the event''s record is in another building' USING ERRCODE = '23514';
  END IF;
  IF NEW.version_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.vault_versions v WHERE v.id = NEW.version_id AND v.scheme_id = NEW.scheme_id
  ) THEN
    RAISE EXCEPTION 'StrataVerze: the event''s version is in another building' USING ERRCODE = '23514';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('strataverze.vault_chain:' || NEW.scheme_id::text));
  SELECT e.seq, e.row_hash INTO last_seq, last_hash
  FROM public.vault_events e WHERE e.scheme_id = NEW.scheme_id ORDER BY e.seq DESC LIMIT 1;
  NEW.seq := coalesce(last_seq, 0) + 1;
  NEW.occurred_at := public.vault_now();
  NEW.details := coalesce(NEW.details, '{}');
  NEW.prev_hash := coalesce(last_hash, repeat('0', 64));
  NEW.row_hash := public.vault_event_hash(NEW);
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.vault_event_chain() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS vault_events_chain ON public.vault_events;
CREATE TRIGGER vault_events_chain BEFORE INSERT ON public.vault_events FOR EACH ROW EXECUTE FUNCTION public.vault_event_chain();

-- Append-only, for every vault table.
CREATE OR REPLACE FUNCTION public.vault_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'StrataVerze: the building vault cannot be changed or deleted (% on %)', TG_OP, TG_TABLE_NAME
    USING ERRCODE = '42501';
END;
$$;
REVOKE EXECUTE ON FUNCTION public.vault_append_only() FROM PUBLIC, anon, authenticated, service_role;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['vaults', 'vault_records', 'vault_versions', 'vault_receipts', 'vault_events', 'vault_checks'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_append_only', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.vault_append_only()', t || '_append_only', t);
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_no_truncate', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.vault_append_only()', t || '_no_truncate', t);
  END LOOP;
END $$;
