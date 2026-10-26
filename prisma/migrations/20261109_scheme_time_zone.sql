-- Multi-jurisdiction plan, phase 1c (26 Oct 2026): a time zone for each
-- building. A building's dates (today, due dates, the date of a payment or
-- an interest charge, deadlines) are days in its own time zone, not in UTC
-- and not always in Sydney.
--
-- APPLY THIS BEFORE DEPLOYING THE CODE THAT NEEDS IT: the app reads every
-- column of schemes, so the new code fails against the old table. The old
-- code works against the new table (the column has a default).
--
-- Every existing building is in NSW. NSW is on Sydney time except Broken
-- Hill (postcode 2880, central time) and Lord Howe Island (postcode 2898);
-- those two are set from the postcode, as new buildings are
-- (src/lib/jurisdiction/time-zone.ts). The two exceptions are to be
-- confirmed against the Standard Time Act 1987 (NSW).
--
-- schemes_time_zone_check allows only the Australian zones the platform
-- knows (src/lib/jurisdiction/time-zone.ts defaultTimeZone), so a mistyped
-- value cannot stop a building's pages and daily job. A new jurisdiction's
-- zone (New Zealand) is added to it in the same release as its rule pack.
--
-- Meetings: from this release a meeting's date and time are read in the
-- meeting's time zone. Meetings made before it held the local time as if it
-- were UTC. On 26 Oct 2026 production had no meetings; check again before
-- applying (SELECT count(*) FROM meetings), because any meeting by then needs
-- its times converted.
--
-- Applied by hand in the Supabase SQL editor, like the other migrations.

BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE public.schemes
  ADD COLUMN IF NOT EXISTS time_zone varchar(64) NOT NULL DEFAULT 'Australia/Sydney';

UPDATE public.schemes SET time_zone = 'Australia/Broken_Hill'
WHERE upper(trim(state)) = 'NSW' AND trim(postcode) = '2880' AND time_zone = 'Australia/Sydney';
UPDATE public.schemes SET time_zone = 'Australia/Lord_Howe'
WHERE upper(trim(state)) = 'NSW' AND trim(postcode) = '2898' AND time_zone = 'Australia/Sydney';

ALTER TABLE public.schemes DROP CONSTRAINT IF EXISTS schemes_time_zone_check;
ALTER TABLE public.schemes ADD CONSTRAINT schemes_time_zone_check CHECK (time_zone IN (
  'Australia/Sydney', 'Australia/Broken_Hill', 'Australia/Lord_Howe', 'Australia/Melbourne',
  'Australia/Brisbane', 'Australia/Adelaide', 'Australia/Perth', 'Australia/Hobart', 'Australia/Darwin'
));
COMMIT;
