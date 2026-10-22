-- Contractor review is StrataVerze staff work (platform admins only).
-- Idempotent: safe to re-run. Hand-applied via the Supabase SQL editor.
--
-- is_contractor_reviewer() previously looked for scheme roles the app never
-- assigns (STRATA_MANAGER, BUILDING_MANAGER, ORG_ADMIN, COMPLIANCE_REVIEWER,
-- CONTRACTOR_ADMIN), so nobody passed it. It now matches the app: a reviewer
-- is a platform admin. The 17 contractor policies that call it are unchanged.

CREATE OR REPLACE FUNCTION public.is_contractor_reviewer()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_platform_admin();
$$;
