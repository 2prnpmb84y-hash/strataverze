-- Levy notices are now planned for the whole year as DRAFT and go out
-- 5 weeks before they fall due (25 Oct 2026). Owners must not see a planned
-- notice before it is issued.
--
-- The app reads notices through its own server connection and already leaves
-- DRAFT notices out of every owner query. This is the backstop at the
-- database: under row security, the managers (Adviser, committee,
-- accountant) see every notice of their scheme, other members see only
-- issued ones. anon and authenticated have no table privileges on
-- public.levy_notices today, so nothing reads through this policy yet.

DROP POLICY IF EXISTS levy_notices_select ON public.levy_notices;
CREATE POLICY levy_notices_select ON public.levy_notices
  FOR SELECT USING (
    public.is_scheme_manager(scheme_id)
    OR (status <> 'DRAFT' AND public.is_scheme_member(scheme_id))
  );
