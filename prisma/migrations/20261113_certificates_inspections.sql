-- NSW information certificates (s 184) and records inspections (s 182)
-- (26 Oct 2026). A certificate is drafted from StrataVerze's records,
-- completed by the adviser and issued; its items are kept as issued. The
-- fee (from the rule pack) is recorded and collected outside StrataVerze.
--
-- The app reads these tables only on the pages added with them; apply this
-- before the code deploys.
-- Applied by hand in the Supabase SQL editor, like the other migrations.

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.sale_certificates (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id             uuid NOT NULL REFERENCES public.schemes(id) ON DELETE CASCADE,
  lot_id                uuid NOT NULL REFERENCES public.lots(id) ON DELETE CASCADE,
  number                integer NOT NULL CHECK (number > 0),
  status                text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'ISSUED', 'CANCELLED')),
  requested_on          date NOT NULL,
  requester_type        text NOT NULL CHECK (requester_type IN ('OWNER', 'MORTGAGEE', 'COVENANT_CHARGEE', 'AUTHORISED_PERSON')),
  requester_name        text NOT NULL,
  requester_address     text NOT NULL,
  authorised_by_type    text CHECK (authorised_by_type IN ('OWNER', 'MORTGAGEE', 'COVENANT_CHARGEE')),
  authorised_by_name    text,
  authorised_by_address text,
  items                 jsonb NOT NULL,
  drafted_on            date NOT NULL,
  certificate_date      date,
  fee_cents             integer CHECK (fee_cents >= 0),
  fee_repeat            boolean NOT NULL DEFAULT false,
  fee_paid_on           date,
  rule_pack             varchar(40),
  created_by            uuid NOT NULL,
  issued_by             uuid,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sale_certificates_scheme_id_number_key UNIQUE (scheme_id, number),
  CONSTRAINT sale_certificates_issued_has_date CHECK (status <> 'ISSUED' OR certificate_date IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS sale_certificates_lot_id_idx ON public.sale_certificates(lot_id);
ALTER TABLE public.sale_certificates ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.records_inspections (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id       uuid NOT NULL REFERENCES public.schemes(id) ON DELETE CASCADE,
  lot_id          uuid NOT NULL REFERENCES public.lots(id) ON DELETE CASCADE,
  inspector_type  text NOT NULL CHECK (inspector_type IN ('OWNER', 'AUTHORISED_PERSON')),
  inspector_name  text NOT NULL,
  authorised_by   text,
  requested_on    date NOT NULL,
  status          text NOT NULL DEFAULT 'REQUESTED' CHECK (status IN ('REQUESTED', 'SCHEDULED', 'COMPLETED', 'CANCELLED')),
  scheduled_for   timestamptz,
  set_by_notice   boolean NOT NULL DEFAULT false,
  place           text,
  minutes         integer CHECK (minutes > 0),
  fee_cents       integer CHECK (fee_cents >= 0),
  fee_paid_on     date,
  notes           text,
  created_by      uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS records_inspections_scheme_id_status_idx ON public.records_inspections(scheme_id, status);
-- RLS on, no policies: the Data API is denied; the app connects as the owner.
ALTER TABLE public.records_inspections ENABLE ROW LEVEL SECURITY;

COMMIT;
