-- The daily reminder for the deadline to start proceedings (QLD go-live gap,
-- 27 Oct 2026). Idempotent. Applied by hand in the Supabase SQL editor, like
-- the other migrations.
--
-- When to apply: NOT required before the code deploys. The app reads and
-- writes this table only for buildings whose live rule pack has the 2 year
-- rule (Standard Module s 166(2)), and no live pack has it (NSW has none,
-- Queensland is pending), so the daily run returns before any query. It MUST
-- be applied before the Queensland pack is switched on (moved to RULE_PACKS),
-- or each Queensland reminder fails and is logged, and none is sent.
--
-- proceedings_deadline_reminders: one row per lot and oldest unpaid due date
-- (the date for payment of the lot's oldest unpaid contribution, from which
-- StrataVerze counts the 2 years). last_stage is the last reminder sent, in
-- the order FLAGGED, DAYS_30, DAYS_14, DAYS_7, PASSED. A run claims a stage by
-- creating the row, or by updating it only where it holds an earlier stage, so
-- a retried run sends each stage once. last_sent_on is the building's day it
-- was sent. deadline_on is the last day to start proceedings, as StrataVerze
-- reads the rule (the oldest due date plus 2 years, plus 2 months).
--
-- A new table: no existing row is changed, and there are none to check.

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.proceedings_deadline_reminders (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id      uuid NOT NULL REFERENCES public.schemes(id) ON DELETE CASCADE,
  lot_id         uuid NOT NULL REFERENCES public.lots(id) ON DELETE CASCADE,
  oldest_due_on  date NOT NULL,
  deadline_on    date NOT NULL,
  last_stage     text NOT NULL,
  last_sent_on   date NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT proceedings_deadline_reminders_lot_id_oldest_due_on_key UNIQUE (lot_id, oldest_due_on),
  CONSTRAINT proceedings_deadline_reminders_last_stage_check CHECK (last_stage IN ('FLAGGED', 'DAYS_30', 'DAYS_14', 'DAYS_7', 'PASSED')),
  CONSTRAINT proceedings_deadline_reminders_deadline_check CHECK (deadline_on > oldest_due_on)
);
-- RLS on, no policies: the Data API is denied; the app connects as the owner.
ALTER TABLE public.proceedings_deadline_reminders ENABLE ROW LEVEL SECURITY;

COMMIT;
