-- Levy notices go out 5 weeks before they fall due (25 Oct 2026).
--
-- 1. A notice issued ahead of its period is raised in the ledger on its due
--    date (raise_pending until then, raised_at once done). Payments received
--    before the due date are held as levies paid in advance. emailed_at lets
--    a failed email be sent again. Existing notices are unaffected
--    (raise_pending defaults to false).
ALTER TABLE public.levy_notices
  ADD COLUMN IF NOT EXISTS raise_pending boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS raised_at timestamptz,
  ADD COLUMN IF NOT EXISTS emailed_at timestamptz;

CREATE INDEX IF NOT EXISTS levy_notices_raise_pending_due_idx
  ON public.levy_notices (due_date) WHERE raise_pending;

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
