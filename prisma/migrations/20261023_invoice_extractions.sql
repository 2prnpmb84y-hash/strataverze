-- Finance hardening Stage 6: invoice extraction review (TC-009)
-- Idempotent: safe to re-run. Hand-applied via the Supabase SQL editor because
-- the build container cannot reach the database directly.
--
-- invoice_extractions keeps what was read from an uploaded supplier invoice
-- (pattern matching and OCR, no AI) beside the values the adviser entered
-- after checking each field against the document. The uploaded invoice itself
-- is a financial_documents row with its bytes in financial_document_files.
--
-- The extracted values are the audit record of what was read, so a trigger
-- refuses any change to them, and to the scheme, document and author, once
-- written. Only the review columns can be filled in, and only once.
--
-- RLS: finance readers of the scheme can read the rows. No write policies:
-- the application writes through its own connection.

CREATE TABLE IF NOT EXISTS "invoice_extractions" (
  "id"                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "scheme_id"             uuid NOT NULL REFERENCES "schemes"("id") ON DELETE CASCADE,
  "financial_document_id" uuid NOT NULL REFERENCES "financial_documents"("id") ON DELETE CASCADE,
  "supplier_invoice_id"   uuid REFERENCES "supplier_invoices"("id") ON DELETE SET NULL,
  "method"                text NOT NULL CHECK ("method" IN ('TEXT', 'OCR')),
  "confidence"            text NOT NULL CHECK ("confidence" IN ('high', 'medium', 'low')),
  "extracted"             jsonb NOT NULL,
  "accepted"              jsonb,
  "corrections"           jsonb,
  "created_by"            uuid NOT NULL,
  "created_at"            timestamptz NOT NULL DEFAULT now(),
  "reviewed_by"           uuid,
  "reviewed_at"           timestamptz
);
CREATE INDEX IF NOT EXISTS "invoice_extractions_scheme_idx" ON "invoice_extractions" ("scheme_id");
CREATE INDEX IF NOT EXISTS "invoice_extractions_invoice_idx" ON "invoice_extractions" ("supplier_invoice_id");

CREATE OR REPLACE FUNCTION public.invoice_extractions_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."extracted" IS DISTINCT FROM OLD."extracted"
     OR NEW."scheme_id" IS DISTINCT FROM OLD."scheme_id"
     OR NEW."financial_document_id" IS DISTINCT FROM OLD."financial_document_id"
     OR NEW."method" IS DISTINCT FROM OLD."method"
     OR NEW."confidence" IS DISTINCT FROM OLD."confidence"
     OR NEW."created_by" IS DISTINCT FROM OLD."created_by"
     OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
    RAISE EXCEPTION 'The extracted invoice values are an audit record and cannot be changed';
  END IF;
  IF OLD."reviewed_at" IS NOT NULL AND (
       NEW."accepted" IS DISTINCT FROM OLD."accepted"
       OR NEW."corrections" IS DISTINCT FROM OLD."corrections"
       OR NEW."reviewed_by" IS DISTINCT FROM OLD."reviewed_by"
       OR NEW."reviewed_at" IS DISTINCT FROM OLD."reviewed_at") THEN
    RAISE EXCEPTION 'This extraction has already been reviewed';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS "invoice_extractions_guard" ON "invoice_extractions";
CREATE TRIGGER "invoice_extractions_guard" BEFORE UPDATE ON "invoice_extractions"
  FOR EACH ROW EXECUTE FUNCTION public.invoice_extractions_guard();

ALTER TABLE "invoice_extractions" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "invoice_extractions_select" ON "invoice_extractions";
CREATE POLICY "invoice_extractions_select" ON "invoice_extractions"
  FOR SELECT TO authenticated USING (public.can_view_scheme_finance_controls("scheme_id"));
