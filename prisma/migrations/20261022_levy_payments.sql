-- StrataVerze: levy consolidation, stage 2
-- One row per payment received against a levy notice, so owner statements and
-- reports can show each payment with its date (levy_notices.amount_paid only
-- holds the running total).
--
-- Additive: run it before deploying the code.

CREATE TABLE IF NOT EXISTS "levy_payments" (
  "id"             uuid NOT NULL DEFAULT gen_random_uuid(),
  "scheme_id"      uuid NOT NULL,
  "levy_notice_id" uuid NOT NULL,
  "lot_id"         uuid NOT NULL,
  "amount"         numeric(12,2) NOT NULL,
  "payment_date"   date NOT NULL,
  "reference"      text,
  "recorded_by"    uuid,
  "created_at"     timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "levy_payments_pkey" PRIMARY KEY (id),
  CONSTRAINT "levy_payments_levy_notice_id_fkey" FOREIGN KEY (levy_notice_id) REFERENCES levy_notices(id) ON DELETE CASCADE,
  CONSTRAINT "levy_payments_amount_positive" CHECK (amount > 0)
);
CREATE INDEX IF NOT EXISTS levy_payments_levy_notice_id_idx ON public.levy_payments USING btree (levy_notice_id);
CREATE INDEX IF NOT EXISTS levy_payments_scheme_id_payment_date_idx ON public.levy_payments USING btree (scheme_id, payment_date);
CREATE INDEX IF NOT EXISTS levy_payments_lot_id_idx ON public.levy_payments USING btree (lot_id);
ALTER TABLE "levy_payments" ENABLE ROW LEVEL SECURITY;
