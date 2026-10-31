-- Certificate kinds, requester types and records access for the draft packs
-- (VIC, ACT and WA stage 2, PR 10a, 31 Oct 2026; decision D1 of 31 Oct 2026,
-- approved in principle by Matthew Wrigley). Idempotent. Applied by hand in
-- the Supabase SQL editor, like the other migrations, and ONLY with Matthew
-- Wrigley's approval. Rehearse it first in a transaction that is rolled back.
--
-- Status: NOT APPLIED.
--
-- When to apply: BEFORE the code that adds these columns to the ORM models
-- (prisma/schema.prisma, PR 10a) deploys. The app's ORM lists every column of
-- its contract in each query of sale_certificates and records_inspections,
-- so that code fails against the tables without these columns everywhere
-- NSW and Queensland read or write a certificate or an inspection: starting,
-- saving, refreshing, issuing and cancelling a certificate, recording a fee
-- paid, the certificate pages, the PDF and the lot's certificate list, and
-- the inspections page and its actions. The code deployed now works against
-- the new tables: every new column is nullable with no default, it never
-- names them, and every check below holds for what it writes.
--
-- What it adds (nothing reads or writes these yet; the kinds store is PR 10b):
-- - sale_certificates.kind: the kind of certificate under a VIC, ACT or WA
--   pack (CERTIFICATE_KINDS): OWNERS_CORPORATION (VIC s 151), SALE,
--   SALE_UPDATE and RENTAL (ACT s 119), SCHEME and LOT (WA s 110(1), (2)).
--   fee_cap_cents and fee_includes_gst: the cap the fee was checked against
--   when it was issued, and whether that cap includes GST (D3, D10).
--   additional_certificate: the adviser's answer to the VIC additional
--   certificate question (D8).
-- - records_inspections.rule_pack (as on sale_certificates), access_kind
--   (RECORDS, REGISTER, EXECUTIVE_MEMBERS, INSURANCE, CONTACT under
--   RECORDS_ACCESS), copy_medium, records_copied and device_cost_cents (what
--   copies were given, D19), fee_cap_cents and fee_includes_gst (as above),
--   and also_sale_certificate (the adviser's answer to the ACT nil fee
--   question, D14).
-- - The requester checks gain ANY_PERSON (VIC "any person"), INTEREST_HOLDER
--   and COMPANY_REPRESENTATIVE (ACT eligible persons), D16. They are only
--   widened: every value they allowed is still allowed.
-- - New checks: a kind (or access kind) is held for, and only for, a row
--   whose rule_pack is a VIC, ACT or WA pack; the cap fields are held only
--   with a kind; a fee is never above its cap; an issued certificate (or
--   completed access) with a kind has its cap; a device cost only with a
--   storage device.
--
-- The issued certificate guard (trigger sale_certificates_issued_guard,
-- 20261126) does not block anything these columns need: it refuses only a
-- change to issued_content once set and a certificate leaving ISSUED, so
-- the kind, the cap and the answer can be written in the same UPDATE that
-- issues a certificate and sets issued_content. It does not freeze them
-- after issue; the kinds store (10b) writes them only in that UPDATE.
--
-- Every existing row passes, by construction (not by reading the data): each
-- new column is null on every row, the requester checks are only widened,
-- and each new check holds when its new columns are null and rule_pack is
-- not a VIC, ACT or WA pack. schemes_state_has_rule_pack_check (20261122)
-- allows NSW and Queensland buildings only, so no such row exists; NSW and
-- Queensland certificates are labelled AU-NSW or AU-QLD, and inspections
-- have no rule_pack until this adds it. No existing row changes. No index is
-- added, and every constraint name is within Postgres's 63-character limit
-- (src/lib/records/certificate-kinds-migration.test.ts checks this, the
-- widened lists and the columns against the emitted contract). A pack code
-- added later (NT, Tasmania, South Australia, New Zealand) needs these checks
-- widened before it can hold a kind.
--
-- ADD CONSTRAINT scans each table under a brief exclusive lock; both are
-- small, and the 5 second lock timeout bounds the wait.

BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.sale_certificates ADD COLUMN IF NOT EXISTS kind text;
ALTER TABLE public.sale_certificates ADD COLUMN IF NOT EXISTS fee_cap_cents integer;
ALTER TABLE public.sale_certificates ADD COLUMN IF NOT EXISTS fee_includes_gst boolean;
ALTER TABLE public.sale_certificates ADD COLUMN IF NOT EXISTS additional_certificate boolean;

ALTER TABLE public.sale_certificates DROP CONSTRAINT IF EXISTS sale_certificates_requester_type_check;
ALTER TABLE public.sale_certificates ADD CONSTRAINT sale_certificates_requester_type_check
  CHECK (requester_type IN ('OWNER', 'MORTGAGEE', 'COVENANT_CHARGEE', 'AUTHORISED_PERSON', 'BUYER', 'DISCLOSURE_RECIPIENT',
    'PROPER_INTEREST', 'AGENT', 'ANY_PERSON', 'INTEREST_HOLDER', 'COMPANY_REPRESENTATIVE'));
ALTER TABLE public.sale_certificates DROP CONSTRAINT IF EXISTS sale_certificates_authorised_by_type_check;
ALTER TABLE public.sale_certificates ADD CONSTRAINT sale_certificates_authorised_by_type_check
  CHECK (authorised_by_type IN ('OWNER', 'MORTGAGEE', 'COVENANT_CHARGEE', 'BUYER', 'DISCLOSURE_RECIPIENT', 'PROPER_INTEREST',
    'ANY_PERSON', 'INTEREST_HOLDER', 'COMPANY_REPRESENTATIVE'));
-- A kind is held for, and only for, a certificate under a VIC, ACT or WA pack.
ALTER TABLE public.sale_certificates DROP CONSTRAINT IF EXISTS sale_certificates_kind_check;
ALTER TABLE public.sale_certificates ADD CONSTRAINT sale_certificates_kind_check CHECK (
  (kind IS NOT NULL) = COALESCE(rule_pack ~ '^AU-(VIC|ACT|WA) ', false)
  AND (kind IS NULL OR kind IN ('OWNERS_CORPORATION', 'SALE', 'SALE_UPDATE', 'RENTAL', 'SCHEME', 'LOT')));
-- The cap, its GST and the VIC answer: kind rows only; set when issued; the fee never above the cap.
ALTER TABLE public.sale_certificates DROP CONSTRAINT IF EXISTS sale_certificates_fee_cap_check;
ALTER TABLE public.sale_certificates ADD CONSTRAINT sale_certificates_fee_cap_check CHECK (
  (kind IS NOT NULL OR (fee_cap_cents IS NULL AND fee_includes_gst IS NULL AND additional_certificate IS NULL))
  AND (fee_cap_cents IS NULL OR (fee_cap_cents >= 0 AND (fee_cents IS NULL OR fee_cents <= fee_cap_cents)))
  AND (kind IS NULL OR status <> 'ISSUED' OR (fee_cap_cents IS NOT NULL AND fee_includes_gst IS NOT NULL))
  AND (additional_certificate IS NULL OR kind = 'OWNERS_CORPORATION')
  AND (kind IS DISTINCT FROM 'OWNERS_CORPORATION' OR status <> 'ISSUED' OR additional_certificate IS NOT NULL));

ALTER TABLE public.records_inspections ADD COLUMN IF NOT EXISTS rule_pack varchar(40);
ALTER TABLE public.records_inspections ADD COLUMN IF NOT EXISTS access_kind text;
ALTER TABLE public.records_inspections ADD COLUMN IF NOT EXISTS copy_medium text;
ALTER TABLE public.records_inspections ADD COLUMN IF NOT EXISTS records_copied integer;
ALTER TABLE public.records_inspections ADD COLUMN IF NOT EXISTS device_cost_cents integer;
ALTER TABLE public.records_inspections ADD COLUMN IF NOT EXISTS fee_cap_cents integer;
ALTER TABLE public.records_inspections ADD COLUMN IF NOT EXISTS fee_includes_gst boolean;
ALTER TABLE public.records_inspections ADD COLUMN IF NOT EXISTS also_sale_certificate boolean;

ALTER TABLE public.records_inspections DROP CONSTRAINT IF EXISTS records_inspections_inspector_type_check;
ALTER TABLE public.records_inspections ADD CONSTRAINT records_inspections_inspector_type_check
  CHECK (inspector_type IN ('OWNER', 'AUTHORISED_PERSON', 'MORTGAGEE', 'BUYER', 'DISCLOSURE_RECIPIENT', 'PROPER_INTEREST', 'AGENT',
    'INTEREST_HOLDER', 'COMPANY_REPRESENTATIVE'));
-- An access kind is held for, and only for, a request under a VIC, ACT or WA pack.
ALTER TABLE public.records_inspections DROP CONSTRAINT IF EXISTS records_inspections_access_kind_check;
ALTER TABLE public.records_inspections ADD CONSTRAINT records_inspections_access_kind_check CHECK (
  (access_kind IS NOT NULL) = COALESCE(rule_pack ~ '^AU-(VIC|ACT|WA) ', false)
  AND (access_kind IS NULL OR access_kind IN ('RECORDS', 'REGISTER', 'EXECUTIVE_MEMBERS', 'INSURANCE', 'CONTACT')));
-- What was given and the cap: access kind rows only; set when completed; the fee never above the cap.
ALTER TABLE public.records_inspections DROP CONSTRAINT IF EXISTS records_inspections_access_fields_check;
ALTER TABLE public.records_inspections ADD CONSTRAINT records_inspections_access_fields_check CHECK (
  (access_kind IS NOT NULL OR (copy_medium IS NULL AND records_copied IS NULL AND device_cost_cents IS NULL
    AND fee_cap_cents IS NULL AND fee_includes_gst IS NULL AND also_sale_certificate IS NULL))
  AND (copy_medium IS NULL OR copy_medium IN ('PHOTOCOPY', 'ELECTRONIC', 'STORAGE_DEVICE'))
  AND (records_copied IS NULL OR records_copied >= 0)
  AND (device_cost_cents IS NULL OR (device_cost_cents >= 0 AND copy_medium = 'STORAGE_DEVICE'))
  AND (fee_cap_cents IS NULL OR (fee_cap_cents >= 0 AND (fee_cents IS NULL OR fee_cents <= fee_cap_cents)))
  AND (access_kind IS NULL OR status <> 'COMPLETED' OR (fee_cap_cents IS NOT NULL AND fee_includes_gst IS NOT NULL))
  AND (also_sale_certificate IS NULL OR access_kind = 'RECORDS'));

COMMIT;
