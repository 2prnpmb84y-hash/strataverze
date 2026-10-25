-- Levy notices go out 5 weeks before they fall due (25 Oct 2026).
--
-- APPLY THIS BEFORE DEPLOYING THE CODE THAT NEEDS IT: the app reads every
-- column of levy_notices and levy_schedules, so the new code fails against
-- the old tables. The old code works against the new tables, so applying
-- this first is safe.
--
-- 1. When each notice was emailed to its owner, so a failed email is sent
--    again by the daily job.
ALTER TABLE public.levy_notices
  ADD COLUMN IF NOT EXISTS emailed_at timestamptz;

-- 2. Instalments the previous manager raised before the takeover ("1,2"),
--    which are not raised again.
ALTER TABLE public.levy_schedules
  ADD COLUMN IF NOT EXISTS raised_before_takeover text;

-- 3. Owners must not see a planned notice before it is issued.
--
-- The app reads notices through its own server connection and already leaves
-- DRAFT notices out of every owner query. This is the backstop at the
-- database: under row security, the managers (Adviser, committee,
-- accountant) see every notice of their scheme, other members only issued
-- ones. anon and authenticated have no table privileges on
-- public.levy_notices today (20261023_close_data_api.sql), and authenticated
-- may not execute is_scheme_manager, so nothing reads through this policy
-- yet. If the Data API is ever opened to this table, grant EXECUTE on
-- is_scheme_manager first or this policy errors.
DROP POLICY IF EXISTS levy_notices_select ON public.levy_notices;
CREATE POLICY levy_notices_select ON public.levy_notices
  FOR SELECT USING (
    public.is_scheme_manager(scheme_id)
    OR (status <> 'DRAFT' AND public.is_scheme_member(scheme_id))
  );
