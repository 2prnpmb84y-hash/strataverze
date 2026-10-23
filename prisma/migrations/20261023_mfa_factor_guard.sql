-- Security stage S4 (MFA), from the independent review of S4.
--
-- The app's authenticator rules (a recent check before adding a second
-- authenticator or removing one, at most two, and an admin reset only after
-- an identity check) were enforced only in the app. The Supabase Auth API can
-- be called directly with the user's own session token, so someone holding a
-- stolen but not recent aal2 session could add their own authenticator or
-- remove the owner's, skipping those rules.
--
-- This moves the rules into the database, where the Auth API cannot skip
-- them:
--   * Adding an authenticator when the user already has a verified one
--     needs a one-time "enrol" grant, written by the app after its checks.
--   * Removing a verified authenticator needs a one-time "remove" grant for
--     that authenticator, written by the app after its checks (the user's own
--     removal with a recent check, or a platform admin's reset).
--   * No user may have more than two verified authenticators.
-- A grant is good for 10 minutes and is used once. The first authenticator
-- needs no grant (the user has none to protect yet), and unverified
-- (half-finished) ones can always be cleared. Deleting a whole user still
-- works, since the user row is gone by the time its factors are removed.
--
-- Grants live in a table only the app's database connection can reach (no
-- Data API access, no RLS policies).
--
-- Idempotent. Applied by hand through the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS public.mfa_factor_grants (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid NOT NULL,
  action       text NOT NULL CHECK (action IN ('enrol', 'remove')),
  factor_id    uuid,
  granted_by   uuid NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  used_at      timestamptz,
  CHECK ((action = 'remove') = (factor_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS mfa_factor_grants_user_idx ON public.mfa_factor_grants (auth_user_id, action, created_at);
ALTER TABLE public.mfa_factor_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mfa_factor_grants FROM PUBLIC, anon, authenticated;

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
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mfa_factor_guard() FROM PUBLIC, anon, authenticated;
-- The Auth server's role writes auth.mfa_factors, so the trigger runs as it.
GRANT EXECUTE ON FUNCTION public.mfa_factor_guard() TO supabase_auth_admin;

DROP TRIGGER IF EXISTS strataverze_mfa_factor_guard ON auth.mfa_factors;
CREATE TRIGGER strataverze_mfa_factor_guard
  BEFORE INSERT OR UPDATE OF status OR DELETE ON auth.mfa_factors
  FOR EACH ROW EXECUTE FUNCTION public.mfa_factor_guard();

-- Storage policy refinements from the same review: count only authenticator
-- app (TOTP) factors, as the app does, and evaluate the function once per
-- statement rather than once per row.
CREATE OR REPLACE FUNCTION public.requires_aal2()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.auth_id = auth.uid() AND p.is_platform_admin
    )
    OR EXISTS (
      SELECT 1
      FROM public.scheme_memberships m
      JOIN public.profiles p ON p.id = m.profile_id
      WHERE p.auth_id = auth.uid()
        AND m.is_active
        AND (
          m.role::text IN ('ADVISER', 'ACCOUNTANT', 'PAYMENT_AUTHORISER')
          OR (m.role::text = 'COMMITTEE' AND m.is_treasurer)
        )
    )
    OR EXISTS (
      SELECT 1 FROM auth.mfa_factors f
      WHERE f.user_id = auth.uid() AND f.status::text = 'verified' AND f.factor_type::text = 'totp'
    );
$$;

DROP POLICY IF EXISTS documents_require_mfa ON storage.objects;
CREATE POLICY documents_require_mfa ON storage.objects
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (
    bucket_id <> 'documents'
    OR coalesce((select auth.jwt()) ->> 'aal', 'aal1') = 'aal2'
    OR NOT (select public.requires_aal2())
  )
  WITH CHECK (
    bucket_id <> 'documents'
    OR coalesce((select auth.jwt()) ->> 'aal', 'aal1') = 'aal2'
    OR NOT (select public.requires_aal2())
  );
