-- Security stage S6 (audit log): scheduled jobs, run by pg_cron in the
-- database (times are UTC).
--   03:17 daily        check the hash chain and record the result
--   04:23 on the 1st   remove events older than 7 years (approved retention)
-- The admin audit page shows the latest check.
--
-- Idempotent: cron.schedule replaces a job with the same name.

CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule('strataverze-audit-chain-check', '17 3 * * *', $$SELECT public.run_security_audit_check()$$);
SELECT cron.schedule('strataverze-audit-retention', '23 4 1 * *', $$SELECT public.purge_security_audit_events()$$);
