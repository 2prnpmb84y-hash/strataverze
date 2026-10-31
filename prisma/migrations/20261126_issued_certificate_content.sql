-- An issued certificate keeps what it read on the day it was issued (NSW
-- s 184 strata information certificate and Queensland body corporate
-- certificate; fix approved by Matthew Wrigley on 31 Oct 2026, before PR 10).
-- Idempotent. Applied by hand in the Supabase SQL editor, like the other
-- migrations, and ONLY with Matthew Wrigley's approval. Rehearse it first in
-- a transaction that is rolled back.
--
-- Status: APPLIED to production on 31 Oct 2026, approved by Matthew Wrigley.
-- This version (with the trigger) was rehearsed first in a rolled-back run,
-- which also exercised the trigger on a temporary table (issue, fee paid and
-- backfill from null allowed; changing kept content and leaving ISSUED
-- refused). Verified read-only afterwards: the column (jsonb, nullable), the
-- check, the trigger enabled, the function not executable by anon,
-- authenticated or service_role, and the one existing row (CANCELLED)
-- unchanged.
--
-- When to apply: BEFORE the code that needs it deploys. The app's ORM lists
-- every column of its contract in each query of sale_certificates, so the
-- new code fails against the table without issued_content everywhere it
-- reads or writes a certificate: starting a draft (the numbering read),
-- saving, refreshing, issuing and cancelling one, recording its fee, the
-- certificate page, the PDF and the lot's certificate list. The code
-- deployed now works against the new table: the column is nullable, it
-- never names it, and the trigger allows everything it does (below).
--
-- The bug: a certificate's PDF was laid out again from the building's rule
-- pack every time it was opened (the title, the section, the plan row, the
-- execution box, the conclusive evidence note and the layout sentence; the
-- owners corporation or body corporate and plan words; the labels of who
-- asked), with the building's current name, plan number and lot number, and
-- the current layout. So a later change silently altered a certificate
-- already given to a buyer. The items, the requester, the certificate date
-- and the fee were already kept on the row from issue.
--
-- issued_content: everything the PDF reads, the layout it is drawn with,
-- its file name and the SHA-256 of the PDF drawn from it, written in the
-- same transaction (and the same UPDATE) that issues the certificate. An
-- issued certificate's PDF is drawn from it alone. A draft has none and
-- keeps following the current pack. The wording itself stays in src/config:
-- nothing here holds statutory text.
--
-- Existing rows: production's one certificate is CANCELLED (read-only check,
-- 31 Oct 2026), so no issued certificate lacks issued_content and no
-- backfill is needed. scripts/backfill-issued-certificate-content.ts exists
-- for any certificate issued between this migration and the code deploying,
-- run only with approval.
--
-- The check: only an issued certificate may hold issued_content, as an
-- object. Every existing row passes, by construction (not by reading the
-- data): the column is new, so it is null on every row.
--
-- The trigger (sale_certificates_issued_guard, BEFORE UPDATE): once set,
-- issued_content never changes or is removed, and an issued certificate
-- never leaves ISSUED. What the app does to a certificate passes it:
-- - saving, refreshing and cancelling a draft (status DRAFT, nothing kept);
-- - issuing it (DRAFT to ISSUED, issued_content set from null);
-- - recording an issued certificate's fee paid (fee_paid_on only);
-- - the backfill (issued_content set from null, once, on an issued row).
-- No code moves an issued certificate to CANCELLED (only a draft is
-- cancelled), and a DELETE (a building or lot deleted, cascading) is not
-- affected. Existing rows are not touched by creating it.

BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.sale_certificates ADD COLUMN IF NOT EXISTS issued_content jsonb;

ALTER TABLE public.sale_certificates DROP CONSTRAINT IF EXISTS sale_certificates_issued_content_check;
ALTER TABLE public.sale_certificates ADD CONSTRAINT sale_certificates_issued_content_check
  CHECK (issued_content IS NULL OR (status = 'ISSUED' AND jsonb_typeof(issued_content) = 'object'));

CREATE OR REPLACE FUNCTION public.sale_certificates_issued_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.issued_content IS NOT NULL AND NEW.issued_content IS DISTINCT FROM OLD.issued_content THEN
    RAISE EXCEPTION 'StrataVerze: certificate %: what it kept when it was issued cannot change', OLD.id USING ERRCODE = '23514';
  END IF;
  IF OLD.status = 'ISSUED' AND NEW.status IS DISTINCT FROM 'ISSUED' THEN
    RAISE EXCEPTION 'StrataVerze: certificate % is issued and stays issued', OLD.id USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.sale_certificates_issued_guard() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS sale_certificates_issued_guard ON public.sale_certificates;
CREATE TRIGGER sale_certificates_issued_guard BEFORE UPDATE ON public.sale_certificates
  FOR EACH ROW EXECUTE FUNCTION public.sale_certificates_issued_guard();

COMMIT;
