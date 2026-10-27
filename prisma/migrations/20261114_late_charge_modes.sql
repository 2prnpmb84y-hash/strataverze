-- Late charge modes for every jurisdiction (QLD stage 2, step 6, 27 Oct 2026).
-- Idempotent. Applied by hand in the Supabase SQL editor, like the other migrations.
--
-- A building's late charge setting (schemes.interest_mode) gains two modes:
-- - NSW keeps STATUTORY (SSMA 2015 s 85: 10% a year, one month's grace) and
--   NO_INTEREST (by a recorded general meeting resolution, s 85(3)).
-- - Queensland uses NONE (no penalty until a resolution sets one: the default
--   for a new Queensland building, decided 27 Oct 2026) and RESOLVED_RATE (a
--   penalty at the monthly rate a recorded ordinary resolution set, Standard
--   Module s 165: simple, at most 2.5% a month).
-- Which modes a building may use, and the rate cap, come from its rule pack;
-- the database keeps the shape consistent. Existing rows (NSW, STATUTORY or
-- NO_INTEREST, no rate) satisfy every check.

BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.schemes ADD COLUMN IF NOT EXISTS late_charge_monthly_rate_percent numeric(5,2);

ALTER TABLE public.schemes DROP CONSTRAINT IF EXISTS schemes_interest_mode_check;
ALTER TABLE public.schemes ADD CONSTRAINT schemes_interest_mode_check
  CHECK (interest_mode IN ('STATUTORY', 'NO_INTEREST', 'NONE', 'RESOLVED_RATE'));

-- A resolution is recorded for every mode except the statutory rate and no penalty.
ALTER TABLE public.schemes DROP CONSTRAINT IF EXISTS schemes_no_interest_resolution_check;
ALTER TABLE public.schemes ADD CONSTRAINT schemes_no_interest_resolution_check
  CHECK (interest_mode IN ('STATUTORY', 'NONE') OR (interest_resolution_meeting_id IS NOT NULL AND interest_resolution_motion_id IS NOT NULL));

-- A rate is held exactly when the mode is RESOLVED_RATE, and it is positive.
ALTER TABLE public.schemes DROP CONSTRAINT IF EXISTS schemes_late_charge_rate_check;
ALTER TABLE public.schemes ADD CONSTRAINT schemes_late_charge_rate_check
  CHECK ((interest_mode = 'RESOLVED_RATE') = (late_charge_monthly_rate_percent IS NOT NULL)
         AND (late_charge_monthly_rate_percent IS NULL OR (late_charge_monthly_rate_percent > 0 AND late_charge_monthly_rate_percent <= 100)));

COMMIT;
