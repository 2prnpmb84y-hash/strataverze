-- Works marketplace, stage 3 (25 Oct 2026): quotes from the marketplace.
-- Plan: https://claude.ai/artifact/VAj6SJ5PrsVry3HJ5RAYbF
--
-- When the committee decides to get quotes, a marketplace RFQ opens.
-- Approved contractors in the trade who work in the building's postcode see
-- a summary and express interest; the committee invites some; they quote;
-- the committee approves one by vote and a work order goes out.
--
-- APPLY THIS BEFORE DEPLOYING THE CODE THAT NEEDS IT: the app reads every
-- column of the tables changed here, so the new code fails against the old
-- tables. The old code works against the new tables (it always sets
-- scope_id), so applying this first is safe. Idempotent.

-- 1. A marketplace RFQ has no scope; it belongs to its request.
ALTER TABLE public.works_rfqs ALTER COLUMN scope_id DROP NOT NULL;
ALTER TABLE public.works_rfqs
  ADD COLUMN IF NOT EXISTS request_id uuid REFERENCES public.works_requests(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS marketplace boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS trade varchar(60),
  ADD COLUMN IF NOT EXISTS suburb varchar(100),
  ADD COLUMN IF NOT EXISTS postcode varchar(4),
  ADD COLUMN IF NOT EXISTS interest_closes_at timestamptz,
  ADD COLUMN IF NOT EXISTS quote_closes_at timestamptz,
  ADD COLUMN IF NOT EXISTS invite_limit integer NOT NULL DEFAULT 3 CHECK (invite_limit BETWEEN 1 AND 10),
  ADD COLUMN IF NOT EXISTS no_interest_notified_at timestamptz,
  ADD COLUMN IF NOT EXISTS quotes_closed_notified_at timestamptz;
CREATE INDEX IF NOT EXISTS works_rfqs_request_idx ON public.works_rfqs (request_id);
CREATE INDEX IF NOT EXISTS works_rfqs_marketplace_open_idx ON public.works_rfqs (status, trade) WHERE marketplace;
-- One marketplace RFQ in progress per request.
CREATE UNIQUE INDEX IF NOT EXISTS works_rfqs_one_open_per_request_idx
  ON public.works_rfqs (request_id)
  WHERE marketplace AND request_id IS NOT NULL AND status IN ('INTEREST', 'QUOTING', 'CLOSED');

-- 2. Contractors' interest in a marketplace RFQ.
CREATE TABLE IF NOT EXISTS public.works_rfq_interests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id uuid NOT NULL REFERENCES public.works_rfqs(id) ON DELETE CASCADE,
  contractor_business_id uuid NOT NULL REFERENCES public.contractor_businesses(id),
  created_by_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  withdrawn_at timestamptz,
  UNIQUE (rfq_id, contractor_business_id)
);
ALTER TABLE public.works_rfq_interests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.works_rfq_interests FROM PUBLIC, anon, authenticated;

-- 3. The contractor's own quote document.
ALTER TABLE public.works_quotations
  ADD COLUMN IF NOT EXISTS document_path text,
  ADD COLUMN IF NOT EXISTS document_name varchar(500);

-- 4. Decisions: the summary contractors see (QUOTES), and the quote approved (QUOTE).
ALTER TABLE public.works_decisions
  ADD COLUMN IF NOT EXISTS summary text,
  ADD COLUMN IF NOT EXISTS quotation_id uuid REFERENCES public.works_quotations(id) ON DELETE SET NULL;

-- 5. The postcodes each contractor works in.
ALTER TABLE public.contractor_businesses
  ADD COLUMN IF NOT EXISTS service_postcodes text[] NOT NULL DEFAULT '{}';

-- 6. A contractor's quote document: the "works_quote" upload purpose.
ALTER TABLE public.storage_uploads DROP CONSTRAINT IF EXISTS storage_uploads_purpose_check;
ALTER TABLE public.storage_uploads ADD CONSTRAINT storage_uploads_purpose_check
  CHECK (purpose IN ('library', 'committee_library', 'insurance', 'claim_evidence', 'finance_document', 'payment_confirmation', 'scheme_photo', 'works_photo', 'works_quote'));
