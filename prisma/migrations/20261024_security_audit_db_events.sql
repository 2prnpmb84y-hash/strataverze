-- Security stage S6 (audit log): events recorded by the database itself, so
-- they are captured however the change was made (the app, or a direct call
-- to the Supabase Auth API).
--
-- This file redefines two trigger functions from earlier stages, adding the
-- audit insert. It sorts after them (20261024) so replaying the migrations
-- in order always ends with these definitions. Each audit insert is wrapped
-- so that a failure to record never fails the Auth operation itself.
--
-- Needs 20261023_security_audit_log.sql. Idempotent.

-- A password change (S5 ends every session; S6 records it). Setting a first
-- password (an invited user) is recorded too, but ends no sessions.
CREATE OR REPLACE FUNCTION public.end_sessions_on_password_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  first_password boolean := OLD.encrypted_password IS NULL OR OLD.encrypted_password = '';
BEGIN
  IF NEW.encrypted_password IS DISTINCT FROM OLD.encrypted_password THEN
    IF NOT first_password THEN
      UPDATE public.profiles SET sessions_revoked_at = now() WHERE auth_id = NEW.id;
    END IF;
    BEGIN
      INSERT INTO public.security_audit_events (action, outcome, actor_auth_id, actor_profile_id, resource_type, resource_id, reason)
      VALUES (
        CASE WHEN first_password THEN 'auth.password_set' ELSE 'auth.password_changed' END,
        'allowed', NEW.id,
        (SELECT p.id FROM public.profiles p WHERE p.auth_id = NEW.id),
        'auth_user', NEW.id::text,
        CASE WHEN first_password THEN 'first password set' ELSE 'every session ended' END
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'StrataVerze: could not record a password change in the audit log: %', SQLSTATE;
    END;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.end_sessions_on_password_change() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.end_sessions_on_password_change() TO supabase_auth_admin;

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
      BEGIN
        INSERT INTO public.security_audit_events (action, outcome, actor_auth_id, resource_type, resource_id, metadata)
        VALUES ('mfa.factor_verified', 'allowed', NEW.user_id, 'mfa_factor', NEW.id::text,
                jsonb_build_object('factorType', NEW.factor_type::text, 'source', 'database'));
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'StrataVerze: could not record an authenticator change in the audit log: %', SQLSTATE;
      END;
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
      BEGIN
        INSERT INTO public.security_audit_events (action, outcome, actor_auth_id, resource_type, resource_id, metadata)
        VALUES ('mfa.factor_deleted', 'allowed', OLD.user_id, 'mfa_factor', OLD.id::text,
                jsonb_build_object('factorType', OLD.factor_type::text, 'source', 'database'));
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'StrataVerze: could not record an authenticator change in the audit log: %', SQLSTATE;
      END;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.mfa_factor_guard() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mfa_factor_guard() TO supabase_auth_admin;
