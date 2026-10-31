-- Rolled-back rehearsal of migration 20261201_owner_change_requests.sql
-- (finding H-1: a committee member's change of owner is held for review).
-- NOT a migration: it changes nothing. Everything runs inside one DO block
-- that always ends with RAISE EXCEPTION, so Postgres rolls all of it back, and
-- the outer BEGIN ... ROLLBACK is a second guard.
--
-- Status: NOT RUN against Supabase. Run it in the Supabase SQL editor only
-- with Matthew Wrigley's approval, OFF-PEAK (it takes row locks on the lots,
-- schemes and documents it touches and a short lock on scheme_memberships for
-- the new key), and ONLY BEFORE the migration is applied: it is the proof that
-- the migration is safe to apply, not a check of an applied database.
-- Every statement is limited to 30 seconds and every lock wait to 5.
--
-- Expected result: an error whose message starts "PROOF ok:" and lists what
-- was checked. Any other error (including "PROOF incomplete" or one starting
-- "STOP") means stop and do not apply.
--
-- The migration's statements are copied here exactly (comments left out) and
-- run twice, to show they are idempotent. Keep them in step with the
-- migration: any change to one is made to the other.
--
-- It needs one existing lot (with its building), one existing profile and one
-- existing membership. For the cascade and same-building checks it makes a
-- test building and test lots by copying an existing building's and lot's
-- row with a new id, plan number and lot number; they are rolled back with
-- everything else. Before anything else it stops ("PROOF incomplete") if
-- schemes, lots or documents has a trigger StrataVerze's migrations did not
-- make (none of ours is on them as of 20261201), as copying or deleting rows
-- there would then run code this rehearsal has not been checked against. The
-- test rows use made-up names and addresses at example.invalid.

BEGIN;

DO $rehearsal$
DECLARE
  v_scheme uuid;
  v_lot uuid;
  v_profile uuid;
  v_doc uuid;
  v_doc2 uuid;
  v_req uuid;
  v_req2 uuid;
  v_tscheme uuid := gen_random_uuid();
  v_tlot uuid := gen_random_uuid();
  v_tlot2 uuid := gen_random_uuid();
  v_tdoc uuid;
  v_otherdoc uuid;
  v_member uuid;
  v_hist uuid;
  -- Triggers StrataVerze's own migrations put on schemes, lots or documents: none as of 20261201.
  v_ours text[] := ARRAY[]::text[];
  v_checks text[] := ARRAY[]::text[];
  v_n int;
  i int;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  PERFORM set_config('statement_timeout', '30s', true);

  -- 0. Nothing unknown runs when rows of schemes, lots or documents are copied or deleted below.
  SELECT count(*) INTO v_n FROM pg_trigger
   WHERE tgrelid IN ('public.schemes'::regclass, 'public.lots'::regclass, 'public.documents'::regclass)
     AND NOT tgisinternal AND NOT (tgname = ANY (v_ours));
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'PROOF incomplete: schemes, lots or documents has % trigger(s) this rehearsal does not know: %', v_n,
      (SELECT string_agg(tgrelid::regclass || '.' || tgname, ', ') FROM pg_trigger
        WHERE tgrelid IN ('public.schemes'::regclass, 'public.lots'::regclass, 'public.documents'::regclass)
          AND NOT tgisinternal AND NOT (tgname = ANY (v_ours)));
  END IF;

  -- ── The migration, exactly as in 20261201_owner_change_requests.sql, run twice (idempotent) ──
  FOR i IN 1..2 LOOP
    CREATE TABLE IF NOT EXISTS public.owner_change_requests (
      id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      scheme_id          uuid NOT NULL,
      lot_id             uuid NOT NULL,
      status             text NOT NULL DEFAULT 'PENDING',
      owner_name         text NOT NULL,
      owner_email        text,
      owner_mobile       text,
      owner_phone        text,
      owner_address      text,
      settlement_date    date NOT NULL,
      invite             boolean NOT NULL DEFAULT false,
      notice_document_id uuid,
      recorded_by        uuid NOT NULL,
      recorded_at        timestamptz NOT NULL DEFAULT now(),
      decided_by         uuid,
      decided_at         timestamptz,
      CONSTRAINT owner_change_requests_scheme_id_fkey FOREIGN KEY (scheme_id) REFERENCES public.schemes(id) ON DELETE CASCADE,
      CONSTRAINT owner_change_requests_lot_id_fkey FOREIGN KEY (lot_id) REFERENCES public.lots(id) ON DELETE CASCADE,
      CONSTRAINT owner_change_requests_notice_document_id_fkey FOREIGN KEY (notice_document_id) REFERENCES public.documents(id) ON DELETE SET NULL,
      CONSTRAINT owner_change_requests_status_check CHECK (status IN ('PENDING', 'CONFIRMED', 'REJECTED')),
      -- Decided exactly when it has a decider and a time.
      CONSTRAINT owner_change_requests_decided_check CHECK (
        (status = 'PENDING') = (decided_at IS NULL) AND (decided_at IS NULL) = (decided_by IS NULL)),
      CONSTRAINT owner_change_requests_owner_name_check CHECK (length(btrim(owner_name)) BETWEEN 1 AND 500),
      CONSTRAINT owner_change_requests_owner_email_check CHECK (
        owner_email IS NULL OR (owner_email = lower(btrim(owner_email)) AND length(owner_email) BETWEEN 3 AND 255)),
      -- An invitation needs an address to go to.
      CONSTRAINT owner_change_requests_invite_check CHECK (NOT invite OR owner_email IS NOT NULL)
    );
    CREATE INDEX IF NOT EXISTS owner_change_requests_scheme_id_status_idx ON public.owner_change_requests (scheme_id, status);
    CREATE INDEX IF NOT EXISTS owner_change_requests_lot_id_idx ON public.owner_change_requests (lot_id);
    CREATE UNIQUE INDEX IF NOT EXISTS owner_change_requests_one_pending_per_lot_idx
      ON public.owner_change_requests (lot_id) WHERE status = 'PENDING';
    ALTER TABLE public.owner_change_requests ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.owner_change_requests FROM anon, authenticated;

    CREATE OR REPLACE FUNCTION public.owner_change_requests_guard()
    RETURNS trigger
    LANGUAGE plpgsql
    SET search_path = public, pg_temp
    AS $$
    BEGIN
      IF NEW.notice_document_id IS NOT NULL
         AND (TG_OP = 'INSERT' OR NEW.notice_document_id IS DISTINCT FROM OLD.notice_document_id)
         AND NOT EXISTS (SELECT 1 FROM public.documents d WHERE d.id = NEW.notice_document_id AND d.scheme_id = NEW.scheme_id) THEN
        RAISE EXCEPTION 'StrataVerze: change of owner request %: the notice of transfer must be a document of the same building', NEW.id
          USING ERRCODE = '23514';
      END IF;
      IF TG_OP = 'INSERT' THEN
        RETURN NEW;
      END IF;
      IF (NEW.id, NEW.scheme_id, NEW.lot_id, NEW.owner_name, NEW.owner_email, NEW.owner_mobile, NEW.owner_phone,
          NEW.owner_address, NEW.settlement_date, NEW.invite, NEW.recorded_by, NEW.recorded_at)
         IS DISTINCT FROM
         (OLD.id, OLD.scheme_id, OLD.lot_id, OLD.owner_name, OLD.owner_email, OLD.owner_mobile, OLD.owner_phone,
          OLD.owner_address, OLD.settlement_date, OLD.invite, OLD.recorded_by, OLD.recorded_at)
         OR (NEW.notice_document_id IS DISTINCT FROM OLD.notice_document_id AND NEW.notice_document_id IS NOT NULL
             AND NOT (OLD.notice_document_id IS NULL AND OLD.status = 'PENDING' AND NEW.status = 'PENDING')) THEN
        RAISE EXCEPTION 'StrataVerze: change of owner request %: what was recorded cannot change', OLD.id USING ERRCODE = '23514';
      END IF;
      IF OLD.status <> 'PENDING'
         AND (NEW.status, NEW.decided_by, NEW.decided_at) IS DISTINCT FROM (OLD.status, OLD.decided_by, OLD.decided_at) THEN
        RAISE EXCEPTION 'StrataVerze: change of owner request % is decided and cannot change', OLD.id USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END;
    $$;
    REVOKE EXECUTE ON FUNCTION public.owner_change_requests_guard() FROM PUBLIC, anon, authenticated, service_role;
    DROP TRIGGER IF EXISTS owner_change_requests_guard ON public.owner_change_requests;
    CREATE TRIGGER owner_change_requests_guard BEFORE INSERT OR UPDATE ON public.owner_change_requests
      FOR EACH ROW EXECUTE FUNCTION public.owner_change_requests_guard();

    CREATE TABLE IF NOT EXISTS public.owner_lot_history (
      id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      scheme_id     uuid NOT NULL,
      lot_id        uuid NOT NULL,
      profile_id    uuid NOT NULL,
      membership_id uuid NOT NULL,
      started_at    timestamptz NOT NULL,
      ended_at      timestamptz NOT NULL,
      recorded_at   timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT owner_lot_history_scheme_id_fkey FOREIGN KEY (scheme_id) REFERENCES public.schemes(id) ON DELETE CASCADE,
      CONSTRAINT owner_lot_history_lot_id_fkey FOREIGN KEY (lot_id) REFERENCES public.lots(id) ON DELETE CASCADE,
      CONSTRAINT owner_lot_history_membership_id_fkey FOREIGN KEY (membership_id) REFERENCES public.scheme_memberships(id) ON DELETE CASCADE,
      CONSTRAINT owner_lot_history_dates_check CHECK (ended_at >= started_at)
    );
    CREATE INDEX IF NOT EXISTS owner_lot_history_scheme_id_lot_id_idx ON public.owner_lot_history (scheme_id, lot_id);
    ALTER TABLE public.owner_lot_history ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.owner_lot_history FROM anon, authenticated;

    CREATE OR REPLACE FUNCTION public.owner_lot_history_append_only()
    RETURNS trigger
    LANGUAGE plpgsql
    SET search_path = public, pg_temp
    AS $$
    BEGIN
      RAISE EXCEPTION 'StrataVerze: owner_lot_history rows are not updated' USING ERRCODE = '23514';
    END;
    $$;
    REVOKE EXECUTE ON FUNCTION public.owner_lot_history_append_only() FROM PUBLIC, anon, authenticated, service_role;
    DROP TRIGGER IF EXISTS owner_lot_history_append_only ON public.owner_lot_history;
    CREATE TRIGGER owner_lot_history_append_only BEFORE UPDATE ON public.owner_lot_history
      FOR EACH ROW EXECUTE FUNCTION public.owner_lot_history_append_only();

  END LOOP;
  v_checks := array_append(v_checks, 'migration runs twice');

  -- Test fixtures: a lot with no change waiting, its building, and a profile.
  SELECT l.id, l.scheme_id INTO v_lot, v_scheme FROM public.lots l
   WHERE NOT EXISTS (SELECT 1 FROM public.owner_change_requests r WHERE r.lot_id = l.id AND r.status = 'PENDING')
   ORDER BY l.id LIMIT 1;
  SELECT id INTO v_profile FROM public.profiles ORDER BY created_at LIMIT 1;
  SELECT id INTO v_member FROM public.scheme_memberships ORDER BY id LIMIT 1;
  IF v_lot IS NULL OR v_profile IS NULL OR v_member IS NULL THEN
    RAISE EXCEPTION 'PROOF incomplete: needs one lot, one profile and one membership to test against';
  END IF;
  -- A second, test building with two lots and a document, copied from existing rows (cascades and same-building checks).
  BEGIN
    INSERT INTO public.schemes
    SELECT (jsonb_populate_record(NULL::public.schemes,
             to_jsonb(s) || jsonb_build_object('id', v_tscheme, 'plan_number', 'REHEARSAL-' || left(v_tscheme::text, 8), 'name', 'Rehearsal building'))).*
      FROM public.schemes s WHERE s.id = v_scheme;
    INSERT INTO public.lots
    SELECT (jsonb_populate_record(NULL::public.lots, to_jsonb(l) || jsonb_build_object('id', v_tlot, 'scheme_id', v_tscheme, 'lot_number', 'R1'))).*
      FROM public.lots l WHERE l.id = v_lot;
    INSERT INTO public.lots
    SELECT (jsonb_populate_record(NULL::public.lots, to_jsonb(l) || jsonb_build_object('id', v_tlot2, 'scheme_id', v_tscheme, 'lot_number', 'R2'))).*
      FROM public.lots l WHERE l.id = v_lot;
    INSERT INTO public.documents (scheme_id, title, category, file_url, file_name, uploaded_by, visibility)
    VALUES (v_tscheme, 'Rehearsal other building notice', 'OTHER', 'rehearsal/other.pdf', 'other.pdf', v_profile, 'MANAGEMENT')
    RETURNING id INTO v_otherdoc;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'PROOF incomplete: could not make a test building, lots and document: %', SQLERRM;
  END;

  -- 1. The table, its 16 columns, RLS on, and no browser access.
  SELECT count(*) INTO v_n FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'owner_change_requests';
  IF v_n <> 16 THEN RAISE EXCEPTION 'STOP: expected 16 columns, found %', v_n; END IF;
  SELECT count(*) INTO v_n FROM pg_class WHERE oid = 'public.owner_change_requests'::regclass AND relrowsecurity;
  IF v_n <> 1 THEN RAISE EXCEPTION 'STOP: RLS is not enabled'; END IF;
  SELECT count(*) INTO v_n FROM pg_policy WHERE polrelid = 'public.owner_change_requests'::regclass;
  IF v_n <> 0 THEN RAISE EXCEPTION 'STOP: expected no policies, found %', v_n; END IF;
  IF has_table_privilege('anon', 'public.owner_change_requests', 'SELECT')
     OR has_table_privilege('authenticated', 'public.owner_change_requests', 'SELECT')
     OR has_table_privilege('authenticated', 'public.owner_change_requests', 'INSERT')
     OR has_table_privilege('authenticated', 'public.owner_change_requests', 'UPDATE') THEN
    RAISE EXCEPTION 'STOP: a browser role can reach owner_change_requests';
  END IF;
  v_checks := array_append(v_checks, 'table, RLS, no browser access');

  -- 2. The keys' delete actions (c = CASCADE, n = SET NULL), the indexes, and the guard trigger (BEFORE UPDATE, row, enabled).
  SELECT count(*) INTO v_n FROM pg_constraint
   WHERE conrelid = 'public.owner_change_requests'::regclass AND contype = 'f'
     AND ((conname = 'owner_change_requests_scheme_id_fkey' AND confrelid = 'public.schemes'::regclass AND confdeltype = 'c')
       OR (conname = 'owner_change_requests_lot_id_fkey' AND confrelid = 'public.lots'::regclass AND confdeltype = 'c')
       OR (conname = 'owner_change_requests_notice_document_id_fkey' AND confrelid = 'public.documents'::regclass AND confdeltype = 'n'));
  IF v_n <> 3 THEN RAISE EXCEPTION 'STOP: expected 3 keys with the right delete actions, found %', v_n; END IF;
  SELECT count(*) INTO v_n FROM pg_constraint WHERE conrelid = 'public.owner_change_requests'::regclass AND contype = 'f';
  IF v_n <> 3 THEN RAISE EXCEPTION 'STOP: expected exactly 3 foreign keys, found %', v_n; END IF;
  SELECT count(*) INTO v_n FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'owner_change_requests'
     AND indexname IN ('owner_change_requests_scheme_id_status_idx', 'owner_change_requests_lot_id_idx', 'owner_change_requests_one_pending_per_lot_idx');
  IF v_n <> 3 THEN RAISE EXCEPTION 'STOP: expected 3 indexes, found %', v_n; END IF;
  -- tgtype: 1 = row, 2 = before, 4 = insert, 8 = delete, 16 = update; tgenabled O = enabled.
  SELECT count(*) INTO v_n FROM pg_trigger
   WHERE tgrelid = 'public.owner_change_requests'::regclass AND tgname = 'owner_change_requests_guard' AND NOT tgisinternal
     AND tgenabled = 'O' AND (tgtype & 1) = 1 AND (tgtype & 2) = 2 AND (tgtype & 4) = 4 AND (tgtype & 16) = 16 AND (tgtype & 8) = 0
     AND tgfoid = 'public.owner_change_requests_guard()'::regprocedure;
  IF v_n <> 1 THEN RAISE EXCEPTION 'STOP: the guard trigger is missing or not BEFORE INSERT OR UPDATE FOR EACH ROW'; END IF;
  SELECT count(*) INTO v_n FROM pg_trigger WHERE tgrelid = 'public.owner_change_requests'::regclass AND NOT tgisinternal;
  IF v_n <> 1 THEN RAISE EXCEPTION 'STOP: expected exactly one trigger, found %', v_n; END IF;
  v_checks := array_append(v_checks, 'keys, indexes, trigger');

  -- 2b. owner_lot_history: 8 columns, RLS, no browser access, its keys (all CASCADE), its index, the append-only trigger.
  SELECT count(*) INTO v_n FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'owner_lot_history';
  IF v_n <> 8 THEN RAISE EXCEPTION 'STOP: expected 8 owner_lot_history columns, found %', v_n; END IF;
  SELECT count(*) INTO v_n FROM pg_class WHERE oid = 'public.owner_lot_history'::regclass AND relrowsecurity;
  IF v_n <> 1 THEN RAISE EXCEPTION 'STOP: RLS is not enabled on owner_lot_history'; END IF;
  IF has_table_privilege('anon', 'public.owner_lot_history', 'SELECT') OR has_table_privilege('authenticated', 'public.owner_lot_history', 'SELECT') THEN
    RAISE EXCEPTION 'STOP: a browser role can read owner_lot_history';
  END IF;
  SELECT count(*) INTO v_n FROM pg_constraint
   WHERE conrelid = 'public.owner_lot_history'::regclass AND contype = 'f' AND confdeltype = 'c'
     AND ((conname = 'owner_lot_history_scheme_id_fkey' AND confrelid = 'public.schemes'::regclass)
       OR (conname = 'owner_lot_history_lot_id_fkey' AND confrelid = 'public.lots'::regclass)
       OR (conname = 'owner_lot_history_membership_id_fkey' AND confrelid = 'public.scheme_memberships'::regclass));
  IF v_n <> 3 THEN RAISE EXCEPTION 'STOP: expected 3 owner_lot_history keys ON DELETE CASCADE, found %', v_n; END IF;
  SELECT count(*) INTO v_n FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'owner_lot_history_scheme_id_lot_id_idx';
  IF v_n <> 1 THEN RAISE EXCEPTION 'STOP: the owner_lot_history index is missing'; END IF;
  SELECT count(*) INTO v_n FROM pg_trigger
   WHERE tgrelid = 'public.owner_lot_history'::regclass AND tgname = 'owner_lot_history_append_only' AND NOT tgisinternal
     AND tgenabled = 'O' AND (tgtype & 1) = 1 AND (tgtype & 2) = 2 AND (tgtype & 16) = 16
     AND tgfoid = 'public.owner_lot_history_append_only()'::regprocedure;
  IF v_n <> 1 THEN RAISE EXCEPTION 'STOP: the owner_lot_history append-only trigger is missing'; END IF;
  INSERT INTO public.owner_lot_history (scheme_id, lot_id, profile_id, membership_id, started_at, ended_at)
  VALUES (v_tscheme, v_tlot, v_profile, v_member, now() - interval '1 year', now() - interval '1 day')
  RETURNING id INTO v_hist;
  BEGIN
    UPDATE public.owner_lot_history SET ended_at = now() WHERE id = v_hist;
    RAISE EXCEPTION 'STOP: an owner_lot_history row was updated';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.owner_lot_history (scheme_id, lot_id, profile_id, membership_id, started_at, ended_at)
    VALUES (v_tscheme, v_tlot, v_profile, v_member, now(), now() - interval '1 day');
    RAISE EXCEPTION 'STOP: an owner_lot_history row ending before it started was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  v_checks := array_append(v_checks, 'owner_lot_history');

  -- 3. A change held as the app records it: PENDING, not decided, no notice yet.
  INSERT INTO public.owner_change_requests (scheme_id, lot_id, status, owner_name, owner_email, settlement_date, invite, notice_document_id, recorded_by)
  VALUES (v_scheme, v_lot, 'PENDING', 'Rehearsal New Owner', 'rehearsal-new@example.invalid', current_date - 1, true, NULL, v_profile)
  RETURNING id INTO v_req;
  SELECT count(*) INTO v_n FROM public.owner_change_requests
   WHERE id = v_req AND status = 'PENDING' AND decided_at IS NULL AND decided_by IS NULL AND recorded_at IS NOT NULL;
  IF v_n <> 1 THEN RAISE EXCEPTION 'STOP: the held row is not PENDING and undecided'; END IF;
  v_checks := array_append(v_checks, 'insert as the app does');

  -- 4. One change waiting for each lot.
  BEGIN
    INSERT INTO public.owner_change_requests (scheme_id, lot_id, owner_name, settlement_date, recorded_by)
    VALUES (v_scheme, v_lot, 'Rehearsal Second', current_date - 1, v_profile);
    RAISE EXCEPTION 'STOP: a second PENDING change for the same lot was accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  v_checks := array_append(v_checks, 'one pending per lot');

  -- 5. The checks: invite needs an email, emails lower case, known statuses, decided means decider and time, a name.
  BEGIN
    INSERT INTO public.owner_change_requests (scheme_id, lot_id, owner_name, settlement_date, invite, recorded_by, status, decided_by, decided_at)
    VALUES (v_scheme, v_lot, 'Rehearsal Invite', current_date - 1, true, v_profile, 'REJECTED', v_profile, now());
    RAISE EXCEPTION 'STOP: an invite without an email was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.owner_change_requests (scheme_id, lot_id, owner_name, owner_email, settlement_date, recorded_by, status, decided_by, decided_at)
    VALUES (v_scheme, v_lot, 'Rehearsal Case', 'Rehearsal@Example.invalid', current_date - 1, v_profile, 'REJECTED', v_profile, now());
    RAISE EXCEPTION 'STOP: an upper-case email was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.owner_change_requests (scheme_id, lot_id, owner_name, settlement_date, recorded_by, status, decided_by, decided_at)
    VALUES (v_scheme, v_lot, 'Rehearsal Status', current_date - 1, v_profile, 'APPLIED', v_profile, now());
    RAISE EXCEPTION 'STOP: an unknown status was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.owner_change_requests (scheme_id, lot_id, owner_name, settlement_date, recorded_by, status)
    VALUES (v_scheme, v_lot, 'Rehearsal Undecided', current_date - 1, v_profile, 'CONFIRMED');
    RAISE EXCEPTION 'STOP: a decided row without a decider was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.owner_change_requests (scheme_id, lot_id, owner_name, settlement_date, recorded_by, status, decided_by, decided_at)
    VALUES (v_scheme, v_lot, '   ', current_date - 1, v_profile, 'REJECTED', v_profile, now());
    RAISE EXCEPTION 'STOP: a blank owner name was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  v_checks := array_append(v_checks, 'checks');

  -- 6. What was recorded cannot change while it waits.
  BEGIN
    UPDATE public.owner_change_requests SET owner_email = 'rehearsal-other@example.invalid' WHERE id = v_req;
    RAISE EXCEPTION 'STOP: the recorded email was changed';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  v_checks := array_append(v_checks, 'recorded facts fixed');

  -- 7. The notice: attached once to a waiting row, as the app does after the hold commits, then never replaced by another real document.
  INSERT INTO public.documents (scheme_id, title, category, file_url, file_name, uploaded_by, visibility)
  VALUES (v_scheme, 'Rehearsal notice', 'OTHER', 'rehearsal/notice.pdf', 'notice.pdf', v_profile, 'MANAGEMENT')
  RETURNING id INTO v_doc;
  INSERT INTO public.documents (scheme_id, title, category, file_url, file_name, uploaded_by, visibility)
  VALUES (v_scheme, 'Rehearsal notice 2', 'OTHER', 'rehearsal/notice2.pdf', 'notice2.pdf', v_profile, 'MANAGEMENT')
  RETURNING id INTO v_doc2;
  -- A document of another building is refused, on update and on insert (review L5).
  BEGIN
    UPDATE public.owner_change_requests SET notice_document_id = v_otherdoc WHERE id = v_req;
    RAISE EXCEPTION 'STOP: a notice from another building was attached';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.owner_change_requests (scheme_id, lot_id, owner_name, settlement_date, recorded_by, notice_document_id, status, decided_by, decided_at)
    VALUES (v_scheme, v_lot, 'Rehearsal Other Notice', current_date - 1, v_profile, v_otherdoc, 'REJECTED', v_profile, now());
    RAISE EXCEPTION 'STOP: a request with a notice from another building was inserted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  UPDATE public.owner_change_requests SET notice_document_id = v_doc
   WHERE id = v_req AND scheme_id = v_scheme AND status = 'PENDING' AND notice_document_id IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN RAISE EXCEPTION 'STOP: attaching the notice to the waiting row changed % rows', v_n; END IF;
  BEGIN
    UPDATE public.owner_change_requests SET notice_document_id = v_doc2 WHERE id = v_req;
    RAISE EXCEPTION 'STOP: the notice was replaced by another document';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  v_checks := array_append(v_checks, 'notice attached once, same building only');

  -- 8. The app's claim: succeeds once, then matches nothing.
  UPDATE public.owner_change_requests SET status = 'CONFIRMED', decided_by = v_profile, decided_at = now()
   WHERE id = v_req AND scheme_id = v_scheme AND status = 'PENDING';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN RAISE EXCEPTION 'STOP: the first claim changed % rows', v_n; END IF;
  UPDATE public.owner_change_requests SET status = 'REJECTED', decided_by = v_profile, decided_at = now()
   WHERE id = v_req AND scheme_id = v_scheme AND status = 'PENDING';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 0 THEN RAISE EXCEPTION 'STOP: a second claim changed % rows', v_n; END IF;
  v_checks := array_append(v_checks, 'single claim');

  -- 9. A decided row cannot be reopened, re-decided or given a notice.
  BEGIN
    UPDATE public.owner_change_requests SET status = 'PENDING', decided_by = NULL, decided_at = NULL WHERE id = v_req;
    RAISE EXCEPTION 'STOP: a decided row was reopened';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.owner_change_requests SET status = 'REJECTED' WHERE id = v_req;
    RAISE EXCEPTION 'STOP: a decided row was re-decided';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  INSERT INTO public.owner_change_requests (scheme_id, lot_id, owner_name, settlement_date, recorded_by, status, decided_by, decided_at)
  VALUES (v_scheme, v_lot, 'Rehearsal Decided', current_date - 1, v_profile, 'REJECTED', v_profile, now())
  RETURNING id INTO v_req2;
  BEGIN
    UPDATE public.owner_change_requests SET notice_document_id = v_doc2 WHERE id = v_req2;
    RAISE EXCEPTION 'STOP: a decided row was given a notice';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  v_checks := array_append(v_checks, 'decided rows fixed');

  -- 10. Once decided, the lot can have a new change waiting.
  INSERT INTO public.owner_change_requests (scheme_id, lot_id, owner_name, settlement_date, recorded_by)
  VALUES (v_scheme, v_lot, 'Rehearsal Next', current_date - 1, v_profile);
  v_checks := array_append(v_checks, 'new change after a decision');

  -- 11. Deleting the notice clears the key on the decided row (not blocked by the guard).
  DELETE FROM public.documents WHERE id = v_doc;
  SELECT count(*) INTO v_n FROM public.owner_change_requests WHERE id = v_req AND notice_document_id IS NULL AND status = 'CONFIRMED';
  IF v_n <> 1 THEN RAISE EXCEPTION 'STOP: deleting the notice did not clear the key on the decided row'; END IF;
  v_checks := array_append(v_checks, 'notice key SET NULL');

  -- 12. ON DELETE CASCADE from lots and from schemes, on the test building and lots.
  INSERT INTO public.owner_change_requests (scheme_id, lot_id, owner_name, settlement_date, recorded_by)
  VALUES (v_tscheme, v_tlot, 'Rehearsal Cascade Lot', current_date - 1, v_profile);
  DELETE FROM public.lots WHERE id = v_tlot;
  SELECT count(*) INTO v_n FROM public.owner_change_requests WHERE lot_id = v_tlot;
  IF v_n <> 0 THEN RAISE EXCEPTION 'STOP: deleting a lot left % of its requests', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.owner_lot_history WHERE lot_id = v_tlot;
  IF v_n <> 0 THEN RAISE EXCEPTION 'STOP: deleting a lot left % of its history rows', v_n; END IF;
  INSERT INTO public.owner_lot_history (scheme_id, lot_id, profile_id, membership_id, started_at, ended_at)
  VALUES (v_tscheme, v_tlot2, v_profile, v_member, now() - interval '1 year', now() - interval '1 day');
  INSERT INTO public.documents (scheme_id, title, category, file_url, file_name, uploaded_by, visibility)
  VALUES (v_tscheme, 'Rehearsal notice 3', 'OTHER', 'rehearsal/notice3.pdf', 'notice3.pdf', v_profile, 'MANAGEMENT')
  RETURNING id INTO v_tdoc;
  INSERT INTO public.owner_change_requests (scheme_id, lot_id, owner_name, settlement_date, recorded_by, notice_document_id, status, decided_by, decided_at)
  VALUES (v_tscheme, v_tlot2, 'Rehearsal Cascade Scheme', current_date - 1, v_profile, v_tdoc, 'CONFIRMED', v_profile, now());
  INSERT INTO public.owner_change_requests (scheme_id, lot_id, owner_name, settlement_date, recorded_by)
  VALUES (v_tscheme, v_tlot2, 'Rehearsal Cascade Scheme 2', current_date - 1, v_profile);
  DELETE FROM public.schemes WHERE id = v_tscheme;
  SELECT count(*) INTO v_n FROM public.owner_change_requests WHERE scheme_id = v_tscheme;
  IF v_n <> 0 THEN RAISE EXCEPTION 'STOP: deleting a building left % of its requests', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.owner_lot_history WHERE scheme_id = v_tscheme;
  IF v_n <> 0 THEN RAISE EXCEPTION 'STOP: deleting a building left % of its history rows', v_n; END IF;
  v_checks := array_append(v_checks, 'cascades from lots and schemes');

  RAISE EXCEPTION 'PROOF ok: % (all rolled back)', array_to_string(v_checks, ', ');
END;
$rehearsal$;

ROLLBACK;
