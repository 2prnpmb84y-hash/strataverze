-- Property photo (25 Oct 2026): allow the "scheme_photo" upload purpose.
--
-- storage_uploads.purpose is limited by a CHECK constraint to the purposes
-- the app knows (20261024_storage_server_only.sql). This widens it by one.
-- Nothing else changes; existing rows all still pass.
--
-- The photos themselves are rows in scheme_images (url = the storage path
-- in the private documents bucket, under schemes/<id>/photos/), which
-- already exists.
--
-- Idempotent. Applied by hand through the Supabase SQL editor.

ALTER TABLE public.storage_uploads DROP CONSTRAINT IF EXISTS storage_uploads_purpose_check;
ALTER TABLE public.storage_uploads ADD CONSTRAINT storage_uploads_purpose_check
  CHECK (purpose IN ('library', 'committee_library', 'insurance', 'claim_evidence', 'finance_document', 'payment_confirmation', 'scheme_photo'));
