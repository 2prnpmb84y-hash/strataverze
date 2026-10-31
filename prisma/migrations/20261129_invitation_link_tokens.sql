-- Invitation links that set up an account (security stage S2a, audit items
-- AR-002 and AR-041, 31 Oct 2026). Part 1 of 2. Idempotent. Applied by hand
-- in the Supabase SQL editor, like the other migrations, and ONLY with
-- Matthew Wrigley's approval, after the rolled-back rehearsal in
-- prisma/rehearsals/20261129_invitation_link_tokens_rehearsal.sql.
--
-- Status: NOT APPLIED. Written only: not applied or rehearsed anywhere.
--
-- When to apply: BEFORE the S2a code deploys. The app's ORM lists every
-- column of its contract in each query of invitations, so the S2a code fails
-- against a table without token_hash, token_used_at and account_auth_id
-- everywhere it reads or writes an invitation (the members page, sending,
-- revoking and accepting one, the Invitations page and the /join page). The
-- code deployed now keeps working against the new table: the new columns are
-- nullable and it never names them, and the old `token` column keeps its
-- default, so its inserts still work.
--
-- What changes:
-- token_hash: the SHA-256 (64 lower-case hex characters) of the random token
--   in the emailed /join link. The token itself is never stored, so reading
--   the table does not give anyone a working link. Unique. Null for
--   invitations made before S2a, which are accepted from /invitations by
--   email match only, as today.
-- token_used_at: when the link was used. The app claims the link with a
--   conditional update (token_used_at IS NULL) before anything else changes,
--   so a link works once. Sending the invitation again issues a new token
--   and clears it.
-- account_auth_id: the Supabase Auth user the server created for the
--   invitee when their address had no account (created unconfirmed and with
--   no password; the invitee sets the password from the link). Null when the
--   address already had an account. If that Auth user is deleted, the column
--   is cleared (ON DELETE SET NULL) and the link then asks the person to
--   sign in instead. Indexed (partial, non-null only): setting a password
--   from a link locks every pending invitation for the account at once
--   (review finding L2), and deleting an Auth user clears the column.
--
-- The old plain `token` column (a uuid, unique) is left in place here,
-- because the code deployed now still lists it. Nothing has ever used it as
-- a credential: the emailed link went to /invitations, and acceptance there
-- checks the signed-in person's email. It is dropped by part 2
-- (20261130_invitation_plain_token_drop.sql) once S2a is deployed.
--
-- Data API: invitations has RLS on and no grants to anon or authenticated
-- since S0 (SEC-005). New columns follow the table's grants; nothing here
-- grants anything.

BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS token_hash text;
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS token_used_at timestamptz;
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS account_auth_id uuid;

ALTER TABLE public.invitations DROP CONSTRAINT IF EXISTS invitations_token_hash_check;
ALTER TABLE public.invitations ADD CONSTRAINT invitations_token_hash_check
  CHECK (token_hash IS NULL OR token_hash ~ '^[0-9a-f]{64}$');

CREATE UNIQUE INDEX IF NOT EXISTS invitations_token_hash_key ON public.invitations (token_hash);

ALTER TABLE public.invitations DROP CONSTRAINT IF EXISTS invitations_account_auth_id_fkey;
ALTER TABLE public.invitations ADD CONSTRAINT invitations_account_auth_id_fkey
  FOREIGN KEY (account_auth_id) REFERENCES auth.users (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS invitations_account_auth_id_idx
  ON public.invitations (account_auth_id) WHERE account_auth_id IS NOT NULL;

COMMIT;
