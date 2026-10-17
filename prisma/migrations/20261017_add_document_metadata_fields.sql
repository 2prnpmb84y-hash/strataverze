-- Add extended metadata fields to documents table for the document management system
ALTER TABLE documents ADD COLUMN IF NOT EXISTS document_type TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS document_date TIMESTAMPTZ;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS strata_plan TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS schedule TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS lot_number TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS supplier TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS comments TEXT;
