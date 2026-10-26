-- NSW strata committee training (26 Oct 2026): for each committee member of
-- a scheme, when they were appointed, when they completed the training, or
-- why they are exempt. The rules (from 1 Oct 2026, within 3 months of
-- appointment, exemptions) are in the building's rule pack.
--
-- The app reads this table only on the pages and in the daily reminders
-- added with it, so it can be applied before or after the code deploys
-- (before is better: until then those pages fail).
-- Applied by hand in the Supabase SQL editor, like the other migrations.

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.committee_training (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id     uuid NOT NULL REFERENCES public.schemes(id) ON DELETE CASCADE,
  profile_id    uuid NOT NULL,
  appointed_on  date NOT NULL,
  completed_on  date,
  exemption     text CHECK (exemption IN ('ACSL_MEMBER', 'STRATA_MANAGING_AGENT', 'CASUAL_VACANCY_SHORT')),
  note          text,
  last_reminder_on date,
  recorded_by   uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT committee_training_scheme_profile_key UNIQUE (scheme_id, profile_id)
);
-- RLS on, no policies: the Data API is denied; the app connects as the owner.
ALTER TABLE public.committee_training ENABLE ROW LEVEL SECURITY;

COMMIT;
