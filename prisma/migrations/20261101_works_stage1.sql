-- Works marketplace, stage 1 (25 Oct 2026): the owner's request and the
-- committee's review by electronic vote.
-- Plan: https://claude.ai/artifact/VAj6SJ5PrsVry3HJ5RAYbF
--
-- APPLY THIS BEFORE DEPLOYING THE CODE THAT NEEDS IT: the app reads every
-- column of works_requests, so the new code fails against the old table.
-- The old code works against the new tables, so applying this first is
-- safe. Idempotent. Applied by hand through the Supabase SQL editor.

-- 1. A request's trade, and why it was returned to the owner.
ALTER TABLE public.works_requests
  ADD COLUMN IF NOT EXISTS trade varchar(60),
  ADD COLUMN IF NOT EXISTS return_reason text;

-- 2. Each building's works settings.
CREATE TABLE IF NOT EXISTS public.works_settings (
  scheme_id uuid PRIMARY KEY REFERENCES public.schemes(id) ON DELETE CASCADE,
  approval_rule text NOT NULL DEFAULT 'TWO' CHECK (approval_rule IN ('ONE', 'TWO', 'MAJORITY')),
  urgent_limit numeric(12, 2) CHECK (urgent_limit IS NULL OR urgent_limit >= 0),
  adviser_may_decide boolean NOT NULL DEFAULT false,
  adviser_limit numeric(12, 2) CHECK (adviser_limit IS NULL OR adviser_limit >= 0),
  updated_by_id uuid REFERENCES public.profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. The building's preferred contractor for each trade (urgent works).
CREATE TABLE IF NOT EXISTS public.works_preferred_contractors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id uuid NOT NULL REFERENCES public.schemes(id) ON DELETE CASCADE,
  trade varchar(60) NOT NULL,
  contractor_business_id uuid NOT NULL REFERENCES public.contractor_businesses(id),
  created_by_id uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scheme_id, trade)
);

-- 4. Works decisions and the committee's votes on them.
CREATE TABLE IF NOT EXISTS public.works_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id uuid NOT NULL REFERENCES public.schemes(id) ON DELETE CASCADE,
  request_id uuid NOT NULL REFERENCES public.works_requests(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'ROUTE' CHECK (kind IN ('ROUTE', 'URGENT_ORDER', 'QUOTE')),
  outcome text NOT NULL,
  note text,
  proposed_by_id uuid NOT NULL REFERENCES public.profiles(id),
  rule text NOT NULL CHECK (rule IN ('ONE', 'TWO', 'MAJORITY', 'URGENT', 'DELEGATED')),
  required_votes integer NOT NULL CHECK (required_votes >= 1),
  committee_size integer NOT NULL CHECK (committee_size >= 0),
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'DECIDED', 'NOT_AGREED', 'WITHDRAWN')),
  decided_at timestamptz,
  by_delegation boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (kind <> 'ROUTE' OR outcome IN ('URGENT', 'QUOTES', 'RETURN', 'DECLINE'))
);
CREATE INDEX IF NOT EXISTS works_decisions_scheme_status_idx ON public.works_decisions (scheme_id, status);
CREATE INDEX IF NOT EXISTS works_decisions_request_idx ON public.works_decisions (request_id);
-- Only one open decision of a kind per request at a time.
CREATE UNIQUE INDEX IF NOT EXISTS works_decisions_one_open_idx
  ON public.works_decisions (request_id, kind) WHERE status = 'OPEN';

CREATE TABLE IF NOT EXISTS public.works_decision_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id uuid NOT NULL REFERENCES public.works_decisions(id) ON DELETE CASCADE,
  voter_id uuid NOT NULL REFERENCES public.profiles(id),
  vote text NOT NULL CHECK (vote IN ('FOR', 'AGAINST')),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (decision_id, voter_id)
);

-- 5. Server only, like every other table (20261023_close_data_api.sql).
ALTER TABLE public.works_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.works_preferred_contractors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.works_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.works_decision_votes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.works_settings, public.works_preferred_contractors, public.works_decisions, public.works_decision_votes
  FROM PUBLIC, anon, authenticated;

-- 6. Photos on a works request: the "works_photo" upload purpose.
ALTER TABLE public.storage_uploads DROP CONSTRAINT IF EXISTS storage_uploads_purpose_check;
ALTER TABLE public.storage_uploads ADD CONSTRAINT storage_uploads_purpose_check
  CHECK (purpose IN ('library', 'committee_library', 'insurance', 'claim_evidence', 'finance_document', 'payment_confirmation', 'scheme_photo', 'works_photo'));
