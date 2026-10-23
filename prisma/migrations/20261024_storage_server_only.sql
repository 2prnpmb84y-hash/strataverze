-- Security stage S3 (storage), findings SEC-006 and SEC-022. Part 1 of 2.
--
-- Safe to apply before the S3 code is deployed: it only adds things, and
-- narrows the bucket to the file types the app accepts.
--
-- * storage_uploads: uploads the server has prepared. The server chooses
--   each path and checks what arrived before the file is used.
-- * documents.visibility: who may see a library document. Existing
--   documents stay visible to all members (as today).
-- * The documents bucket accepts only the app's file types (no SVG, no
--   HTML or script), up to 30 MB.
--
-- Part 2 (20261025_storage_remove_browser_access.sql) removes the browser
-- storage policies, and must wait until the S3 code is live.
--
-- Idempotent. Applied by hand through the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS public.storage_uploads (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id     uuid NOT NULL REFERENCES public.schemes(id) ON DELETE CASCADE,
  purpose       text NOT NULL CHECK (purpose IN ('library', 'committee_library', 'insurance', 'claim_evidence', 'finance_document', 'payment_confirmation')),
  path          text NOT NULL UNIQUE,
  profile_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  file_name     text NOT NULL CHECK (length(file_name) BETWEEN 1 AND 255),
  declared_size integer NOT NULL CHECK (declared_size > 0),
  created_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  verified_at   timestamptz,
  verified_size integer,
  verified_mime text,
  used_at       timestamptz,
  used_for      text
);
CREATE INDEX IF NOT EXISTS storage_uploads_scheme_idx ON public.storage_uploads (scheme_id, created_at);
CREATE INDEX IF NOT EXISTS storage_uploads_profile_idx ON public.storage_uploads (profile_id, created_at);
ALTER TABLE public.storage_uploads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.storage_uploads FROM PUBLIC, anon, authenticated, service_role;

ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'ALL_MEMBERS';
ALTER TABLE public.documents DROP CONSTRAINT IF EXISTS documents_visibility_check;
ALTER TABLE public.documents ADD CONSTRAINT documents_visibility_check
  CHECK (visibility IN ('ALL_MEMBERS', 'COMMITTEE', 'LOT_OWNERS', 'MANAGEMENT'));

UPDATE storage.buckets
SET public = false,
    file_size_limit = 31457280,
    allowed_mime_types = ARRAY[
      'application/pdf',
      'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/heic', 'image/heif',
      -- Non-standard, but sent by some browsers for JPEG files. Kept so the
      -- current (pre-S3) upload forms keep working until S3 is deployed.
      'image/jpg',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/msword', 'application/vnd.ms-excel', 'application/vnd.ms-powerpoint',
      'text/plain', 'text/csv'
    ]
WHERE id = 'documents';
