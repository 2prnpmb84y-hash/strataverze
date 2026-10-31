-- Invitation links (security stage S2a). Part 2 of 2: drop the old plain
-- `token` column. Idempotent. Applied by hand in the Supabase SQL editor, and
-- ONLY with Matthew Wrigley's approval, after the rolled-back rehearsal in
-- prisma/rehearsals/20261129_invitation_link_tokens_rehearsal.sql (which
-- runs both parts).
--
-- Status: NOT APPLIED. Written only: not applied or rehearsed anywhere.
--
-- When to apply: AFTER the S2a code is deployed, never before. The code
-- deployed before S2a lists `token` in every query of invitations, so
-- dropping it first breaks the members page and every invitation action.
-- The S2a contract no longer has the column, so from S2a on nothing reads
-- or writes it.
--
-- Why: the column held a plain uuid "token" that nothing ever used as a
-- credential, but a reader could mistake it for one. The S2a link token is
-- stored only as a SHA-256 (token_hash, part 1). Dropping the column also
-- drops its unique index (invitations_token_key).

BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.invitations DROP COLUMN IF EXISTS token;

COMMIT;
