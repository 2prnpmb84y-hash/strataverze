-- Finance hardening Stage 5: generated documents
-- Idempotent: safe to re-run. Hand-applied via the Supabase SQL editor because
-- the build container cannot reach the database directly.
--
-- 1. financial_documents.content_hash: SHA-256 of a generated document, so the
--    same document is stored once and its copy can be checked.
-- 2. financial_document_files: the bytes of generated PDFs, base64 encoded,
--    kept in the database (not the public documents bucket) and served only
--    through the application's finance access checks.
--
-- RLS: finance readers of the scheme can read the rows. No write policies:
-- the application writes through its own connection.

ALTER TABLE "financial_documents" ADD COLUMN IF NOT EXISTS "content_hash" text;
CREATE INDEX IF NOT EXISTS "financial_documents_hash_idx" ON "financial_documents" ("scheme_id", "document_type", "content_hash");

CREATE TABLE IF NOT EXISTS "financial_document_files" (
  "financial_document_id" uuid PRIMARY KEY REFERENCES "financial_documents"("id") ON DELETE CASCADE,
  "content_base64"        text NOT NULL,
  "created_at"            timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE "financial_document_files" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "financial_document_files_select" ON "financial_document_files";
CREATE POLICY "financial_document_files_select" ON "financial_document_files"
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM "financial_documents" d
      WHERE d."id" = "financial_document_id" AND public.can_view_scheme_finance_controls(d."scheme_id")
    )
  );
