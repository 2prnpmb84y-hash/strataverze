-- Security stage S0, finding SEC-005: close the Supabase Data API to browsers.
--
-- The app reads and writes every table through its own server connection
-- (Prisma, as the postgres role), so the browser roles (anon and
-- authenticated) need no table access at all. Supabase's default grants gave
-- them full access to all 142 public tables, which made RLS the only control
-- on direct PostgREST and GraphQL requests made with the public key.
--
-- After this migration:
--   * anon and authenticated hold no privileges on public tables, views or
--     sequences, now or for tables created later;
--   * they can execute only the three helper functions the storage policies
--     call (until storage moves server-side in stage S3);
--   * the two policies that let anyone insert schemes and organisations are
--     limited to platform admins, as a second layer behind the grants.
-- RLS stays enabled on every table as defence in depth.
--
-- Idempotent. Applied by hand through the Supabase SQL editor.

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;

-- Storage policies on storage.objects run as the authenticated role and call
-- these. They return only facts about the caller or parse an object path.
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_scheme_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.document_object_scheme_id(text) TO authenticated;

-- Objects created later by the postgres role get no browser-role grants.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

-- Second layer: only platform admins may create schemes or organisations.
DROP POLICY IF EXISTS schemes_insert ON public.schemes;
CREATE POLICY schemes_insert ON public.schemes
  FOR INSERT TO authenticated
  WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS organisations_insert ON public.organisations;
CREATE POLICY organisations_insert ON public.organisations
  FOR INSERT TO authenticated
  WITH CHECK (public.is_platform_admin());
