-- Building selectors (VIC, ACT and WA stage 2, PR 2, 28 Oct 2026). Idempotent.
-- Applied by hand in the Supabase SQL editor, like the other migrations, and
-- only with Matthew Wrigley's approval.
--
-- When to apply: BEFORE the code deploys. The ORM selects every column of
-- schemes and lots, so the new code fails against the old tables. The old
-- code works against the new tables (every new column is nullable, with no
-- default, and the new table is not read by it).
--
-- scheme_selector_values: one row per building and selector, for a selector
-- the building's rule pack lists in BUILDING_SELECTORS as recorded by the
-- adviser (Western Australia's scheme type and tenure, the ACT's scheme type
-- and plan variants, Victoria's owners corporation type). Which values are
-- allowed is the app's check, from the pack. The key and value checks here
-- only keep the shape (a camel case key, an upper case value). The app
-- deletes a building's rows when its state changes. Queensland's regulation
-- module and plan format keep their own columns, unchanged.
--
-- schemes.services_only: whether a Victorian building is a services only
-- owners corporation (OCA s 3), read by the derived tier. Victoria only.
--
-- schemes.replacement_cost: the replacement cost the Western Australian
-- designated strata company test reads (STGR reg 79), in dollars, never
-- negative. Western Australia only.
--
-- lots.occupiable: whether a lot is occupiable (OCA s 3), read by the derived
-- tier. No state check: a lot has no state, and the app clears it when the
-- building's state changes.
--
-- Checked 28 Oct 2026: every building is NSW (schemes_state_has_rule_pack_check
-- allows NSW only), so every existing row has the new columns null and
-- satisfies every new check. The new table starts empty. NSW and Queensland
-- rows are unchanged.

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.scheme_selector_values (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id   uuid NOT NULL REFERENCES public.schemes(id) ON DELETE CASCADE,
  key         text NOT NULL,
  value       text NOT NULL,
  recorded_by uuid,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scheme_selector_values_scheme_id_key_key UNIQUE (scheme_id, key),
  CONSTRAINT scheme_selector_values_key_check CHECK (key ~ '^[a-z][A-Za-z0-9]{0,63}$'),
  CONSTRAINT scheme_selector_values_value_check CHECK (value ~ '^[A-Z0-9_]{1,64}$')
);
-- RLS on, no policies: the Data API is denied; the app connects as the owner.
ALTER TABLE public.scheme_selector_values ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.schemes ADD COLUMN IF NOT EXISTS services_only boolean;

-- Services only is held for a Victorian building only.
ALTER TABLE public.schemes DROP CONSTRAINT IF EXISTS schemes_services_only_state_check;
ALTER TABLE public.schemes ADD CONSTRAINT schemes_services_only_state_check
  CHECK (services_only IS NULL OR state = 'VIC');

ALTER TABLE public.schemes ADD COLUMN IF NOT EXISTS replacement_cost numeric(14,2);

ALTER TABLE public.schemes DROP CONSTRAINT IF EXISTS schemes_replacement_cost_check;
ALTER TABLE public.schemes ADD CONSTRAINT schemes_replacement_cost_check
  CHECK (replacement_cost IS NULL OR replacement_cost >= 0);

-- A replacement cost is held for a Western Australian building only.
ALTER TABLE public.schemes DROP CONSTRAINT IF EXISTS schemes_replacement_cost_state_check;
ALTER TABLE public.schemes ADD CONSTRAINT schemes_replacement_cost_state_check
  CHECK (replacement_cost IS NULL OR state = 'WA');

ALTER TABLE public.lots ADD COLUMN IF NOT EXISTS occupiable boolean;

COMMIT;
