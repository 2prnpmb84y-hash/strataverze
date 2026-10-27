-- Queensland body corporate certificates and records access (QLD stage 2,
-- step 9, 27 Oct 2026). Idempotent. Applied by hand in the Supabase SQL
-- editor, like the other migrations. Apply it before the code deploys: the
-- code reads and writes the two new columns.
--
-- Who may ask comes from each building's rule pack (rules.CERTIFICATE and
-- rules.INSPECTIONS); the database keeps the union of every pack's types.
-- - NSW keeps OWNER, MORTGAGEE, COVENANT_CHARGEE and AUTHORISED_PERSON for a
--   certificate (s 184), and OWNER and AUTHORISED_PERSON for an inspection
--   (s 182).
-- - Queensland adds the interested persons of BCCMA s 205(13): BUYER,
--   DISCLOSURE_RECIPIENT (a person given a seller's disclosure statement),
--   PROPER_INTEREST and AGENT (an agent of any of these), with OWNER and
--   MORTGAGEE. An agent's principal is held in the authorised_by columns.
-- - Queensland access to records is an inspection, copies, or both
--   (SM s 233): records_inspections.inspected and copy_pages hold what was
--   given, so the fee can be shown. NSW rows leave both null.
-- Every check is only widened, and the new columns are nullable, so every
-- existing row satisfies every check.

BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.sale_certificates DROP CONSTRAINT IF EXISTS sale_certificates_requester_type_check;
ALTER TABLE public.sale_certificates ADD CONSTRAINT sale_certificates_requester_type_check
  CHECK (requester_type IN ('OWNER', 'MORTGAGEE', 'COVENANT_CHARGEE', 'AUTHORISED_PERSON', 'BUYER', 'DISCLOSURE_RECIPIENT', 'PROPER_INTEREST', 'AGENT'));

ALTER TABLE public.sale_certificates DROP CONSTRAINT IF EXISTS sale_certificates_authorised_by_type_check;
ALTER TABLE public.sale_certificates ADD CONSTRAINT sale_certificates_authorised_by_type_check
  CHECK (authorised_by_type IN ('OWNER', 'MORTGAGEE', 'COVENANT_CHARGEE', 'BUYER', 'DISCLOSURE_RECIPIENT', 'PROPER_INTEREST'));

ALTER TABLE public.records_inspections DROP CONSTRAINT IF EXISTS records_inspections_inspector_type_check;
ALTER TABLE public.records_inspections ADD CONSTRAINT records_inspections_inspector_type_check
  CHECK (inspector_type IN ('OWNER', 'AUTHORISED_PERSON', 'MORTGAGEE', 'BUYER', 'DISCLOSURE_RECIPIENT', 'PROPER_INTEREST', 'AGENT'));

ALTER TABLE public.records_inspections ADD COLUMN IF NOT EXISTS inspected boolean;
ALTER TABLE public.records_inspections ADD COLUMN IF NOT EXISTS copy_pages integer;
ALTER TABLE public.records_inspections DROP CONSTRAINT IF EXISTS records_inspections_copy_pages_check;
ALTER TABLE public.records_inspections ADD CONSTRAINT records_inspections_copy_pages_check
  CHECK (copy_pages IS NULL OR copy_pages >= 0);

COMMIT;
