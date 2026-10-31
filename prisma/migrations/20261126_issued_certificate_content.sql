-- An issued certificate keeps what it read on the day it was issued (NSW
-- s 184 strata information certificate and Queensland body corporate
-- certificate; fix approved by Matthew Wrigley on 31 Oct 2026, before PR 10).
-- Idempotent. Applied by hand in the Supabase SQL editor, like the other
-- migrations, and ONLY with Matthew Wrigley's approval. Rehearse it first in
-- a transaction that is rolled back.
--
-- Status: NOT APPLIED.
--
-- When to apply: BEFORE the code that needs it deploys. The app reads every
-- column of sale_certificates, so the new code fails against the table
-- without issued_content (the certificate pages, the PDF route and issuing).
-- The code deployed now works against the new table: the column is
-- nullable and nothing it runs writes or reads it.
--
-- The bug: a certificate's PDF was laid out again from the building's rule
-- pack every time it was opened (the title, the section, the plan row, the
-- execution box, the conclusive evidence note and the layout sentence; the
-- owners corporation or body corporate and plan words; the labels of who
-- asked), with the building's current name, plan number and lot number. So a
-- later pack or building change silently altered a certificate already given
-- to a buyer. The items, the requester, the certificate date and the fee were
-- already kept on the row from issue.
--
-- issued_content: everything the PDF reads, written in the same transaction
-- that issues the certificate (status ISSUED, its date, its fee and its rule
-- pack), from the pack in force and the building as it is that day. An
-- issued certificate's PDF is laid out from it alone. A draft has none and
-- keeps following the current pack. The wording itself stays in src/config:
-- nothing here holds statutory text.
--
-- Existing rows: production has 1 issued certificate. It has no
-- issued_content, so its PDF stays laid out from the current pack, and the
-- certificate page says so, until it is backfilled. The backfill is not part
-- of this migration (the wording must come from src/config, not from SQL):
-- scripts/backfill-issued-certificate-content.ts, which lists what it would
-- keep (dry run) and writes only with --apply, once rehearsed and approved.
--
-- The check: only an issued certificate may hold issued_content. Every
-- existing row passes, by construction (not by reading the data): the column
-- is new, so it is null on every row.

BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.sale_certificates ADD COLUMN IF NOT EXISTS issued_content jsonb;

ALTER TABLE public.sale_certificates DROP CONSTRAINT IF EXISTS sale_certificates_issued_content_check;
ALTER TABLE public.sale_certificates ADD CONSTRAINT sale_certificates_issued_content_check
  CHECK (issued_content IS NULL OR (status = 'ISSUED' AND jsonb_typeof(issued_content) = 'object'));

COMMIT;
