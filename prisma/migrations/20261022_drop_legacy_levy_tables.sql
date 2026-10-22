-- StrataVerze: drop the retired legacy levy tables
--
-- Levy schedules and levy notices are the single levy system (levy
-- consolidation stages 1 to 3). Nothing in the app reads or writes the legacy
-- levies or levy_items tables any more, and they are removed from the Prisma
-- schema.
--
-- Checked on production before dropping (2026-10-22): no foreign keys from
-- other tables, no views, functions or triggers depend on them.
--
-- Rows at the time of dropping (seed data), kept here as the record:
--   levies:
--     44444444-4444-4444-4444-444444444401 scheme a1b2c3d4-e5f6-7890-abcd-ef1234567890
--       "Q3 2026 Admin Levy", ORDINARY, ISSUED, total 4500.00, due 2026-09-29T13:00:00Z
--   levy_items (levy 44444444-…401):
--     55555555-…501 lot 11111111-…101 amount 1250.00 paid 0.00    UNPAID
--     55555555-…502 lot 11111111-…102 amount 1000.00 paid 1000.00 PAID
--     55555555-…503 lot 11111111-…103 amount 1000.00 paid 500.00  PARTIAL
--     55555555-…504 lot 11111111-…104 amount 1250.00 paid 0.00    UNPAID
--
-- IRREVERSIBLE. Run only after the code that removes the models is deployed.

DROP TABLE IF EXISTS "levy_items";
DROP TABLE IF EXISTS "levies";
