-- Invitation links (security stage S2a). Part 2 of 2: drop the old plain
-- `token` column. Idempotent. Applied by hand in the Supabase SQL editor, and
-- ONLY with Matthew Wrigley's approval, after the rolled-back rehearsal in
-- prisma/rehearsals/20261129_invitation_link_tokens_rehearsal.sql (which
-- runs both parts).
--
-- Status: NOT APPLIED. Written only: not applied or rehearsed anywhere.
--
-- When to apply: AFTER the S2a code is deployed, never before, and only
-- after a soak period: at least 7 days of S2a in production with invitations
-- sent and accepted through /join, and no decision to roll back. The code
-- deployed before S2a lists `token` in every query of invitations, so
-- dropping it first breaks the members page and every invitation action.
-- The S2a contract no longer has the column, so from S2a on nothing reads
-- or writes it.
--
-- THIS PART CANNOT BE UNDONE BY A REDEPLOY. Once it is applied, rolling the
-- app back to a build from before S2a fails everywhere it touches
-- invitations, because that build lists `token` in every query. Before any
-- such rollback, add the column back first, as the pre-S2a schema had it
-- (`token String @unique @default(dbgenerated("gen_random_uuid()"))`: text,
-- not null, unique, filled with a random uuid; nothing used it as a
-- credential, so fresh values are fine), then deploy the old build:
--
--   BEGIN;
--   SET LOCAL lock_timeout = '5s';
--   ALTER TABLE public.invitations
--     ADD COLUMN IF NOT EXISTS token text NOT NULL DEFAULT (gen_random_uuid())::text;
--   CREATE UNIQUE INDEX IF NOT EXISTS invitations_token_key ON public.invitations (token);
--   COMMIT;
--
-- The rehearsal checks the column's type before the drop and runs this
-- restore after it.
--
-- Pending S2a invitations keep working from /invitations under the old
-- build (it matches by the signed-in address), but their /join links do
-- not, and the old build never sets a password for an account the server
-- made, so those invitees need the password reset email to sign in.
--
-- Why: the column held a plain uuid "token" that nothing ever used as a
-- credential, but a reader could mistake it for one. The S2a link token is
-- stored only as a SHA-256 (token_hash, part 1). Dropping the column also
-- drops its unique index (invitations_token_key).

BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.invitations DROP COLUMN IF EXISTS token;

COMMIT;
