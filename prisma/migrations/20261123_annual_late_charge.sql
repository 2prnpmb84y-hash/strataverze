-- The annual resolved rate and the one-case waiver (VIC, ACT and WA stage 2,
-- PR 5, 28 Oct 2026). Idempotent. Applied by hand in the Supabase SQL editor,
-- like the other migrations, and only with Matthew Wrigley's approval.
--
-- When to apply: BEFORE the code deploys. The ORM selects every column of
-- schemes, so the new code fails against the old table. The old code works
-- against the new table (the new column is nullable, with no default; the
-- new mode is never written by it; the new table is not read by it).
--
-- schemes.late_charge_annual_rate_percent: the yearly rate a recorded
-- resolution set (interest_mode RESOLVED_ANNUAL_RATE), within the building's
-- pack range (ACT 0 to 20% by special resolution; WA 0 up to but not
-- including 11%; Victoria up to the Penalty Interest Rates Act maximum). As
-- with late_charge_monthly_rate_percent (migration 20261114), the database
-- keeps the shape and the app the pack's range: a rate is held exactly when
-- the mode is RESOLVED_ANNUAL_RATE, from 0 to 100 (0 is allowed: the ACT and
-- WA ranges start at 0). Held for a Victorian, ACT or Western Australian
-- building only. The resolution check (migration 20261114) already needs the
-- meeting and motion for every mode except STATUTORY and NONE, so it covers
-- RESOLVED_ANNUAL_RATE unchanged.
--
-- late_charge_waivers: a waiver of the late charge on one levy notice in a
-- particular case (Victoria s 29(3); WA s 100(4)(b) "in a particular case"):
-- all of it (WHOLE), an amount (AMOUNT, amount) or the days of a period
-- (PERIOD, from_date to to_date, both included). decided_by is the kind of
-- resolution the pack asks for (GENERAL_MEETING, ORDINARY or SPECIAL), with
-- the meeting and motion that decided it and the meeting's day (decided_on).
-- reasons is required by the app where decisions go to the AGM (Victoria
-- s 29(4)). rule_pack is the pack it was recorded under; recorded_by and
-- recorded_at who recorded it and when. The meeting and motion keys use the
-- default NO ACTION (checked at the end of the statement, unlike RESTRICT),
-- so deleting a building, which cascades to its meetings and to its waivers
-- in the same statement, is not blocked, while deleting only a meeting or
-- motion a waiver relies on still is. (SET NULL, as the budget adoption keys
-- in 20261023_statutory_reporting use, cannot apply: these columns are NOT
-- NULL.) A waiver is recorded once for each notice, motion
-- and kind (unique index). Which kinds are allowed, and who decides, is the
-- app's check from the pack.
--
-- Every existing row passes, by construction (not by reading the data): the
-- new column starts null on every row; no row can hold RESOLVED_ANNUAL_RATE
-- (the old mode check forbids it), so the rate check holds; the state check
-- holds for a null rate; and the widened mode check allows every old value.
-- schemes_state_has_rule_pack_check allows NSW and QLD buildings only (after
-- #126), so no building can hold a yearly rate yet. The new table starts
-- empty. NSW and Queensland rows are unchanged.

BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.schemes ADD COLUMN IF NOT EXISTS late_charge_annual_rate_percent numeric(5,2);

ALTER TABLE public.schemes DROP CONSTRAINT IF EXISTS schemes_interest_mode_check;
ALTER TABLE public.schemes ADD CONSTRAINT schemes_interest_mode_check
  CHECK (interest_mode IN ('STATUTORY', 'NO_INTEREST', 'NONE', 'RESOLVED_RATE', 'RESOLVED_ANNUAL_RATE'));

-- A yearly rate is held exactly when the mode is RESOLVED_ANNUAL_RATE, from 0 to 100.
ALTER TABLE public.schemes DROP CONSTRAINT IF EXISTS schemes_late_charge_annual_rate_check;
ALTER TABLE public.schemes ADD CONSTRAINT schemes_late_charge_annual_rate_check
  CHECK ((interest_mode = 'RESOLVED_ANNUAL_RATE') = (late_charge_annual_rate_percent IS NOT NULL)
         AND (late_charge_annual_rate_percent IS NULL OR (late_charge_annual_rate_percent >= 0 AND late_charge_annual_rate_percent <= 100)));

-- A yearly rate is held for a Victorian, ACT or Western Australian building only.
ALTER TABLE public.schemes DROP CONSTRAINT IF EXISTS schemes_late_charge_annual_rate_state_check;
ALTER TABLE public.schemes ADD CONSTRAINT schemes_late_charge_annual_rate_state_check
  CHECK (late_charge_annual_rate_percent IS NULL OR state IN ('VIC', 'ACT', 'WA'));

CREATE TABLE IF NOT EXISTS public.late_charge_waivers (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id             uuid NOT NULL REFERENCES public.schemes(id) ON DELETE CASCADE,
  levy_notice_id        uuid NOT NULL REFERENCES public.levy_notices(id) ON DELETE CASCADE,
  kind                  text NOT NULL,
  amount                numeric(12,2),
  from_date             date,
  to_date               date,
  decided_by            text NOT NULL,
  resolution_meeting_id uuid NOT NULL REFERENCES public.meetings(id),
  resolution_motion_id  uuid NOT NULL REFERENCES public.agenda_items(id),
  decided_on            date NOT NULL,
  reasons               text,
  rule_pack             varchar(40) NOT NULL,
  recorded_by           uuid NOT NULL,
  recorded_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT late_charge_waivers_kind_check CHECK (kind IN ('WHOLE', 'AMOUNT', 'PERIOD')),
  CONSTRAINT late_charge_waivers_amount_check
    CHECK ((kind = 'AMOUNT') = (amount IS NOT NULL) AND (amount IS NULL OR amount > 0)),
  CONSTRAINT late_charge_waivers_period_check
    CHECK ((kind = 'PERIOD') = (from_date IS NOT NULL AND to_date IS NOT NULL)
           AND (kind = 'PERIOD' OR (from_date IS NULL AND to_date IS NULL))
           AND (from_date IS NULL OR to_date IS NULL OR from_date <= to_date)),
  CONSTRAINT late_charge_waivers_decided_by_check CHECK (decided_by IN ('GENERAL_MEETING', 'ORDINARY', 'SPECIAL'))
);
CREATE INDEX IF NOT EXISTS late_charge_waivers_levy_notice_id_idx ON public.late_charge_waivers (levy_notice_id);
CREATE UNIQUE INDEX IF NOT EXISTS late_charge_waivers_levy_notice_id_resolution_motion_id_kin_key
  ON public.late_charge_waivers (levy_notice_id, resolution_motion_id, kind);
CREATE INDEX IF NOT EXISTS late_charge_waivers_scheme_id_idx ON public.late_charge_waivers (scheme_id);
-- RLS on, no policies: the Data API is denied; the app connects as the owner.
ALTER TABLE public.late_charge_waivers ENABLE ROW LEVEL SECURITY;

COMMIT;
