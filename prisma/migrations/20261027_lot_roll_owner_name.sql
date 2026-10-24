-- Property onboarding (24 Oct): each lot owner's name exactly as it appears
-- on the strata roll.
--
-- Owners' login accounts (scheme memberships) carry the person's own first
-- and last name, which is often not how the roll records ownership (joint
-- owners, companies with their ACN, trustees). This column holds the roll's
-- wording as typed, separate from any account. It is entered at onboarding
-- and kept up to date by the Adviser and the committee.
--
-- Additive only: one nullable column with a length check. Must be applied
-- BEFORE the code that reads it is deployed, because the app selects every
-- column of lot_details.
--
-- Idempotent. Applied by hand through the Supabase SQL editor.

ALTER TABLE public.lot_details ADD COLUMN IF NOT EXISTS roll_owner_name text;

ALTER TABLE public.lot_details DROP CONSTRAINT IF EXISTS lot_details_roll_owner_name_check;
ALTER TABLE public.lot_details ADD CONSTRAINT lot_details_roll_owner_name_check
  CHECK (roll_owner_name IS NULL OR char_length(roll_owner_name) BETWEEN 1 AND 500);

COMMENT ON COLUMN public.lot_details.roll_owner_name IS
  'The owner''s name exactly as it appears on the strata roll (onboarding, 24 Oct 2026).';
