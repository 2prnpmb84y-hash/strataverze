-- Resolutions decided or taking effect after the meeting (VIC, ACT and WA
-- stage 2, PR 8b-i, 29 Oct 2026; WA's voting period uses the same tables from
-- PR 8b-ii). Idempotent. Applied by hand in the Supabase SQL editor, like the
-- other migrations, and only with Matthew Wrigley's approval (approved in
-- principle on 29 Oct 2026, decision D19: rehearse it and ask again before it
-- is applied).
--
-- When to apply: BEFORE the code deploys. The new code reads and writes these
-- tables (the daily run /api/cron/pending-resolutions, the meeting page of a
-- Victorian or ACT building, conduct and the late charge waiver); it fails
-- against a database without them. The old code never reads them.
--
-- pending_resolutions: one row for each agenda item whose count at the
-- meeting gives a resolution decided or taking effect later: Victoria's
-- interim special resolution (OCA s 97, INTERIM_SPECIAL) and interim
-- resolution of a meeting without a quorum (s 78, INTERIM_NO_QUORUM), the
-- ACT's reduced quorum decision (UTMA sch 3 ss 3.10, 3.11, REDUCED_QUORUM)
-- and, from PR 8b-ii, Western Australia's voting period (STA s 121,
-- VOTING_PERIOD). It is opened at conduct, in the same transaction that
-- stores the agenda item with status and outcome INTERIM, and decided once
-- (CARRIED or LOST, with how it ended) by the daily run or an adviser's
-- record, in the same transaction that sets the item to CARRIED/RESOLVED or
-- LOST/MOTION_LOST. made_on is the later of the meeting's day and the day it
-- was recorded, in the building's time zone; window_closes_on is the last day
-- a petition or notice can arrive (made_on + 29 days in Victoria, + 28 in the
-- ACT); effective_on the day a carried one took effect. rule holds the pack's
-- pending rule and the category's rule at the meeting, and meeting_votes the
-- votes, the votes not counted and the tally, so a later pack change never
-- moves its dates or tests. The meeting and agenda item keys use the default
-- NO ACTION: deleting only a meeting or item a row relies on is blocked, as
-- for late_charge_waivers (20261123). Deleting a building does not cascade
-- cleanly in every case: it fails where petition lot rows exist
-- (pending_resolution_lots.lot_id is a NO ACTION key to lots), as it does for
-- the other NO ACTION references to lots. Such a building's petition lot rows
-- must be dealt with before it can be deleted.
--
-- pending_resolution_lots: the lots that signed a petition (PETITION), and
-- from PR 8b-ii the late written votes (LATE_VOTE, FOR or AGAINST), one row
-- for each lot and entry.
--
-- A trigger refuses any change to a decided row, and any change to the facts
-- of a row or to a date once recorded (the notice, the special general
-- meeting notice). The lot rows are never updated. Neither table has a delete
-- guard (deleting a building still fails where petition lot rows exist, as
-- above).
--
-- Every existing row passes, by construction (not by reading the data): both
-- tables are new and start empty, and no existing table gains a column, a
-- check or a trigger. schemes_state_has_rule_pack_check (20261122) allows NSW
-- and QLD buildings only, so no row can be written until a Victorian or ACT
-- pack goes live. NSW and Queensland rows are unchanged.
--
-- agenda_items has no check constraints (checked on the live database on
-- 28 Oct 2026; verify before applying:
--   SELECT conname FROM pg_constraint WHERE conrelid = 'public.agenda_items'::regclass AND contype = 'c';
-- expect 0 rows), so its new status and outcome value INTERIM (and OPEN from
-- PR 8b-ii) needs nothing here. A check added to agenda_items later must allow
-- them, or conduct of a Victorian or ACT building breaks.
--
-- The index names are the ones the emitted contract (src/prisma/contract.json)
-- expects, each within Postgres's 63-character limit.

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.pending_resolutions (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id                 uuid NOT NULL,
  meeting_id                uuid NOT NULL,
  agenda_item_id            uuid NOT NULL,
  state                     text NOT NULL,
  kind                      text NOT NULL,
  category                  text NOT NULL,
  takes_effect_as           text NOT NULL,
  status                    text NOT NULL DEFAULT 'PENDING',
  made_on                   date NOT NULL,
  window_closes_on          date NOT NULL,
  notice_due_on             date,
  notice_given_on           date,
  petition_received_on      date,
  meeting_notice_given_on   date,
  meeting_notice_meeting_id uuid,
  meeting_held_by           date,
  confirmed_meeting_id      uuid,
  confirmed_item_id         uuid,
  effective_on              date,
  ended_by                  text,
  decided_at                timestamptz,
  decided_by                uuid,
  meeting_votes             jsonb NOT NULL,
  rule                      jsonb NOT NULL,
  rule_pack                 varchar(40) NOT NULL,
  recorded_by               uuid NOT NULL,
  created_at                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pending_resolutions_scheme_id_fkey FOREIGN KEY (scheme_id) REFERENCES public.schemes(id) ON DELETE CASCADE,
  CONSTRAINT pending_resolutions_meeting_id_fkey FOREIGN KEY (meeting_id) REFERENCES public.meetings(id),
  CONSTRAINT pending_resolutions_agenda_item_id_fkey FOREIGN KEY (agenda_item_id) REFERENCES public.agenda_items(id),
  CONSTRAINT pending_resolutions_meeting_notice_meeting_id_fkey FOREIGN KEY (meeting_notice_meeting_id) REFERENCES public.meetings(id),
  CONSTRAINT pending_resolutions_confirmed_meeting_id_fkey FOREIGN KEY (confirmed_meeting_id) REFERENCES public.meetings(id),
  CONSTRAINT pending_resolutions_confirmed_item_id_fkey FOREIGN KEY (confirmed_item_id) REFERENCES public.agenda_items(id),
  CONSTRAINT pending_resolutions_state_kind_check CHECK (
       (state = 'VIC' AND kind IN ('INTERIM_SPECIAL', 'INTERIM_NO_QUORUM'))
    OR (state = 'ACT' AND kind = 'REDUCED_QUORUM')
    OR (state = 'WA'  AND kind = 'VOTING_PERIOD')),
  -- Victoria's interim special resolution is a special resolution item that takes effect as one; every other kind takes effect as its own category.
  CONSTRAINT pending_resolutions_category_check CHECK (
    category ~ '^[A-Z_]{1,40}$' AND takes_effect_as ~ '^[A-Z_]{1,40}$'
    AND (kind <> 'INTERIM_SPECIAL' OR (category = 'SPECIAL' AND takes_effect_as = 'SPECIAL'))
    AND (kind = 'INTERIM_SPECIAL' OR takes_effect_as = category)),
  CONSTRAINT pending_resolutions_status_check CHECK (status IN ('PENDING', 'CARRIED', 'LOST')),
  CONSTRAINT pending_resolutions_window_check CHECK (window_closes_on > made_on),
  CONSTRAINT pending_resolutions_decided_check CHECK (
    (status = 'PENDING') = (ended_by IS NULL) AND (ended_by IS NULL) = (decided_at IS NULL)),
  CONSTRAINT pending_resolutions_effective_check CHECK (
    (status = 'CARRIED') = (effective_on IS NOT NULL) AND (effective_on IS NULL OR effective_on > made_on)),
  CONSTRAINT pending_resolutions_ended_by_check CHECK (
       ended_by IS NULL
    OR (kind = 'INTERIM_SPECIAL'   AND ((ended_by = 'PERIOD_ENDED' AND status = 'CARRIED') OR (ended_by = 'PETITION' AND status = 'LOST')))
    OR (kind = 'INTERIM_NO_QUORUM' AND ((ended_by IN ('PERIOD_ENDED', 'CONFIRMED', 'MEETING_NOT_HELD') AND status = 'CARRIED')
                                        OR (ended_by = 'NOT_CONFIRMED' AND status = 'LOST')))
    OR (kind = 'REDUCED_QUORUM'    AND ((ended_by IN ('PERIOD_ENDED', 'CONFIRMED') AND status = 'CARRIED') OR (ended_by = 'PETITION' AND status = 'LOST')))
    OR (kind = 'VOTING_PERIOD'     AND ended_by = 'VOTES_AT_CLOSE')),
  CONSTRAINT pending_resolutions_notice_check CHECK (
    (notice_due_on IS NULL OR notice_due_on >= made_on) AND (notice_given_on IS NULL OR notice_given_on >= made_on)),
  -- A petition is recorded only within the window, and recording it decides the row (LOST) in the same update.
  CONSTRAINT pending_resolutions_petition_check CHECK (
    (petition_received_on IS NULL) = (COALESCE(ended_by, '') <> 'PETITION')
    AND (petition_received_on IS NULL OR (kind IN ('INTERIM_SPECIAL', 'REDUCED_QUORUM')
         AND petition_received_on BETWEEN made_on AND window_closes_on))),
  -- Victoria s 78: a special general meeting notice within the window, and the day that meeting must be held by.
  CONSTRAINT pending_resolutions_meeting_notice_check CHECK (
    (meeting_notice_given_on IS NULL) = (meeting_held_by IS NULL)
    AND (meeting_notice_meeting_id IS NULL OR meeting_notice_given_on IS NOT NULL)
    AND (meeting_notice_given_on IS NULL OR (kind = 'INTERIM_NO_QUORUM'
         AND meeting_notice_given_on BETWEEN made_on AND window_closes_on AND meeting_held_by > meeting_notice_given_on))
    AND (COALESCE(ended_by, '') NOT IN ('NOT_CONFIRMED', 'MEETING_NOT_HELD') OR kind <> 'INTERIM_NO_QUORUM' OR meeting_notice_given_on IS NOT NULL)),
  CONSTRAINT pending_resolutions_confirmed_check CHECK (
    (confirmed_meeting_id IS NULL) = (confirmed_item_id IS NULL)
    AND (confirmed_item_id IS NOT NULL) = (COALESCE(ended_by, '') IN ('CONFIRMED', 'NOT_CONFIRMED'))),
  CONSTRAINT pending_resolutions_json_check CHECK (jsonb_typeof(meeting_votes) = 'object' AND jsonb_typeof(rule) = 'object')
);
-- One row for each agenda item: a second insert for the same item fails.
CREATE UNIQUE INDEX IF NOT EXISTS pending_resolutions_agenda_item_id_key ON public.pending_resolutions (agenda_item_id);
CREATE INDEX IF NOT EXISTS pending_resolutions_scheme_id_idx ON public.pending_resolutions (scheme_id);
CREATE INDEX IF NOT EXISTS pending_resolutions_meeting_id_idx ON public.pending_resolutions (meeting_id);
-- The daily run reads the pending rows whose window has closed.
CREATE INDEX IF NOT EXISTS pending_resolutions_status_window_closes_on_idx ON public.pending_resolutions (status, window_closes_on);
-- RLS on, no policies: the Data API is denied; the app connects as the owner.
ALTER TABLE public.pending_resolutions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.pending_resolution_lots (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pending_resolution_id uuid NOT NULL,
  lot_id                uuid NOT NULL,
  entry                 text NOT NULL,
  vote                  text,
  received_on           date NOT NULL,
  recorded_by           uuid NOT NULL,
  recorded_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pending_resolution_lots_pending_resolution_id_fkey FOREIGN KEY (pending_resolution_id) REFERENCES public.pending_resolutions(id) ON DELETE CASCADE,
  CONSTRAINT pending_resolution_lots_lot_id_fkey FOREIGN KEY (lot_id) REFERENCES public.lots(id),
  CONSTRAINT pending_resolution_lots_entry_check CHECK (entry IN ('LATE_VOTE', 'PETITION')),
  CONSTRAINT pending_resolution_lots_vote_check CHECK ((entry = 'LATE_VOTE') = (vote IS NOT NULL) AND (vote IS NULL OR vote IN ('FOR', 'AGAINST')))
);
-- One entry of each kind for each lot. It also serves the key to pending_resolutions (its first column).
CREATE UNIQUE INDEX IF NOT EXISTS pending_resolution_lots_pending_resolution_id_lot_id_entry_key
  ON public.pending_resolution_lots (pending_resolution_id, lot_id, entry);
ALTER TABLE public.pending_resolution_lots ENABLE ROW LEVEL SECURITY;

-- A decided row never changes, and neither do its facts or a date once recorded.
CREATE OR REPLACE FUNCTION public.pending_resolutions_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.status <> 'PENDING' THEN
    RAISE EXCEPTION 'StrataVerze: pending resolution % is decided and cannot change', OLD.id USING ERRCODE = '23514';
  END IF;
  IF (NEW.scheme_id, NEW.meeting_id, NEW.agenda_item_id, NEW.state, NEW.kind, NEW.category, NEW.takes_effect_as,
      NEW.made_on, NEW.window_closes_on, NEW.notice_due_on, NEW.meeting_votes, NEW.rule, NEW.rule_pack, NEW.recorded_by, NEW.created_at)
     IS DISTINCT FROM
     (OLD.scheme_id, OLD.meeting_id, OLD.agenda_item_id, OLD.state, OLD.kind, OLD.category, OLD.takes_effect_as,
      OLD.made_on, OLD.window_closes_on, OLD.notice_due_on, OLD.meeting_votes, OLD.rule, OLD.rule_pack, OLD.recorded_by, OLD.created_at)
     OR (OLD.notice_given_on IS NOT NULL AND NEW.notice_given_on IS DISTINCT FROM OLD.notice_given_on)
     OR (OLD.meeting_notice_given_on IS NOT NULL AND (NEW.meeting_notice_given_on, NEW.meeting_held_by, NEW.meeting_notice_meeting_id)
           IS DISTINCT FROM (OLD.meeting_notice_given_on, OLD.meeting_held_by, OLD.meeting_notice_meeting_id)) THEN
    RAISE EXCEPTION 'StrataVerze: pending resolution %: a recorded fact cannot change', OLD.id USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.pending_resolutions_guard() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS pending_resolutions_guard ON public.pending_resolutions;
CREATE TRIGGER pending_resolutions_guard BEFORE UPDATE ON public.pending_resolutions
  FOR EACH ROW EXECUTE FUNCTION public.pending_resolutions_guard();

CREATE OR REPLACE FUNCTION public.pending_resolution_lots_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'StrataVerze: pending_resolution_lots rows are not updated' USING ERRCODE = '23514';
END;
$$;
REVOKE EXECUTE ON FUNCTION public.pending_resolution_lots_append_only() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS pending_resolution_lots_append_only ON public.pending_resolution_lots;
CREATE TRIGGER pending_resolution_lots_append_only BEFORE UPDATE ON public.pending_resolution_lots
  FOR EACH ROW EXECUTE FUNCTION public.pending_resolution_lots_append_only();

COMMIT;
