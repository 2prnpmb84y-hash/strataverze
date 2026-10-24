-- Security stage S3 (storage), finding SEC-006. Part 2 of 2.
--
-- APPLY ONLY AFTER THE S3 CODE IS LIVE. Before S3 the app uploads and signs
-- with the signed-in user's own session, which needs these policies; after
-- S3 every storage operation is made by the server with the service role,
-- after authorising the request, and browsers need no storage access.
--
-- Removes every policy that lets a signed-in user list, read, upload,
-- change or delete files in the documents bucket directly. With no
-- permissive policy left, the Storage API refuses all of it. Signed links
-- the server issues (download, and one-time upload) keep working: they do
-- not depend on these policies.
--
-- Idempotent. Applied by hand through the Supabase SQL editor.

DROP POLICY IF EXISTS documents_scheme_members_read ON storage.objects;
DROP POLICY IF EXISTS documents_scheme_members_upload ON storage.objects;
DROP POLICY IF EXISTS documents_platform_admin_update ON storage.objects;
DROP POLICY IF EXISTS documents_platform_admin_delete ON storage.objects;
-- documents_require_mfa (S4) is a restrictive policy; with no permissive
-- policy it has nothing left to restrict, and it is kept as a backstop.

-- Check nothing else still opens the bucket to browsers (a policy added in
-- the dashboard under another name, for example). Any permissive policy on
-- storage.objects that names the documents bucket, or that does not limit
-- itself to a bucket at all, stops this script.
DO $check$
DECLARE
  leftover text;
BEGIN
  SELECT string_agg(policyname, ', ') INTO leftover
  FROM pg_policies
  WHERE schemaname = 'storage'
    AND tablename = 'objects'
    AND permissive = 'PERMISSIVE'
    AND (
      coalesce(qual, '') || coalesce(with_check, '') ILIKE '%documents%'
      OR coalesce(qual, '') || coalesce(with_check, '') NOT ILIKE '%bucket_id%'
    );
  IF leftover IS NOT NULL THEN
    RAISE EXCEPTION 'Storage policies still open the documents bucket: %', leftover;
  END IF;
END
$check$;
