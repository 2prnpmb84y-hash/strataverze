-- Works marketplace, stage 2 (25 Oct 2026): urgent work orders.
-- Plan: https://claude.ai/artifact/VAj6SJ5PrsVry3HJ5RAYbF
--
-- An urgent decision issues a work order to the building's preferred
-- contractor straight away, with no contract and a not-to-exceed amount.
-- The contractor accepts or declines it in the supplier portal.
--
-- APPLY THIS BEFORE DEPLOYING THE CODE THAT NEEDS IT: the app reads every
-- column of works_work_orders and works_decisions, so the new code fails
-- against the old tables. The old code works against the new tables (it
-- always sets contract_id), so applying this first is safe. Idempotent.

-- 1. An urgent work order has no contract; it belongs to its request.
ALTER TABLE public.works_work_orders ALTER COLUMN contract_id DROP NOT NULL;
ALTER TABLE public.works_work_orders
  ADD COLUMN IF NOT EXISTS request_id uuid REFERENCES public.works_requests(id),
  ADD COLUMN IF NOT EXISTS amount_limit numeric(12, 2) CHECK (amount_limit IS NULL OR amount_limit > 0),
  ADD COLUMN IF NOT EXISTS issued_by_id uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS declined_at timestamptz,
  ADD COLUMN IF NOT EXISTS decline_reason text;
CREATE INDEX IF NOT EXISTS works_work_orders_request_idx ON public.works_work_orders (request_id);
-- One live urgent order per request at a time (a declined or cancelled one
-- can be followed by another).
CREATE UNIQUE INDEX IF NOT EXISTS works_work_orders_one_live_per_request_idx
  ON public.works_work_orders (request_id)
  WHERE request_id IS NOT NULL AND status NOT IN ('DECLINED', 'CANCELLED');

-- 2. The not-to-exceed amount agreed with an urgent decision.
ALTER TABLE public.works_decisions
  ADD COLUMN IF NOT EXISTS amount numeric(12, 2) CHECK (amount IS NULL OR amount > 0);
