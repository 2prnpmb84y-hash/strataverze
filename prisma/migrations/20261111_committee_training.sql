-- NSW strata committee training (26 Oct 2026): for each committee member of
-- a scheme, the date they were appointed (as recorded by an adviser), when
-- they completed the training, or why they are exempt. The rules (from
-- 1 Oct 2026, within 3 months of appointment, exemptions) are in the
-- building's rule pack.
--
-- APPLY THIS BEFORE DEPLOYING THE CODE THAT NEEDS IT: the governance and
-- members pages read it (they log and carry on if it is missing, but show
-- no training).
-- Applied by hand in the Supabase SQL editor, like the other migrations.

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.committee_training (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id              uuid NOT NULL REFERENCES public.schemes(id) ON DELETE CASCADE,
  profile_id             uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  appointed_on           date NOT NULL,
  completed_on           date,
  exemption              text CHECK (exemption IN ('ACSL_MEMBER', 'STRATA_MANAGING_AGENT', 'CASUAL_VACANCY_SHORT')),
  note                   text,
  last_reminder_on       date,
  appointed_recorded_by  uuid,
  completed_recorded_by  uuid,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT committee_training_scheme_id_profile_id_key UNIQUE (scheme_id, profile_id)
);
-- RLS on, no policies: the Data API is denied; the app connects as the owner.
ALTER TABLE public.committee_training ENABLE ROW LEVEL SECURITY;

COMMIT;
