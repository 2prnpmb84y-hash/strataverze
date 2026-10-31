-- A change of owner recorded by a committee member is held for review
-- (security finding H-1, founder decision 31 Oct 2026). Idempotent. Applied
-- by hand in the Supabase SQL editor, like the other migrations, and ONLY with
-- Matthew Wrigley's approval, after the rolled-back rehearsal in
-- prisma/rehearsals/20261201_owner_change_requests_rehearsal.sql.
--
-- Status: NOT APPLIED. Written only: not applied or rehearsed anywhere.
--
-- Numbering: 20261129 and 20261130 are taken on remediation/s2a (invitation
-- link tokens), so this is 20261201. It touches no table those change.
--
-- When to apply: BEFORE the H-1 code deploys. The new code reads this table on
-- the Adviser's and the committee's lot pages and on /admin/owner-changes, and
-- writes it whenever a change of owner is recorded, confirmed or rejected; it
-- fails against a database without it. The code deployed now never reads it.
--
-- Why: the committee holds roll.manage and could record a change of owner to
-- its own address, ending the real owner's access and receiving the OWNER
-- invitation. Now a change recorded by a committee member (not the Adviser or
-- a platform admin) is stored here as PENDING and nothing else changes: the
-- strata roll, the outgoing owner's portal access and committee seat and the
-- delivery preferences stay as they are, and no invitation is created. The
-- scheme's Adviser, or a platform admin (the only reviewer for a building with
-- no Adviser), confirms it (CONFIRMED: the app then applies exactly what an
-- Adviser's change of owner applies, and sends the invitation if asked) or
-- rejects it (REJECTED: nothing changes). The app claims the row with a
-- conditional update (status = 'PENDING'), so of two decisions at once only
-- one wins.
--
-- owner_change_requests: the new owner's details as the committee member
-- entered them (owner_email lower case, as the app stores it), the settlement
-- date, whether to invite the new owner, the notice of transfer filed when the
-- change was recorded (notice_document_id; cleared if that document is ever
-- deleted outright), who recorded it and when, and who decided it and when.
-- One PENDING row for each lot (owner_change_requests_one_pending_per_lot_idx):
-- a second change for the same lot is refused until the first is decided.
-- That the lot is the building's is checked by the app (lots has no
-- (id, scheme_id) key, as noted in 20261128).
--
-- A trigger refuses any change to what was recorded, and any change to a
-- decided row, except clearing notice_document_id (the document key's
-- ON DELETE SET NULL). Rows are not deleted by the app; they go with the lot
-- or the building (ON DELETE CASCADE).
--
-- Every existing row passes, by construction (not by reading the data): the
-- table is new and starts empty, and no existing table gains a column, a
-- check or a trigger.
--
-- The index names are the ones the emitted contract (src/prisma/contract.json)
-- expects, each within Postgres's 63-character limit. The partial unique
-- index is not in the contract (Prisma cannot express it); the app does not
-- depend on its name.

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.owner_change_requests (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id          uuid NOT NULL,
  lot_id             uuid NOT NULL,
  status             text NOT NULL DEFAULT 'PENDING',
  owner_name         text NOT NULL,
  owner_email        text,
  owner_mobile       text,
  owner_phone        text,
  owner_address      text,
  settlement_date    date NOT NULL,
  invite             boolean NOT NULL DEFAULT false,
  notice_document_id uuid,
  recorded_by        uuid NOT NULL,
  recorded_at        timestamptz NOT NULL DEFAULT now(),
  decided_by         uuid,
  decided_at         timestamptz,
  CONSTRAINT owner_change_requests_scheme_id_fkey FOREIGN KEY (scheme_id) REFERENCES public.schemes(id) ON DELETE CASCADE,
  CONSTRAINT owner_change_requests_lot_id_fkey FOREIGN KEY (lot_id) REFERENCES public.lots(id) ON DELETE CASCADE,
  CONSTRAINT owner_change_requests_notice_document_id_fkey FOREIGN KEY (notice_document_id) REFERENCES public.documents(id) ON DELETE SET NULL,
  CONSTRAINT owner_change_requests_status_check CHECK (status IN ('PENDING', 'CONFIRMED', 'REJECTED')),
  -- Decided exactly when it has a decider and a time.
  CONSTRAINT owner_change_requests_decided_check CHECK (
    (status = 'PENDING') = (decided_at IS NULL) AND (decided_at IS NULL) = (decided_by IS NULL)),
  CONSTRAINT owner_change_requests_owner_name_check CHECK (length(btrim(owner_name)) BETWEEN 1 AND 500),
  CONSTRAINT owner_change_requests_owner_email_check CHECK (
    owner_email IS NULL OR (owner_email = lower(btrim(owner_email)) AND length(owner_email) BETWEEN 3 AND 255)),
  -- An invitation needs an address to go to.
  CONSTRAINT owner_change_requests_invite_check CHECK (NOT invite OR owner_email IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS owner_change_requests_scheme_id_status_idx ON public.owner_change_requests (scheme_id, status);
CREATE INDEX IF NOT EXISTS owner_change_requests_lot_id_idx ON public.owner_change_requests (lot_id);
-- One change waiting for each lot.
CREATE UNIQUE INDEX IF NOT EXISTS owner_change_requests_one_pending_per_lot_idx
  ON public.owner_change_requests (lot_id) WHERE status = 'PENDING';
-- RLS on, no policies: the Data API is denied; the app connects as the owner.
-- The default privileges from 20261023_close_data_api already give the
-- browser roles nothing on a new table; revoked again here as a second guard.
ALTER TABLE public.owner_change_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.owner_change_requests FROM anon, authenticated;

-- What was recorded never changes; a decided row never changes (except losing
-- its notice key when that document is deleted).
CREATE OR REPLACE FUNCTION public.owner_change_requests_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF (NEW.id, NEW.scheme_id, NEW.lot_id, NEW.owner_name, NEW.owner_email, NEW.owner_mobile, NEW.owner_phone,
      NEW.owner_address, NEW.settlement_date, NEW.invite, NEW.recorded_by, NEW.recorded_at)
     IS DISTINCT FROM
     (OLD.id, OLD.scheme_id, OLD.lot_id, OLD.owner_name, OLD.owner_email, OLD.owner_mobile, OLD.owner_phone,
      OLD.owner_address, OLD.settlement_date, OLD.invite, OLD.recorded_by, OLD.recorded_at)
     OR (NEW.notice_document_id IS DISTINCT FROM OLD.notice_document_id AND NEW.notice_document_id IS NOT NULL) THEN
    RAISE EXCEPTION 'StrataVerze: change of owner request %: what was recorded cannot change', OLD.id USING ERRCODE = '23514';
  END IF;
  IF OLD.status <> 'PENDING'
     AND (NEW.status, NEW.decided_by, NEW.decided_at) IS DISTINCT FROM (OLD.status, OLD.decided_by, OLD.decided_at) THEN
    RAISE EXCEPTION 'StrataVerze: change of owner request % is decided and cannot change', OLD.id USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.owner_change_requests_guard() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS owner_change_requests_guard ON public.owner_change_requests;
CREATE TRIGGER owner_change_requests_guard BEFORE UPDATE ON public.owner_change_requests
  FOR EACH ROW EXECUTE FUNCTION public.owner_change_requests_guard();

COMMIT;
