-- StrataVerze: Row Level Security for the debt recovery tables
-- Depends on: 20261021_debt_recovery.sql
--
-- 20261021_debt_recovery.sql created these six tables without RLS, so the
-- anon and authenticated roles could read and write them through the Supabase
-- Data API. This follows the pattern used by the meetings and insurance
-- migrations: RLS enabled with no policies, so the Data API is denied and the
-- application (which connects as the table owner through Prisma) is unaffected.

ALTER TABLE "debt_recovery_cases"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "debt_recovery_steps"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_plans"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_plan_instalments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "debt_recovery_documents"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "debt_recovery_activities" ENABLE ROW LEVEL SECURITY;
