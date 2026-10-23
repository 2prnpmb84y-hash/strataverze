-- Make the "documents" storage bucket private (decision by StrataVerze, 23 October 2026).
-- Idempotent: safe to re-run. Hand-applied via the Supabase SQL editor because
-- the build container cannot reach the database directly.
--
-- Before: the bucket was public, anyone could read any object by URL, and any
-- signed-in user could upload, overwrite or delete any object in it.
-- After: no public access. Every object lives under schemes/<scheme id>/...
-- (all upload code uses that prefix), and a signed-in user can read and
-- upload only in the folders of schemes they are an active member of, plus
-- platform admins. Only platform admins can overwrite or delete; the
-- application never updates or deletes objects.
--
-- Reads go through short-lived signed links made with the viewer's session,
-- so the SELECT policy below is what allows a download. Which documents a
-- member may see inside their scheme is still decided by the application.

UPDATE storage.buckets SET public = false WHERE id = 'documents';

DROP POLICY IF EXISTS "Public read access for documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete documents" ON storage.objects;

-- The scheme id from an object path, or null when the path is not schemes/<uuid>/...
CREATE OR REPLACE FUNCTION public.document_object_scheme_id(object_name text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN (storage.foldername(object_name))[1] = 'schemes'
     AND (storage.foldername(object_name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN ((storage.foldername(object_name))[2])::uuid
    ELSE NULL
  END;
$$;

DROP POLICY IF EXISTS "documents_scheme_members_read" ON storage.objects;
CREATE POLICY "documents_scheme_members_read" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'documents'
    AND (
      public.is_platform_admin()
      OR COALESCE(public.is_scheme_member(public.document_object_scheme_id(name)), false)
    )
  );

DROP POLICY IF EXISTS "documents_scheme_members_upload" ON storage.objects;
CREATE POLICY "documents_scheme_members_upload" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'documents'
    AND (
      public.is_platform_admin()
      OR COALESCE(public.is_scheme_member(public.document_object_scheme_id(name)), false)
    )
  );

DROP POLICY IF EXISTS "documents_platform_admin_update" ON storage.objects;
CREATE POLICY "documents_platform_admin_update" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'documents' AND public.is_platform_admin())
  WITH CHECK (bucket_id = 'documents' AND public.is_platform_admin());

DROP POLICY IF EXISTS "documents_platform_admin_delete" ON storage.objects;
CREATE POLICY "documents_platform_admin_delete" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'documents' AND public.is_platform_admin());
