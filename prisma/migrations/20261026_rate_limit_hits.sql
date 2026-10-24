-- Security stage S7 (web hardening), finding SEC-020.
--
-- Rate limits that hold across every server instance. The in-memory limiter
-- counted per Vercel instance, so a burst spread across instances was not
-- limited. Each attempt at a limited action (sign-in, sign-up, password
-- reset requests, authenticator codes, invitation acceptance, search,
-- uploads) adds a row; the app counts the rows for the key in the window.
--
-- The key is a keyed hash made by the app, so no email address or IP
-- address is stored. Rows older than a day are removed hourly.
--
-- Idempotent. Applied by hand through the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS public.rate_limit_hits (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key_hash text NOT NULL CHECK (length(key_hash) BETWEEN 16 AND 128),
  hit_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rate_limit_hits_key_idx ON public.rate_limit_hits (key_hash, hit_at);
ALTER TABLE public.rate_limit_hits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rate_limit_hits FROM PUBLIC, anon, authenticated, service_role;

-- Hourly clean-up (pg_cron is already enabled for the audit log jobs).
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'strataverze-rate-limit-purge';
SELECT cron.schedule(
  'strataverze-rate-limit-purge',
  '29 * * * *',
  $$DELETE FROM public.rate_limit_hits WHERE hit_at < now() - interval '1 day'$$
);
