-- Security stage S4 (MFA), finding SEC-010.
--
-- The app enforces MFA on the server, but the documents bucket is still
-- reachable directly through the Supabase Storage API with the user's own
-- session token (until stage S3 moves storage server-side). Without this, a
-- user who must use MFA could sign in with only a password (an aal1 session)
-- and read or upload documents directly, skipping the MFA check.
--
-- requires_aal2() is true for the signed-in user when MFA applies to them:
-- platform admins, active Advisers, Accountants, Payment Authorisers and
-- treasurers, and anyone who has enrolled an authenticator. A RESTRICTIVE
-- policy then requires an aal2 session for every documents bucket operation
-- by such a user. Other users are unaffected.
--
-- Idempotent. Applied by hand through the Supabase SQL editor.

CREATE OR REPLACE FUNCTION public.requires_aal2()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.auth_id = auth.uid() AND p.is_platform_admin
    )
    OR EXISTS (
      SELECT 1
      FROM public.scheme_memberships m
      JOIN public.profiles p ON p.id = m.profile_id
      WHERE p.auth_id = auth.uid()
        AND m.is_active
        AND (
          m.role::text IN ('ADVISER', 'ACCOUNTANT', 'PAYMENT_AUTHORISER')
          OR (m.role::text = 'COMMITTEE' AND m.is_treasurer)
        )
    )
    OR EXISTS (
      SELECT 1 FROM auth.mfa_factors f
      WHERE f.user_id = auth.uid() AND f.status::text = 'verified'
    );
$$;

REVOKE EXECUTE ON FUNCTION public.requires_aal2() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.requires_aal2() TO authenticated;

DROP POLICY IF EXISTS documents_require_mfa ON storage.objects;
CREATE POLICY documents_require_mfa ON storage.objects
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (
    bucket_id <> 'documents'
    OR coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    OR NOT public.requires_aal2()
  )
  WITH CHECK (
    bucket_id <> 'documents'
    OR coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    OR NOT public.requires_aal2()
  );
