-- Add deleted_at column to all entity tables for soft-delete support.
-- The Prisma contract defines deletedAt on these models, and all query
-- files filter with deletedAt.eq(null), but the column was never added
-- to the database. Without it every query throws a runtime SQL error,
-- crashing the entire portal with React error #441.

ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE compliance_items ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE insurance_policies ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE bylaws ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE funds ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE levies ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE levy_items ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
