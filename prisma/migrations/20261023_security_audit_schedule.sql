-- Security stage S6 (audit log): scheduled jobs, run by pg_cron in the
-- database (times are UTC).
--   minute 17 of every hour   incremental chain check from the last head
--   03:41 every Sunday        full chain check
--   04:23 on the 1st          remove events older than 7 years (approved retention)
-- The admin audit page shows the latest check, and warns when it is stale.
--
-- Idempotent: cron.schedule replaces a job with the same name.

CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule('strataverze-audit-check-hourly', '17 * * * *', $$SELECT public.run_security_audit_check(false)$$);
SELECT cron.schedule('strataverze-audit-check-weekly', '41 3 * * 0', $$SELECT public.run_security_audit_check(true)$$);
SELECT cron.schedule('strataverze-audit-retention', '23 4 1 * *', $$SELECT public.purge_security_audit_events()$$);
