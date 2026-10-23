-- Security stage S5 (sessions), finding SEC-011.
--
-- Supabase's own session time-box and inactivity settings need the Pro plan,
-- so sessions never expired. The app now keeps a register of sessions and
-- enforces the approved timeouts itself:
--   privileged users (platform admins, Advisers, Accountants, Payment
--   authorisers, treasurers): 30 minutes idle, 12 hours absolute;
--   everyone else: 4 hours idle, 14 days absolute.
--
-- app_sessions: one row per Supabase Auth session the app has seen (id is
-- the session_id claim of the access token). The app updates last_seen_at
-- at most once a minute and sets revoked_at when a session times out or is
-- ended.
--
-- profiles.sessions_revoked_at: "end every session that signed in before
-- this time". Set by "sign out everywhere", an admin, an MFA reset, a role
-- removal, and any password change.
--
-- Ending a session here also deletes it from auth.sessions (its refresh
-- tokens go with it, by cascade), so it cannot be refreshed and the Auth
-- server stops accepting it. The app checks the register on every request
-- as well, so an access token already issued stops working in the app at
-- once.
--
-- Neither table is reachable through the Data API (default privileges
-- revoke it, and RLS is on with no policies).
--
-- Idempotent. Applied by hand through the Supabase SQL editor.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS sessions_revoked_at timestamptz;

CREATE TABLE IF NOT EXISTS public.app_sessions (
  id               uuid PRIMARY KEY,
  profile_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  authenticated_at timestamptz NOT NULL,
  first_seen_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at     timestamptz NOT NULL DEFAULT now(),
  revoked_at       timestamptz,
  revoked_reason   text
);
CREATE INDEX IF NOT EXISTS app_sessions_profile_idx ON public.app_sessions (profile_id);
ALTER TABLE public.app_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_sessions FROM PUBLIC, anon, authenticated;

-- Ending one session.
CREATE OR REPLACE FUNCTION public.end_auth_session()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.revoked_at IS NOT NULL AND OLD.revoked_at IS NULL THEN
    DELETE FROM auth.sessions WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.end_auth_session() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS app_sessions_end_auth_session ON public.app_sessions;
CREATE TRIGGER app_sessions_end_auth_session
  AFTER UPDATE OF revoked_at ON public.app_sessions
  FOR EACH ROW EXECUTE FUNCTION public.end_auth_session();

-- Ending every session of a user that signed in before sessions_revoked_at.
CREATE OR REPLACE FUNCTION public.end_user_sessions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.sessions_revoked_at IS NOT NULL
     AND NEW.sessions_revoked_at IS DISTINCT FROM OLD.sessions_revoked_at THEN
    DELETE FROM auth.sessions
    WHERE user_id = NEW.auth_id AND created_at <= NEW.sessions_revoked_at;
    UPDATE public.app_sessions
    SET revoked_at = NEW.sessions_revoked_at, revoked_reason = coalesce(revoked_reason, 'revoked')
    WHERE profile_id = NEW.id AND revoked_at IS NULL AND authenticated_at <= NEW.sessions_revoked_at;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.end_user_sessions() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS profiles_end_user_sessions ON public.profiles;
CREATE TRIGGER profiles_end_user_sessions
  AFTER UPDATE OF sessions_revoked_at ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.end_user_sessions();

-- A password change (reset link, the app, or an admin) ends every session
-- of that user, including the one that changed it. The user signs in again
-- with the new password. All StrataVerze users have passwords hashed by the
-- Auth server itself, so this does not fire on sign-in.
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
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.end_sessions_on_password_change() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.end_sessions_on_password_change() TO supabase_auth_admin;

DROP TRIGGER IF EXISTS strataverze_end_sessions_on_password_change ON auth.users;
CREATE TRIGGER strataverze_end_sessions_on_password_change
  AFTER UPDATE OF encrypted_password ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.end_sessions_on_password_change();
