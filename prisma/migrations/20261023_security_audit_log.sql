-- Security stage S6 (audit log), finding SEC-016.
--
-- activity_logs needs a building, can be changed or deleted, and records no
-- outcome or request context, so it cannot serve as a security record. This
-- adds a separate, append-only security audit log.
--
-- security_audit_events
--   * Written only by the app's database connection. The Data API roles have
--     no access (default privileges, and RLS with no policies).
--   * Append-only: a trigger refuses every UPDATE and TRUNCATE, and every
--     DELETE except by the retention job, which removes only rows older than
--     7 years (approved retention, 23 Oct).
--   * Hash chain: on insert the database numbers the row (seq), stamps the
--     time, and stores the hash of the previous row with a hash of this one.
--     Changing, removing or reordering any row breaks the chain from that
--     point. Rows are numbered under a lock, so concurrent inserts cannot
--     fork the chain.
--   * Nothing secret is stored: no passwords, tokens, codes, bank numbers or
--     request bodies (the app filters metadata to an allow-list too).
--
-- security_audit_checks
--   * The result of each chain check. verify_security_audit_chain() walks
--     the whole log. run_security_audit_check() records the result, and is
--     run daily by pg_cron (see the end of this file).
--
-- Idempotent. Applied by hand through the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS public.security_audit_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- seq, occurred_at, prev_hash and row_hash are always set by the trigger;
  -- the defaults only let an insert leave them out.
  seq              bigint NOT NULL DEFAULT 0 UNIQUE,
  occurred_at      timestamptz NOT NULL DEFAULT now(),
  actor_profile_id uuid,
  actor_auth_id    uuid,
  actor_role       text,
  scheme_id        uuid,
  action           text NOT NULL CHECK (action ~ '^[a-z][a-z0-9_.]{1,80}$'),
  resource_type    text,
  resource_id      text,
  outcome          text NOT NULL CHECK (outcome IN ('allowed', 'denied', 'failed')),
  reason           text CHECK (reason IS NULL OR length(reason) <= 500),
  ip_hash          text,
  user_agent       text CHECK (user_agent IS NULL OR length(user_agent) <= 200),
  request_id       text CHECK (request_id IS NULL OR length(request_id) <= 200),
  metadata         jsonb NOT NULL DEFAULT '{}'::jsonb,
  prev_hash        text NOT NULL DEFAULT '',
  row_hash         text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS security_audit_events_time_idx ON public.security_audit_events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS security_audit_events_scheme_idx ON public.security_audit_events (scheme_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS security_audit_events_actor_idx ON public.security_audit_events (actor_profile_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS security_audit_events_action_idx ON public.security_audit_events (action, occurred_at DESC);
ALTER TABLE public.security_audit_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.security_audit_events FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.security_audit_checks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checked_at    timestamptz NOT NULL DEFAULT now(),
  ok            boolean NOT NULL,
  rows_checked  bigint NOT NULL,
  first_bad_seq bigint
);
CREATE INDEX IF NOT EXISTS security_audit_checks_time_idx ON public.security_audit_checks (checked_at DESC);
ALTER TABLE public.security_audit_checks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.security_audit_checks FROM PUBLIC, anon, authenticated;

-- The hash of one row: the previous hash, then the row's fields as jsonb
-- text (jsonb prints keys in a fixed order, so this is deterministic).
CREATE OR REPLACE FUNCTION public.security_audit_row_hash(e public.security_audit_events)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT encode(sha256(convert_to(
    e.prev_hash || '|' || jsonb_build_object(
      'id', e.id, 'seq', e.seq, 'occurred_at', to_char(e.occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
      'actor_profile_id', e.actor_profile_id, 'actor_auth_id', e.actor_auth_id, 'actor_role', e.actor_role,
      'scheme_id', e.scheme_id, 'action', e.action, 'resource_type', e.resource_type, 'resource_id', e.resource_id,
      'outcome', e.outcome, 'reason', e.reason, 'ip_hash', e.ip_hash, 'user_agent', e.user_agent,
      'request_id', e.request_id, 'metadata', e.metadata
    )::text, 'UTF8')), 'hex');
$$;
REVOKE EXECUTE ON FUNCTION public.security_audit_row_hash(public.security_audit_events) FROM PUBLIC, anon, authenticated;

-- Number, stamp and chain each new row.
CREATE OR REPLACE FUNCTION public.security_audit_chain()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  last_seq bigint;
  last_hash text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('strataverze.security_audit_chain'));
  SELECT seq, row_hash INTO last_seq, last_hash
  FROM public.security_audit_events ORDER BY seq DESC LIMIT 1;
  NEW.seq := coalesce(last_seq, 0) + 1;
  NEW.occurred_at := clock_timestamp();
  NEW.metadata := coalesce(NEW.metadata, '{}'::jsonb);
  NEW.prev_hash := coalesce(last_hash, repeat('0', 64));
  NEW.row_hash := public.security_audit_row_hash(NEW);
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.security_audit_chain() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS security_audit_events_chain ON public.security_audit_events;
CREATE TRIGGER security_audit_events_chain
  BEFORE INSERT ON public.security_audit_events
  FOR EACH ROW EXECUTE FUNCTION public.security_audit_chain();

-- Append-only.
CREATE OR REPLACE FUNCTION public.security_audit_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE'
     AND current_setting('strataverze.audit_purge', true) = 'on'
     AND OLD.occurred_at < now() - interval '7 years' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'StrataVerze: the security audit log cannot be changed or deleted (%)', TG_OP
    USING ERRCODE = '42501';
END;
$$;
REVOKE EXECUTE ON FUNCTION public.security_audit_append_only() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS security_audit_events_append_only ON public.security_audit_events;
CREATE TRIGGER security_audit_events_append_only
  BEFORE UPDATE OR DELETE ON public.security_audit_events
  FOR EACH ROW EXECUTE FUNCTION public.security_audit_append_only();

DROP TRIGGER IF EXISTS security_audit_events_no_truncate ON public.security_audit_events;
CREATE TRIGGER security_audit_events_no_truncate
  BEFORE TRUNCATE ON public.security_audit_events
  FOR EACH STATEMENT EXECUTE FUNCTION public.security_audit_append_only();

-- Walk the chain. The first remaining row's prev_hash is taken as given
-- (older rows may have been removed by retention).
CREATE OR REPLACE FUNCTION public.verify_security_audit_chain()
RETURNS TABLE (ok boolean, rows_checked bigint, first_bad_seq bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  e public.security_audit_events;
  expected_prev text := NULL;
  expected_seq bigint := NULL;
  n bigint := 0;
BEGIN
  FOR e IN SELECT * FROM public.security_audit_events ORDER BY seq LOOP
    n := n + 1;
    IF (expected_prev IS NOT NULL AND (e.prev_hash <> expected_prev OR e.seq <> expected_seq))
       OR e.row_hash <> public.security_audit_row_hash(e) THEN
      ok := false; rows_checked := n; first_bad_seq := e.seq;
      RETURN NEXT;
      RETURN;
    END IF;
    expected_prev := e.row_hash;
    expected_seq := e.seq + 1;
  END LOOP;
  ok := true; rows_checked := n; first_bad_seq := NULL;
  RETURN NEXT;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.verify_security_audit_chain() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.run_security_audit_check()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  INSERT INTO public.security_audit_checks (ok, rows_checked, first_bad_seq)
  SELECT ok, rows_checked, first_bad_seq FROM public.verify_security_audit_chain();
$$;
REVOKE EXECUTE ON FUNCTION public.run_security_audit_check() FROM PUBLIC, anon, authenticated;

-- Retention: remove events older than 7 years, and checks older than 1 year.
CREATE OR REPLACE FUNCTION public.purge_security_audit_events()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  removed bigint;
BEGIN
  PERFORM set_config('strataverze.audit_purge', 'on', true);
  DELETE FROM public.security_audit_events WHERE occurred_at < now() - interval '7 years';
  GET DIAGNOSTICS removed = ROW_COUNT;
  PERFORM set_config('strataverze.audit_purge', 'off', true);
  DELETE FROM public.security_audit_checks WHERE checked_at < now() - interval '1 year';
  RETURN removed;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.purge_security_audit_events() FROM PUBLIC, anon, authenticated;

-- Events recorded by the database itself, so they are captured however the
-- change was made (the app, or a direct call to the Supabase Auth API).

-- A password change (S5 ends every session; S6 records it).
CREATE OR REPLACE FUNCTION public.end_sessions_on_password_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.encrypted_password IS DISTINCT FROM OLD.encrypted_password AND OLD.encrypted_password IS NOT NULL
     AND OLD.encrypted_password <> '' THEN
    UPDATE public.profiles SET sessions_revoked_at = now() WHERE auth_id = NEW.id;
    INSERT INTO public.security_audit_events (action, outcome, actor_auth_id, actor_profile_id, resource_type, resource_id, reason)
    SELECT 'auth.password_changed', 'allowed', NEW.id, p.id, 'profile', p.id::text, 'every session ended'
    FROM (SELECT NEW.id AS auth_id) a LEFT JOIN public.profiles p ON p.auth_id = a.auth_id;
  END IF;
  RETURN NEW;
END;
$$;

-- Authenticator changes (the S4 guard; S6 records what it allowed).
CREATE OR REPLACE FUNCTION public.mfa_factor_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  grant_id uuid;
  verified_count integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF EXISTS (
      SELECT 1 FROM auth.mfa_factors f
      WHERE f.user_id = NEW.user_id AND f.status::text = 'verified'
    ) THEN
      SELECT g.id INTO grant_id
      FROM public.mfa_factor_grants g
      WHERE g.auth_user_id = NEW.user_id
        AND g.action = 'enrol'
        AND g.used_at IS NULL
        AND g.created_at > now() - interval '10 minutes'
      ORDER BY g.created_at DESC
      LIMIT 1
      FOR UPDATE;
      IF grant_id IS NULL THEN
        RAISE EXCEPTION 'StrataVerze: adding another authenticator must be done in the app after a recent check'
          USING ERRCODE = '42501';
      END IF;
      UPDATE public.mfa_factor_grants SET used_at = now() WHERE id = grant_id;
    END IF;
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status::text = 'verified' AND OLD.status::text IS DISTINCT FROM 'verified' THEN
      SELECT count(*) INTO verified_count
      FROM auth.mfa_factors f
      WHERE f.user_id = NEW.user_id AND f.status::text = 'verified' AND f.id <> NEW.id;
      IF verified_count >= 2 THEN
        RAISE EXCEPTION 'StrataVerze: at most two authenticators are allowed'
          USING ERRCODE = '42501';
      END IF;
      INSERT INTO public.security_audit_events (action, outcome, actor_auth_id, resource_type, resource_id, metadata)
      VALUES ('mfa.factor_verified', 'allowed', NEW.user_id, 'mfa_factor', NEW.id::text,
              jsonb_build_object('factorType', NEW.factor_type::text, 'source', 'database'));
    END IF;
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.status::text = 'verified'
       AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = OLD.user_id) THEN
      SELECT g.id INTO grant_id
      FROM public.mfa_factor_grants g
      WHERE g.auth_user_id = OLD.user_id
        AND g.action = 'remove'
        AND g.factor_id = OLD.id
        AND g.used_at IS NULL
        AND g.created_at > now() - interval '10 minutes'
      ORDER BY g.created_at DESC
      LIMIT 1
      FOR UPDATE;
      IF grant_id IS NULL THEN
        RAISE EXCEPTION 'StrataVerze: removing an authenticator must be done in the app after a recent check'
          USING ERRCODE = '42501';
      END IF;
      UPDATE public.mfa_factor_grants SET used_at = now() WHERE id = grant_id;
      INSERT INTO public.security_audit_events (action, outcome, actor_auth_id, resource_type, resource_id, metadata)
      VALUES ('mfa.factor_deleted', 'allowed', OLD.user_id, 'mfa_factor', OLD.id::text,
              jsonb_build_object('factorType', OLD.factor_type::text, 'source', 'database'));
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;
