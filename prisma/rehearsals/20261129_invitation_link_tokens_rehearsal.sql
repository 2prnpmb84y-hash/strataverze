-- Rolled-back rehearsal of migrations 20261129_invitation_link_tokens.sql
-- (part 1) and 20261130_invitation_plain_token_drop.sql (part 2), security
-- stage S2a. NOT a migration: it changes nothing. Everything runs inside one
-- DO block that always ends with RAISE EXCEPTION, so Postgres rolls all of it
-- back, and the outer BEGIN ... ROLLBACK is a second guard.
--
-- Status: NOT RUN anywhere yet. Run it in the Supabase SQL editor only with
-- Matthew Wrigley's approval, before applying part 1.
--
-- Expected result: an error whose message starts "PROOF ok:" and lists what
-- was checked. Any other error (including "PROOF incomplete") means stop and
-- do not apply.
--
-- It needs one existing building and one existing profile to insert test
-- invitations against (inside the rolled-back transaction). The test rows
-- use made-up addresses at example.invalid.

BEGIN;

DO $rehearsal$
DECLARE
  v_scheme uuid;
  v_profile uuid;
  v_auth uuid;
  v_hash text := repeat('ab', 32);
  v_checks text[] := ARRAY[]::text[];
  v_n int;
  v_type text;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);

  SELECT id INTO v_scheme FROM public.schemes ORDER BY created_at LIMIT 1;
  SELECT id INTO v_profile FROM public.profiles ORDER BY created_at LIMIT 1;
  SELECT id INTO v_auth FROM auth.users ORDER BY created_at LIMIT 1;
  IF v_scheme IS NULL OR v_profile IS NULL OR v_auth IS NULL THEN
    RAISE EXCEPTION 'PROOF incomplete: needs one building, one profile and one Auth user to test against';
  END IF;

  -- ── Part 1, exactly as in 20261129_invitation_link_tokens.sql ──
  ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS token_hash text;
  ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS token_used_at timestamptz;
  ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS account_auth_id uuid;
  ALTER TABLE public.invitations DROP CONSTRAINT IF EXISTS invitations_token_hash_check;
  ALTER TABLE public.invitations ADD CONSTRAINT invitations_token_hash_check
    CHECK (token_hash IS NULL OR token_hash ~ '^[0-9a-f]{64}$');
  CREATE UNIQUE INDEX IF NOT EXISTS invitations_token_hash_key ON public.invitations (token_hash);
  ALTER TABLE public.invitations DROP CONSTRAINT IF EXISTS invitations_account_auth_id_fkey;
  ALTER TABLE public.invitations ADD CONSTRAINT invitations_account_auth_id_fkey
    FOREIGN KEY (account_auth_id) REFERENCES auth.users (id) ON DELETE SET NULL;
  CREATE INDEX IF NOT EXISTS invitations_account_auth_id_idx
    ON public.invitations (account_auth_id) WHERE account_auth_id IS NOT NULL;

  -- 1. The three columns exist, nullable, with the right types.
  SELECT count(*) INTO v_n FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'invitations' AND is_nullable = 'YES'
     AND ((column_name = 'token_hash' AND data_type = 'text')
       OR (column_name = 'token_used_at' AND data_type = 'timestamp with time zone')
       OR (column_name = 'account_auth_id' AND data_type = 'uuid'));
  IF v_n <> 3 THEN RAISE EXCEPTION 'STOP: expected 3 new nullable columns, found %', v_n; END IF;
  v_checks := array_append(v_checks, 'columns');

  -- 2. An insert as the code deployed today makes it (no token, no token_hash) still works,
  --    and the old token column still fills from its default.
  INSERT INTO public.invitations (scheme_id, email, role, invited_by_id, expires_at)
  VALUES (v_scheme, 'rehearsal-old@example.invalid', 'OWNER', v_profile, now() + interval '14 days');
  SELECT count(*) INTO v_n FROM public.invitations WHERE email = 'rehearsal-old@example.invalid' AND token IS NOT NULL;
  IF v_n <> 1 THEN RAISE EXCEPTION 'STOP: an insert without a token did not get one from the default'; END IF;
  v_checks := array_append(v_checks, 'old insert works');

  -- 3. A well-formed hash is accepted; a malformed one (upper case, wrong length, a raw token) is refused.
  INSERT INTO public.invitations (scheme_id, email, role, invited_by_id, expires_at, token_hash, account_auth_id)
  VALUES (v_scheme, 'rehearsal-a@example.invalid', 'OWNER', v_profile, now() + interval '14 days', v_hash, v_auth);
  BEGIN
    INSERT INTO public.invitations (scheme_id, email, role, invited_by_id, expires_at, token_hash)
    VALUES (v_scheme, 'rehearsal-b@example.invalid', 'OWNER', v_profile, now() + interval '14 days', upper(v_hash));
    RAISE EXCEPTION 'STOP: an upper-case hash was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.invitations (scheme_id, email, role, invited_by_id, expires_at, token_hash)
    VALUES (v_scheme, 'rehearsal-b@example.invalid', 'OWNER', v_profile, now() + interval '14 days', 'k3J9sQ-raw-token-not-a-hash');
    RAISE EXCEPTION 'STOP: a raw token was accepted as a hash';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  v_checks := array_append(v_checks, 'hash format');

  -- 4. Two invitations cannot share a hash.
  BEGIN
    INSERT INTO public.invitations (scheme_id, email, role, invited_by_id, expires_at, token_hash)
    VALUES (v_scheme, 'rehearsal-c@example.invalid', 'COMMITTEE', v_profile, now() + interval '14 days', v_hash);
    RAISE EXCEPTION 'STOP: a duplicate hash was accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  v_checks := array_append(v_checks, 'hash unique');

  -- 5. account_auth_id must be a real Auth user, and is cleared if that user is deleted.
  BEGIN
    INSERT INTO public.invitations (scheme_id, email, role, invited_by_id, expires_at, account_auth_id)
    VALUES (v_scheme, 'rehearsal-d@example.invalid', 'OWNER', v_profile, now() + interval '14 days', gen_random_uuid());
    RAISE EXCEPTION 'STOP: an unknown Auth user was accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  SELECT count(*) INTO v_n FROM pg_constraint
   WHERE conname = 'invitations_account_auth_id_fkey' AND conrelid = 'public.invitations'::regclass
     AND confrelid = 'auth.users'::regclass AND confdeltype = 'n';
  IF v_n <> 1 THEN RAISE EXCEPTION 'STOP: the Auth user key is missing or not ON DELETE SET NULL'; END IF;
  SELECT count(*) INTO v_n FROM pg_indexes
   WHERE schemaname = 'public' AND tablename = 'invitations' AND indexname = 'invitations_account_auth_id_idx';
  IF v_n <> 1 THEN RAISE EXCEPTION 'STOP: the account_auth_id index is missing'; END IF;
  v_checks := array_append(v_checks, 'auth user key');

  -- 6. Single use: the claim the app makes succeeds once and then matches nothing.
  UPDATE public.invitations SET token_used_at = now()
   WHERE token_hash = v_hash AND status = 'PENDING' AND token_used_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN RAISE EXCEPTION 'STOP: the first claim changed % rows', v_n; END IF;
  UPDATE public.invitations SET token_used_at = now()
   WHERE token_hash = v_hash AND status = 'PENDING' AND token_used_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 0 THEN RAISE EXCEPTION 'STOP: a second claim changed % rows', v_n; END IF;
  v_checks := array_append(v_checks, 'single-use claim');

  -- 6b. The set-up lock the app takes (claimLinkForAccountSetUp): every
  --     pending invitation for the account, locked in id order, can be read
  --     and claimed in one transaction. (Another session waiting on it cannot
  --     be shown inside one DO block.)
  PERFORM 1 FROM public.invitations
    WHERE account_auth_id = v_auth AND status = 'PENDING'
    ORDER BY id FOR NO KEY UPDATE;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n < 1 THEN RAISE EXCEPTION 'STOP: the set-up lock found no pending invitation for the account'; END IF;
  v_checks := array_append(v_checks, 'account set-up lock');

  -- 6c. The read the app makes of auth.users when an address already has an
  --     Auth user (accounts.ts, adoption of a never-confirmed account): the
  --     columns it names exist and the app's role can read them.
  PERFORM id::text, (email_confirmed_at IS NOT NULL), (last_sign_in_at IS NOT NULL)
    FROM auth.users WHERE lower(email::text) = 'rehearsal-a@example.invalid' ORDER BY created_at LIMIT 2;
  v_checks := array_append(v_checks, 'auth.users read');

  -- 7. The browser roles still have no access to the table or the new columns (SEC-005).
  IF has_table_privilege('anon', 'public.invitations', 'SELECT')
     OR has_table_privilege('authenticated', 'public.invitations', 'SELECT')
     OR has_column_privilege('authenticated', 'public.invitations', 'token_hash', 'SELECT')
     OR has_column_privilege('anon', 'public.invitations', 'token_hash', 'SELECT') THEN
    RAISE EXCEPTION 'STOP: a browser role can read invitations';
  END IF;
  v_checks := array_append(v_checks, 'no browser access');

  -- ── Part 2, exactly as in 20261130_invitation_plain_token_drop.sql ──
  -- The restore SQL in part 2's header assumes the column is text.
  SELECT data_type INTO v_type FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'invitations' AND column_name = 'token';
  IF v_type IS DISTINCT FROM 'text' THEN
    RAISE EXCEPTION 'STOP: token is %, not text: fix the restore SQL in part 2''s header first', coalesce(v_type, 'missing');
  END IF;
  ALTER TABLE public.invitations DROP COLUMN IF EXISTS token;

  SELECT count(*) INTO v_n FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'invitations' AND column_name = 'token';
  IF v_n <> 0 THEN RAISE EXCEPTION 'STOP: the token column is still there'; END IF;
  SELECT count(*) INTO v_n FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'invitations_token_key';
  IF v_n <> 0 THEN RAISE EXCEPTION 'STOP: the old token index is still there'; END IF;

  -- 8. An insert as the S2a code makes it works without the old column.
  INSERT INTO public.invitations (scheme_id, email, role, invited_by_id, expires_at, token_hash)
  VALUES (v_scheme, 'rehearsal-e@example.invalid', 'COMMITTEE', v_profile, now() + interval '14 days', repeat('cd', 32));
  v_checks := array_append(v_checks, 'part 2 and new insert');

  -- 9. The rollback path in part 2's header: the column comes back, every
  --    row gets a token, and an insert as the pre-S2a code makes it works.
  ALTER TABLE public.invitations
    ADD COLUMN IF NOT EXISTS token text NOT NULL DEFAULT (gen_random_uuid())::text;
  CREATE UNIQUE INDEX IF NOT EXISTS invitations_token_key ON public.invitations (token);
  SELECT count(*) INTO v_n FROM public.invitations WHERE token IS NULL;
  IF v_n <> 0 THEN RAISE EXCEPTION 'STOP: % rows have no token after the restore', v_n; END IF;
  INSERT INTO public.invitations (scheme_id, email, role, invited_by_id, expires_at)
  VALUES (v_scheme, 'rehearsal-f@example.invalid', 'OWNER', v_profile, now() + interval '14 days');
  v_checks := array_append(v_checks, 'restore of token');

  RAISE EXCEPTION 'PROOF ok: % (all rolled back)', array_to_string(v_checks, ', ');
END;
$rehearsal$;

ROLLBACK;
