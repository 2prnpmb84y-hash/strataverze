-- NSW Strata Hub annual reporting (26 Oct 2026): one row for each AGM, with
-- the date the annual report was made on Strata Hub and its reference. A row
-- also records an AGM held outside StrataVerze. The rules (within 3 months
-- of the AGM, two-lot schemes exempt from 1 Oct 2026) are in the rule pack.
--
-- The app reads this table only on the pages and in the daily reminders
-- added with it; apply it before the code deploys.
-- Applied by hand in the Supabase SQL editor, like the other migrations.

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.annual_reports (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id        uuid NOT NULL REFERENCES public.schemes(id) ON DELETE CASCADE,
  agm_on           date NOT NULL,
  agm_recorded     boolean NOT NULL DEFAULT false,
  reported_on      date,
  reference        text,
  reported_by      uuid,
  note             text,
  last_reminder_on date,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT annual_reports_scheme_id_agm_on_key UNIQUE (scheme_id, agm_on),
  CONSTRAINT annual_reports_reported_after_agm CHECK (reported_on IS NULL OR reported_on >= agm_on)
);
-- RLS on, no policies: the Data API is denied; the app connects as the owner.
ALTER TABLE public.annual_reports ENABLE ROW LEVEL SECURITY;

COMMIT;
