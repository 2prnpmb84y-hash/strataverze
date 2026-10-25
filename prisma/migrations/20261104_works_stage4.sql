-- Works marketplace, stage 4 (25 Oct 2026): completion, invoice and payment.
-- Plan: https://claude.ai/artifact/VAj6SJ5PrsVry3HJ5RAYbF
--
-- The contractor reports the work done and the committee (or the Adviser)
-- confirms it. The contractor invoices against the work order; anything
-- over the order's not-to-exceed amount needs a committee vote. A committee
-- member (or the Adviser, where the building allows it) chooses the fund and
-- expense account, which sends it to the building's finance as a supplier
-- invoice for the contractor: the usual payment approvals, ledger posting,
-- bank detail checks and payment by the Adviser then apply unchanged.
--
-- APPLY THIS BEFORE DEPLOYING THE CODE THAT NEEDS IT: the app reads every
-- column of the tables changed here, so the new code fails against the old
-- tables. The old code works against the new tables (every new column is
-- nullable or has a default), so applying this first is safe. Idempotent.

-- The links that decide which payment path an invoice takes (work order,
-- contractor, works invoice) are NO ACTION (checked at the end of each statement, so deleting a whole building still cascades), so deleting a row on its own can never
-- quietly turn a marketplace invoice back into one the old path would pay.

-- 1. A works invoice against a work order, with its document and any reason for going over.
ALTER TABLE public.works_invoices
  ADD COLUMN IF NOT EXISTS work_order_id uuid REFERENCES public.works_work_orders(id) ON DELETE NO ACTION,
  ADD COLUMN IF NOT EXISTS document_path text,
  ADD COLUMN IF NOT EXISTS document_name varchar(500),
  ADD COLUMN IF NOT EXISTS excess_reason text,
  ADD COLUMN IF NOT EXISTS return_reason text,
  ADD COLUMN IF NOT EXISTS coded_by_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS works_invoices_work_order_idx ON public.works_invoices (work_order_id);
-- One invoice in progress per work order (a returned or cancelled one can be replaced).
CREATE UNIQUE INDEX IF NOT EXISTS works_invoices_one_live_per_order_idx
  ON public.works_invoices (work_order_id)
  WHERE work_order_id IS NOT NULL AND status NOT IN ('RETURNED', 'CANCELLED');

-- 2. One completion report waiting at a time per work order.
CREATE UNIQUE INDEX IF NOT EXISTS works_completion_one_open_per_order_idx
  ON public.works_completion_submissions (work_order_id)
  WHERE status = 'SUBMITTED';

-- 3. A variation decision is about one invoice.
ALTER TABLE public.works_decisions
  ADD COLUMN IF NOT EXISTS invoice_id uuid REFERENCES public.works_invoices(id) ON DELETE SET NULL;

-- 4. The building's finance supplier for a contractor, one per building.
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS contractor_business_id uuid REFERENCES public.contractor_businesses(id) ON DELETE NO ACTION;
CREATE UNIQUE INDEX IF NOT EXISTS suppliers_one_per_contractor_idx
  ON public.suppliers (scheme_id, contractor_business_id)
  WHERE contractor_business_id IS NOT NULL;

-- 5. The supplier invoice a works invoice became, one each.
ALTER TABLE public.supplier_invoices
  ADD COLUMN IF NOT EXISTS works_invoice_id uuid REFERENCES public.works_invoices(id) ON DELETE NO ACTION;
CREATE UNIQUE INDEX IF NOT EXISTS supplier_invoices_one_per_works_invoice_idx
  ON public.supplier_invoices (works_invoice_id)
  WHERE works_invoice_id IS NOT NULL;

-- 6. Whether the Adviser may choose the fund and account for works invoices (off unless the committee turns it on).
ALTER TABLE public.works_settings
  ADD COLUMN IF NOT EXISTS adviser_may_code_invoices boolean NOT NULL DEFAULT false;

-- 7. Completion photos and the contractor's invoice: two upload purposes.
ALTER TABLE public.storage_uploads DROP CONSTRAINT IF EXISTS storage_uploads_purpose_check;
ALTER TABLE public.storage_uploads ADD CONSTRAINT storage_uploads_purpose_check
  CHECK (purpose IN ('library', 'committee_library', 'insurance', 'claim_evidence', 'finance_document', 'payment_confirmation', 'scheme_photo', 'works_photo', 'works_quote', 'works_completion', 'works_invoice'));
