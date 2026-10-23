-- Security stage S6 (audit log), finding SEC-016.
--
-- activity_logs needs a building, can be changed or deleted, and records no
-- outcome or request context, so it cannot serve as a security record. This
-- adds a separate, append-only security audit log.
--
-- security_audit_events
--   * Written only by the app's database connection. No Data API role
--     (anon, authenticated, service_role) has access, and RLS is on with no
--     policies.
--   * Append-only: a trigger refuses every UPDATE and TRUNCATE, and every
--     DELETE except by the retention job, which removes only rows older than
--     7 years (approved retention, 23 Oct) and records how far it removed.
--   * Hash chain: on insert the database numbers the row (seq), stamps the
--     time, and stores the hash of the previous row with a hash of this one.
--     Rows are numbered under a lock, so concurrent inserts cannot fork it.
--   * Nothing secret is stored: no passwords, tokens, codes, bank numbers or
--     request bodies (the app filters metadata to an allow-list too).
--
-- security_audit_checks (append-only)
--   * Each check records the head of the chain (last seq and its hash). The
--     next check requires that head to be unchanged, so rows removed from
--     the end, or rewritten, after a check are detected. Rows removed from
--     the start are detected against the retention watermark.
--   * pg_cron runs an incremental check hourly and a full check weekly (see
--     20261023_security_audit_schedule.sql).
--
-- Limitation (see the security register): the database owner role used by
-- the app can disable triggers and rewrite the table and these functions.
-- The chain detects changes by anything less privileged, and changes made
-- before the next hourly check by anything that does not also rewrite the
-- checks. Anchoring the head outside the database (a daily email to a
-- security inbox) is planned once email is set up.
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
REVOKE ALL ON public.security_audit_events FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.security_audit_checks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  check_seq     bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  -- Set by a trigger, so a check cannot be back- or forward-dated.
  checked_at    timestamptz NOT NULL DEFAULT now(),
  full_check    boolean NOT NULL DEFAULT false,
  ok            boolean NOT NULL,
  rows_checked  bigint NOT NULL,
  first_bad_seq bigint,
  head_seq      bigint,
  head_hash     text,
  problem       text
);
CREATE INDEX IF NOT EXISTS security_audit_checks_time_idx ON public.security_audit_checks (checked_at DESC);
ALTER TABLE public.security_audit_checks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.security_audit_checks FROM PUBLIC, anon, authenticated, service_role;

-- How far retention has removed events: the first remaining row must follow on.
CREATE TABLE IF NOT EXISTS public.security_audit_purges (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purged_at           timestamptz NOT NULL DEFAULT now(),
  purged_through_seq  bigint NOT NULL,
  purged_through_hash text NOT NULL,
  rows_removed        bigint NOT NULL
);
ALTER TABLE public.security_audit_purges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.security_audit_purges FROM PUBLIC, anon, authenticated, service_role;

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
REVOKE EXECUTE ON FUNCTION public.security_audit_row_hash(public.security_audit_events) FROM PUBLIC, anon, authenticated, service_role;

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
  IF last_seq IS NULL THEN
    -- Empty after retention: continue from the watermark.
    SELECT purged_through_seq, purged_through_hash INTO last_seq, last_hash
    FROM public.security_audit_purges ORDER BY purged_through_seq DESC LIMIT 1;
  END IF;
  NEW.seq := coalesce(last_seq, 0) + 1;
  NEW.occurred_at := clock_timestamp();
  NEW.metadata := coalesce(NEW.metadata, '{}'::jsonb);
  NEW.prev_hash := coalesce(last_hash, repeat('0', 64));
  NEW.row_hash := public.security_audit_row_hash(NEW);
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.security_audit_chain() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS security_audit_events_chain ON public.security_audit_events;
CREATE TRIGGER security_audit_events_chain
  BEFORE INSERT ON public.security_audit_events
  FOR EACH ROW EXECUTE FUNCTION public.security_audit_chain();

-- Append-only, for all three tables. Retention may delete events older than
-- 7 years and checks older than 1 year; the purge record is never removed.
CREATE OR REPLACE FUNCTION public.security_audit_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('strataverze.audit_purge', true) = 'on' THEN
    IF TG_TABLE_NAME = 'security_audit_events' AND OLD.occurred_at < now() - interval '7 years' THEN
      RETURN OLD;
    END IF;
    IF TG_TABLE_NAME = 'security_audit_checks' AND OLD.checked_at < now() - interval '1 year' THEN
      RETURN OLD;
    END IF;
  END IF;
  RAISE EXCEPTION 'StrataVerze: the security audit log cannot be changed or deleted (% on %)', TG_OP, TG_TABLE_NAME
    USING ERRCODE = '42501';
END;
$$;
REVOKE EXECUTE ON FUNCTION public.security_audit_append_only() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS security_audit_events_append_only ON public.security_audit_events;
CREATE TRIGGER security_audit_events_append_only
  BEFORE UPDATE OR DELETE ON public.security_audit_events
  FOR EACH ROW EXECUTE FUNCTION public.security_audit_append_only();
DROP TRIGGER IF EXISTS security_audit_events_no_truncate ON public.security_audit_events;
CREATE TRIGGER security_audit_events_no_truncate
  BEFORE TRUNCATE ON public.security_audit_events
  FOR EACH STATEMENT EXECUTE FUNCTION public.security_audit_append_only();

DROP TRIGGER IF EXISTS security_audit_checks_append_only ON public.security_audit_checks;
CREATE TRIGGER security_audit_checks_append_only
  BEFORE UPDATE OR DELETE ON public.security_audit_checks
  FOR EACH ROW EXECUTE FUNCTION public.security_audit_append_only();
DROP TRIGGER IF EXISTS security_audit_checks_no_truncate ON public.security_audit_checks;
CREATE TRIGGER security_audit_checks_no_truncate
  BEFORE TRUNCATE ON public.security_audit_checks
  FOR EACH STATEMENT EXECUTE FUNCTION public.security_audit_append_only();

DROP TRIGGER IF EXISTS security_audit_purges_append_only ON public.security_audit_purges;
CREATE TRIGGER security_audit_purges_append_only
  BEFORE UPDATE OR DELETE ON public.security_audit_purges
  FOR EACH ROW EXECUTE FUNCTION public.security_audit_append_only();
DROP TRIGGER IF EXISTS security_audit_purges_no_truncate ON public.security_audit_purges;
CREATE TRIGGER security_audit_purges_no_truncate
  BEFORE TRUNCATE ON public.security_audit_purges
  FOR EACH STATEMENT EXECUTE FUNCTION public.security_audit_append_only();

-- A check's time is the database's, not the caller's.
CREATE OR REPLACE FUNCTION public.security_audit_check_stamp()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.checked_at := clock_timestamp();
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.security_audit_check_stamp() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS security_audit_checks_stamp ON public.security_audit_checks;
CREATE TRIGGER security_audit_checks_stamp
  BEFORE INSERT ON public.security_audit_checks
  FOR EACH ROW EXECUTE FUNCTION public.security_audit_check_stamp();

-- Check the chain.
--   full = false: from the head recorded by the last good check (cheap).
--   full = true:  every row, from the start or the retention watermark.
-- Either way the last good check's head must still be there, unchanged.
DROP FUNCTION IF EXISTS public.verify_security_audit_chain();
CREATE OR REPLACE FUNCTION public.verify_security_audit_chain(full_check boolean DEFAULT false)
RETURNS TABLE (ok boolean, rows_checked bigint, first_bad_seq bigint, head_seq bigint, head_hash text, problem text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  e public.security_audit_events;
  anchor_seq bigint;
  anchor_hash text;
  wm_seq bigint;
  wm_hash text;
  start_seq bigint;
  expected_prev text;
  expected_seq bigint;
  first_row boolean := true;
  n bigint := 0;
  found_hash text;
BEGIN
  SELECT c.head_seq, c.head_hash INTO anchor_seq, anchor_hash
  FROM public.security_audit_checks c
  WHERE c.ok AND c.head_seq IS NOT NULL
  ORDER BY c.check_seq DESC LIMIT 1;
  SELECT p.purged_through_seq, p.purged_through_hash INTO wm_seq, wm_hash
  FROM public.security_audit_purges p ORDER BY p.purged_through_seq DESC LIMIT 1;

  -- The last good check's head must still be present and unchanged (unless
  -- retention has since removed it).
  IF anchor_seq IS NOT NULL AND (wm_seq IS NULL OR anchor_seq > wm_seq) THEN
    SELECT s.row_hash INTO found_hash FROM public.security_audit_events s WHERE s.seq = anchor_seq;
    IF found_hash IS DISTINCT FROM anchor_hash THEN
      ok := false; rows_checked := 0; first_bad_seq := anchor_seq; head_seq := NULL; head_hash := NULL;
      problem := CASE WHEN found_hash IS NULL THEN 'events after the last check are missing' ELSE 'an event already checked has changed' END;
      RETURN NEXT; RETURN;
    END IF;
  END IF;

  IF full_check OR anchor_seq IS NULL OR (wm_seq IS NOT NULL AND anchor_seq <= wm_seq) THEN
    start_seq := NULL;  -- from the first row
  ELSE
    start_seq := anchor_seq;
    expected_prev := NULL;
  END IF;

  FOR e IN
    SELECT * FROM public.security_audit_events s
    WHERE start_seq IS NULL OR s.seq >= start_seq
    ORDER BY s.seq
  LOOP
    n := n + 1;
    IF first_row AND start_seq IS NULL THEN
      -- The very first row must start the chain, or follow the watermark.
      IF NOT (
        (wm_seq IS NULL AND e.seq = 1 AND e.prev_hash = repeat('0', 64))
        OR (wm_seq IS NOT NULL AND e.seq = wm_seq + 1 AND e.prev_hash = wm_hash)
      ) THEN
        ok := false; rows_checked := n; first_bad_seq := e.seq; head_seq := NULL; head_hash := NULL;
        problem := 'events at the start of the log are missing';
        RETURN NEXT; RETURN;
      END IF;
    ELSIF NOT first_row AND (e.prev_hash <> expected_prev OR e.seq <> expected_seq) THEN
      ok := false; rows_checked := n; first_bad_seq := e.seq; head_seq := NULL; head_hash := NULL;
      problem := 'the chain is broken (an event was removed, changed or reordered)';
      RETURN NEXT; RETURN;
    END IF;
    IF e.row_hash <> public.security_audit_row_hash(e) THEN
      ok := false; rows_checked := n; first_bad_seq := e.seq; head_seq := NULL; head_hash := NULL;
      problem := 'an event has been changed';
      RETURN NEXT; RETURN;
    END IF;
    first_row := false;
    expected_prev := e.row_hash;
    expected_seq := e.seq + 1;
    head_seq := e.seq;
    head_hash := e.row_hash;
  END LOOP;

  IF n = 0 AND anchor_seq IS NOT NULL AND (wm_seq IS NULL OR anchor_seq > wm_seq) THEN
    ok := false; rows_checked := 0; first_bad_seq := anchor_seq; head_seq := NULL; head_hash := NULL;
    problem := 'events after the last check are missing';
    RETURN NEXT; RETURN;
  END IF;
  ok := true; rows_checked := n; first_bad_seq := NULL; problem := NULL;
  head_seq := coalesce(head_seq, anchor_seq);
  head_hash := coalesce(head_hash, anchor_hash);
  RETURN NEXT;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.verify_security_audit_chain(boolean) FROM PUBLIC, anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.run_security_audit_check();
CREATE OR REPLACE FUNCTION public.run_security_audit_check(full_check boolean DEFAULT false)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  INSERT INTO public.security_audit_checks (full_check, ok, rows_checked, first_bad_seq, head_seq, head_hash, problem)
  SELECT full_check, v.ok, v.rows_checked, v.first_bad_seq, v.head_seq, v.head_hash, v.problem
  FROM public.verify_security_audit_chain(full_check) v;
$$;
REVOKE EXECUTE ON FUNCTION public.run_security_audit_check(boolean) FROM PUBLIC, anon, authenticated, service_role;

-- Retention: remove events older than 7 years (recording the watermark
-- first) and checks older than 1 year.
CREATE OR REPLACE FUNCTION public.purge_security_audit_events()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  removed bigint;
  last_seq bigint;
  last_hash text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('strataverze.security_audit_chain'));
  SELECT seq, row_hash INTO last_seq, last_hash
  FROM public.security_audit_events
  WHERE occurred_at < now() - interval '7 years'
  ORDER BY seq DESC LIMIT 1;
  IF last_seq IS NULL THEN
    removed := 0;
  ELSE
    PERFORM set_config('strataverze.audit_purge', 'on', true);
    DELETE FROM public.security_audit_events WHERE seq <= last_seq;
    GET DIAGNOSTICS removed = ROW_COUNT;
    INSERT INTO public.security_audit_purges (purged_through_seq, purged_through_hash, rows_removed)
    VALUES (last_seq, last_hash, removed);
  END IF;
  PERFORM set_config('strataverze.audit_purge', 'on', true);
  DELETE FROM public.security_audit_checks WHERE checked_at < now() - interval '1 year';
  PERFORM set_config('strataverze.audit_purge', 'off', true);
  RETURN removed;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.purge_security_audit_events() FROM PUBLIC, anon, authenticated, service_role;

-- The S4 and S5 tables are reached only by the app too.
REVOKE ALL ON public.mfa_factor_grants FROM service_role;
REVOKE ALL ON public.app_sessions FROM service_role;
