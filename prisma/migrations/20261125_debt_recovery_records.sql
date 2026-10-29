-- Debt recovery records for the draft packs (VIC, ACT and WA stage 2, PR 9a,
-- 29 Oct 2026). Idempotent. Applied by hand in the Supabase SQL editor, like
-- the other migrations, and only with Matthew Wrigley's approval (approved in
-- principle on 29 Oct 2026, decision D1: rehearse it and ask again before it
-- is applied).
--
-- When to apply: NOT needed before the code deploys. Only a pack with
-- DEBT_RECOVERY.forum, authorityToSue, statutoryCharge or finalNotice reads
-- or writes this table, and those are the draft Victorian, ACT and Western
-- Australian packs, which have no buildings:
-- schemes_state_has_rule_pack_check (20261122) allows NSW and QLD buildings
-- only, and no NSW or Queensland code path reads the table. It MUST be
-- applied before any of VIC, ACT or WA is switched on (moved to RULE_PACKS),
-- or debt recovery for that state fails when a step records a fact.
--
-- debt_recovery_records: facts recorded on a debt recovery case under a
-- draft pack's recovery rules, written in the same transaction as the step
-- that records them. AUTHORITY_TO_SUE: the resolution that decided to start
-- proceedings (the meeting, the agenda item and what kind of resolution it
-- was accepted as: GENERAL_MEETING, ORDINARY, SPECIAL or COMMITTEE), the day
-- it took effect (decided_on) and the case's amount owing then (amount).
-- PROCEEDINGS_STARTED: where proceedings were started (forum: VCAT, ACAT or
-- COURT, from the pack's options; a pack's excluded forum, such as SAT in
-- Western Australia, is refused by the app). From PR 9b and 9c:
-- FINAL_NOTICE_GIVEN, STATUTORY_CHARGE_LODGED (with its resolution, if any)
-- and STATUTORY_CHARGE_REVOKED, each with the day lodged. rule_pack is the
-- pack it was recorded under; recorded_by and recorded_at who recorded it and
-- when. The meeting and agenda item keys use the default NO ACTION (checked
-- at the end of the statement), as for late_charge_waivers (20261123):
-- deleting a building, which cascades to its meetings and its cases in the
-- same statement, is not blocked, while deleting only a meeting or item a
-- record relies on is. The legacy debt_recovery_cases.approval_motion_id
-- (a key to the old motions table) is not used.
--
-- Every existing row passes, by construction (not by reading the data): the
-- table is new and starts empty, and no existing table gains a column, a
-- check or a trigger. No NSW or Queensland row changes.
--
-- The index names are the ones the emitted contract (src/prisma/contract.json)
-- expects, and every name is within Postgres's 63-character limit.

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.debt_recovery_records (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id               uuid NOT NULL,
  scheme_id             uuid NOT NULL,
  state                 text NOT NULL,
  kind                  text NOT NULL,
  decided_on            date NOT NULL,
  resolution_meeting_id uuid,
  resolution_item_id    uuid,
  resolution_kind       text,
  amount                numeric(12,2),
  forum                 text,
  lodged_on             date,
  rule_pack             varchar(40) NOT NULL,
  recorded_by           uuid NOT NULL,
  recorded_at           timestamptz NOT NULL DEFAULT now(),
  notes                 text,
  CONSTRAINT debt_recovery_records_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.debt_recovery_cases(id) ON DELETE CASCADE,
  CONSTRAINT debt_recovery_records_scheme_id_fkey FOREIGN KEY (scheme_id) REFERENCES public.schemes(id) ON DELETE CASCADE,
  CONSTRAINT debt_recovery_records_resolution_meeting_id_fkey FOREIGN KEY (resolution_meeting_id) REFERENCES public.meetings(id),
  CONSTRAINT debt_recovery_records_resolution_item_id_fkey FOREIGN KEY (resolution_item_id) REFERENCES public.agenda_items(id),
  -- Draft packs only: no NSW or Queensland record can be written.
  CONSTRAINT debt_recovery_records_state_check CHECK (state IN ('VIC', 'ACT', 'WA')),
  CONSTRAINT debt_recovery_records_kind_check CHECK (kind IN ('AUTHORITY_TO_SUE', 'FINAL_NOTICE_GIVEN', 'PROCEEDINGS_STARTED', 'STATUTORY_CHARGE_LODGED', 'STATUTORY_CHARGE_REVOKED')),
  -- A resolution is the meeting, the item and its kind together; the authority always has one, and only the authority and a lodged charge may.
  CONSTRAINT debt_recovery_records_resolution_check CHECK (
    (resolution_meeting_id IS NULL) = (resolution_item_id IS NULL)
    AND (resolution_item_id IS NULL) = (resolution_kind IS NULL)
    AND (kind <> 'AUTHORITY_TO_SUE' OR resolution_item_id IS NOT NULL)
    AND (kind IN ('AUTHORITY_TO_SUE', 'STATUTORY_CHARGE_LODGED') OR resolution_item_id IS NULL)
    AND (resolution_kind IS NULL OR resolution_kind IN ('GENERAL_MEETING', 'ORDINARY', 'SPECIAL', 'COMMITTEE'))),
  -- The amount owing is held for the authority only, never below 0.
  CONSTRAINT debt_recovery_records_amount_check CHECK ((kind = 'AUTHORITY_TO_SUE') = (amount IS NOT NULL) AND (amount IS NULL OR amount >= 0)),
  -- Where proceedings were started is held for PROCEEDINGS_STARTED only.
  CONSTRAINT debt_recovery_records_forum_check CHECK ((kind = 'PROCEEDINGS_STARTED') = (forum IS NOT NULL) AND (forum IS NULL OR forum IN ('VCAT', 'ACAT', 'COURT'))),
  -- The day lodged is held for the statutory charge and its revocation only.
  CONSTRAINT debt_recovery_records_lodged_check CHECK ((kind IN ('STATUTORY_CHARGE_LODGED', 'STATUTORY_CHARGE_REVOKED')) = (lodged_on IS NOT NULL))
);
-- A case's records of a kind (it also serves the key to debt_recovery_cases, its first column).
CREATE INDEX IF NOT EXISTS debt_recovery_records_case_id_kind_idx ON public.debt_recovery_records (case_id, kind);
CREATE INDEX IF NOT EXISTS debt_recovery_records_scheme_id_idx ON public.debt_recovery_records (scheme_id);
-- RLS on, no policies: the Data API is denied; the app connects as the owner.
ALTER TABLE public.debt_recovery_records ENABLE ROW LEVEL SECURITY;

COMMIT;
