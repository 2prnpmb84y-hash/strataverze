-- Rolled-back rehearsal of migration 20261201_owner_change_requests.sql
-- (finding H-1: a committee member's change of owner is held for review).
-- NOT a migration: it changes nothing. Everything runs inside one DO block
-- that always ends with RAISE EXCEPTION, so Postgres rolls all of it back, and
-- the outer BEGIN ... ROLLBACK is a second guard.
--
-- Status: NOT RUN anywhere yet. Run it in the Supabase SQL editor only with
-- Matthew Wrigley's approval, before applying the migration.
--
-- Expected result: an error whose message starts "PROOF ok:" and lists what
-- was checked. Any other error (including "PROOF incomplete" or one starting
-- "STOP") means stop and do not apply.
--
-- It needs one existing lot (with its building) and one existing profile to
-- insert test rows against, inside the rolled-back transaction. The test rows
-- use made-up names and addresses at example.invalid.

BEGIN;

DO $rehearsal$
DECLARE
  v_scheme uuid;
  v_lot uuid;
  v_profile uuid;
  v_doc uuid;
  v_req uuid;
  v_req2 uuid;
  v_checks text[] := ARRAY[]::text[];
  v_n int;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);

  -- ── The migration, exactly as in 20261201_owner_change_requests.sql ──
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
    CONSTRAINT owner_change_requests_decided_check CHECK (
      (status = 'PENDING') = (decided_at IS NULL) AND (decided_at IS NULL) = (decided_by IS NULL)),
    CONSTRAINT owner_change_requests_owner_name_check CHECK (length(btrim(owner_name)) BETWEEN 1 AND 500),
    CONSTRAINT owner_change_requests_owner_email_check CHECK (
      owner_email IS NULL OR (owner_email = lower(btrim(owner_email)) AND length(owner_email) BETWEEN 3 AND 255)),
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
    IF (NEW.id, NEW.scheme_id, NEW.lot_id, NEW.owner_name, NEW.owner_email, NEW.owner_mobile, NEW.owner_phone,
        NEW.owner_address, NEW.settlement_date, NEW.invite, NEW.recorded_by, NEW.recorded_at)
       IS DISTINCT FROM
       (OLD.id, OLD.scheme_id, OLD.lot_id, OLD.owner_name, OLD.owner_email, OLD.owner_mobile, OLD.owner_phone,
        OLD.owner_address, OLD.settlement_date, OLD.invite, OLD.recorded_by, OLD.recorded_at)
       OR (NEW.notice_document_id IS DISTINCT FROM OLD.notice_document_id AND NEW.notice_document_id IS NOT NULL) THEN
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
  CREATE TRIGGER owner_change_requests_guard BEFORE UPDATE ON public.owner_change_requests
    FOR EACH ROW EXECUTE FUNCTION public.owner_change_requests_guard();

  -- Test fixtures: a lot with no change waiting, its building, and a profile.
  SELECT l.id, l.scheme_id INTO v_lot, v_scheme FROM public.lots l
   WHERE NOT EXISTS (SELECT 1 FROM public.owner_change_requests r WHERE r.lot_id = l.id AND r.status = 'PENDING')
   ORDER BY l.id LIMIT 1;
  SELECT id INTO v_profile FROM public.profiles ORDER BY created_at LIMIT 1;
  IF v_lot IS NULL OR v_profile IS NULL THEN
    RAISE EXCEPTION 'PROOF incomplete: needs one lot and one profile to test against';
  END IF;

  -- 1. The table, its 16 columns, RLS on, and no browser access.
  SELECT count(*) INTO v_n FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'owner_change_requests';
  IF v_n <> 16 THEN RAISE EXCEPTION 'STOP: expected 16 columns, found %', v_n; END IF;
  SELECT count(*) INTO v_n FROM pg_class WHERE oid = 'public.owner_change_requests'::regclass AND relrowsecurity;
  IF v_n <> 1 THEN RAISE EXCEPTION 'STOP: RLS is not enabled'; END IF;
  IF has_table_privilege('anon', 'public.owner_change_requests', 'SELECT')
     OR has_table_privilege('authenticated', 'public.owner_change_requests', 'SELECT')
     OR has_table_privilege('authenticated', 'public.owner_change_requests', 'INSERT')
     OR has_table_privilege('authenticated', 'public.owner_change_requests', 'UPDATE') THEN
    RAISE EXCEPTION 'STOP: a browser role can reach owner_change_requests';
  END IF;
  v_checks := array_append(v_checks, 'table, RLS, no browser access');

  -- 2. A change held as the app records it: PENDING by default, not decided.
  INSERT INTO public.owner_change_requests (scheme_id, lot_id, owner_name, owner_email, settlement_date, invite, recorded_by)
  VALUES (v_scheme, v_lot, 'Rehearsal New Owner', 'rehearsal-new@example.invalid', current_date - 1, true, v_profile)
  RETURNING id INTO v_req;
  SELECT count(*) INTO v_n FROM public.owner_change_requests
   WHERE id = v_req AND status = 'PENDING' AND decided_at IS NULL AND decided_by IS NULL AND recorded_at IS NOT NULL;
  IF v_n <> 1 THEN RAISE EXCEPTION 'STOP: the held row did not default to PENDING'; END IF;
  v_checks := array_append(v_checks, 'insert as the app does');

  -- 3. One change waiting for each lot.
  BEGIN
    INSERT INTO public.owner_change_requests (scheme_id, lot_id, owner_name, settlement_date, recorded_by)
    VALUES (v_scheme, v_lot, 'Rehearsal Second', current_date - 1, v_profile);
    RAISE EXCEPTION 'STOP: a second PENDING change for the same lot was accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  v_checks := array_append(v_checks, 'one pending per lot');

  -- 4. The checks: invite needs an email, emails lower case, known statuses, decided means decider and time.
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

  -- 5. What was recorded cannot change while it waits.
  BEGIN
    UPDATE public.owner_change_requests SET owner_email = 'rehearsal-other@example.invalid' WHERE id = v_req;
    RAISE EXCEPTION 'STOP: the recorded email was changed';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  v_checks := array_append(v_checks, 'recorded facts fixed');

  -- 6. The app's claim: succeeds once, then matches nothing.
  UPDATE public.owner_change_requests SET status = 'CONFIRMED', decided_by = v_profile, decided_at = now()
   WHERE id = v_req AND scheme_id = v_scheme AND status = 'PENDING';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN RAISE EXCEPTION 'STOP: the first claim changed % rows', v_n; END IF;
  UPDATE public.owner_change_requests SET status = 'REJECTED', decided_by = v_profile, decided_at = now()
   WHERE id = v_req AND scheme_id = v_scheme AND status = 'PENDING';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 0 THEN RAISE EXCEPTION 'STOP: a second claim changed % rows', v_n; END IF;
  v_checks := array_append(v_checks, 'single claim');

  -- 7. A decided row cannot be reopened or re-decided.
  BEGIN
    UPDATE public.owner_change_requests SET status = 'PENDING', decided_by = NULL, decided_at = NULL WHERE id = v_req;
    RAISE EXCEPTION 'STOP: a decided row was reopened';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  v_checks := array_append(v_checks, 'decided rows fixed');

  -- 8. Once decided, the lot can have a new change waiting.
  INSERT INTO public.owner_change_requests (scheme_id, lot_id, owner_name, settlement_date, recorded_by)
  VALUES (v_scheme, v_lot, 'Rehearsal Next', current_date - 1, v_profile)
  RETURNING id INTO v_req2;
  v_checks := array_append(v_checks, 'new change after a decision');

  -- 9. The notice of transfer: set when recorded, never replaced, and cleared (not blocked) when the document is deleted,
  --    on a decided row too.
  INSERT INTO public.documents (scheme_id, title, category, file_url, file_name, uploaded_by, visibility)
  VALUES (v_scheme, 'Rehearsal notice', 'OTHER', 'rehearsal/notice.pdf', 'notice.pdf', v_profile, 'MANAGEMENT')
  RETURNING id INTO v_doc;
  UPDATE public.owner_change_requests SET status = 'REJECTED', decided_by = v_profile, decided_at = now() WHERE id = v_req2;
  INSERT INTO public.owner_change_requests (scheme_id, lot_id, owner_name, settlement_date, recorded_by, notice_document_id)
  VALUES (v_scheme, v_lot, 'Rehearsal Notice', current_date - 1, v_profile, v_doc)
  RETURNING id INTO v_req2;
  BEGIN
    UPDATE public.owner_change_requests SET notice_document_id = gen_random_uuid() WHERE id = v_req2;
    RAISE EXCEPTION 'STOP: the notice key was replaced';
  EXCEPTION WHEN check_violation OR foreign_key_violation THEN NULL;
  END;
  UPDATE public.owner_change_requests SET status = 'CONFIRMED', decided_by = v_profile, decided_at = now() WHERE id = v_req2;
  DELETE FROM public.documents WHERE id = v_doc;
  SELECT count(*) INTO v_n FROM public.owner_change_requests WHERE id = v_req2 AND notice_document_id IS NULL AND status = 'CONFIRMED';
  IF v_n <> 1 THEN RAISE EXCEPTION 'STOP: deleting the notice did not clear the key on the decided row'; END IF;
  v_checks := array_append(v_checks, 'notice key');

  RAISE EXCEPTION 'PROOF ok: % (all rolled back)', array_to_string(v_checks, ', ');
END;
$rehearsal$;

ROLLBACK;
