-- The late charge part of each levy payment (QLD go-live gap 1, 27 Oct 2026).
-- Idempotent. Applied by hand in the Supabase SQL editor, like the other migrations,
-- and before the code that reads it is deployed (the ORM selects every column).
--
-- Where a building applies payments to the late charge first (Queensland's
-- penalty, Standard Module s 166(5)), each payment records the part applied to
-- the penalty, the same amount as its receipt journal line. The penalty a
-- notice has had paid is then the sum over its payments not reversed, so a
-- receipt can never take more penalty than is charged and unpaid. NSW applies
-- payments to the levy first and leaves it at 0. Existing rows are all NSW.

BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.levy_payments ADD COLUMN IF NOT EXISTS late_charge_amount numeric(12,2) NOT NULL DEFAULT 0;

ALTER TABLE public.levy_payments DROP CONSTRAINT IF EXISTS levy_payments_late_charge_amount_check;
ALTER TABLE public.levy_payments ADD CONSTRAINT levy_payments_late_charge_amount_check
  CHECK (late_charge_amount >= 0 AND (late_charge_amount = 0 OR late_charge_amount <= amount));

COMMIT;
