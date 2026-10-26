-- Multi-jurisdiction plan, phase 0 (26 Oct 2026): remove the VIC defaults.
-- Plan: https://claude.ai/artifact/4mgrKi2E7VeBdSqTSgZhyc
--
-- StrataVerze applies NSW strata law, but a building's state defaulted to
-- VIC. Only NSW buildings can be set up now (src/config/jurisdictions.ts),
-- so a building defaults to NSW. A business or contractor address has no
-- default state: it is whatever the person enters.
--
-- Defaults only: no row changes. Checked 26 Oct 2026: both buildings in
-- production are already NSW, and there are no organisation rows.
-- Safe in either order with the code: the code always sends a building's
-- state, and leaves the other two blank when not entered. Idempotent.

BEGIN;
ALTER TABLE public.schemes ALTER COLUMN state SET DEFAULT 'NSW';
ALTER TABLE public.organisations ALTER COLUMN state DROP DEFAULT;
ALTER TABLE public.contractor_businesses ALTER COLUMN state DROP DEFAULT;
COMMIT;
