-- Hotfix: stop users granting themselves platform admin through the Data API.
--
-- Finding SEC-001. The profiles_update_own policy let a signed-in user update
-- their own profile row, and the default Supabase grants covered every column,
-- including is_platform_admin. The application reads and writes profiles
-- through its own server connection (Prisma), never through the Data API, so
-- the browser roles need no write access to this table at all.
--
-- Idempotent. Applied by hand through the Supabase SQL editor.

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.profiles FROM anon, authenticated;

-- Belt and braces: even if a grant is restored later, the browser roles cannot
-- set or change is_platform_admin.
CREATE OR REPLACE FUNCTION public.guard_profile_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    IF TG_OP = 'INSERT' AND NEW.is_platform_admin THEN
      RAISE EXCEPTION 'is_platform_admin can only be set by the server'
        USING ERRCODE = '42501';
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.is_platform_admin IS DISTINCT FROM OLD.is_platform_admin THEN
      RAISE EXCEPTION 'is_platform_admin can only be changed by the server'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_guard_privileged_columns ON public.profiles;
CREATE TRIGGER profiles_guard_privileged_columns
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_privileged_columns();
