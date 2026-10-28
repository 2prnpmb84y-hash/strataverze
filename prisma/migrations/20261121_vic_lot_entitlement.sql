-- Victorian lot entitlement (VIC, ACT and WA stage 2, PR 4, 28 Oct 2026). Idempotent.
-- Applied by hand in the Supabase SQL editor, like the other migrations, and
-- only with Matthew Wrigley's approval.
--
-- When to apply: BEFORE the code deploys. The ORM selects every column of
-- lots, so the new code fails against the old table. The old code works
-- against the new table (the column is nullable, with no default).
--
-- lots.lot_entitlement: the lot's lot entitlement (Owners Corporations Act
-- 2006 (Vic) s 3), the Victorian pack's second schedule. Lot liability, the
-- schedule fees are shared by, stays in lots.entitlement. It decides polls,
-- special and unanimous resolutions on a ballot or poll, the quorum where 50%
-- of the lots is not available, the share of common property and the
-- insurance premium fee (ss 23A, 77, 89(3), 95, 96; Subdivision Act s 30).
-- Held as a whole number, positive when set, like lots.entitlement and
-- lots.interest_schedule_entitlement. Every other lot leaves it null.
--
-- No state check: a lot has no state, so a check would need a trigger. As
-- with lots.occupiable (migration 20261120), the app holds it for a
-- Victorian building only (the pack's ENTITLEMENT_SCHEDULES) and clears it
-- when the building's state changes. Queensland's interest schedule stays in
-- lots.interest_schedule_entitlement, unchanged.
--
-- Checked 28 Oct 2026: every building is NSW (schemes_state_has_rule_pack_check
-- allows NSW only), so every existing row has the new column null and
-- satisfies the new check. NSW and Queensland rows are unchanged.

BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.lots ADD COLUMN IF NOT EXISTS lot_entitlement integer;

ALTER TABLE public.lots DROP CONSTRAINT IF EXISTS lots_lot_entitlement_check;
ALTER TABLE public.lots ADD CONSTRAINT lots_lot_entitlement_check
  CHECK (lot_entitlement IS NULL OR lot_entitlement > 0);

COMMIT;
