-- Financials review B7 and B8 (26 Oct 2026): keep the interest brought
-- across at takeover apart from interest charged here.
--
-- A notice brought across at takeover stored the old system's interest in
-- interest_charged and the interest it had received in amount_paid. New
-- interest was then compared with the old interest and never charged, and a
-- lot's account showed the old interest as paid. These two columns hold the
-- takeover figures, so interest charged and payments received here can be
-- worked out on their own.
--
-- APPLY THIS BEFORE DEPLOYING THE CODE THAT NEEDS IT: the app reads every
-- column of levy_notices, so the new code fails against the old table. The
-- old code works against the new table (both columns have a default).
--
-- Backfill for notices already brought across: the takeover interest
-- charged is the interest charged, less any interest charged here since
-- (interest journals for the notice); the takeover interest paid is the
-- amount paid, less payments received here that were not reversed.
-- Idempotent: only notices whose takeover figures are still 0 are filled.
--
-- Applied by hand in the Supabase SQL editor, like the other migrations.

BEGIN;
ALTER TABLE public.levy_notices
  ADD COLUMN IF NOT EXISTS migrated_interest_charged numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS migrated_interest_paid numeric(12,2) NOT NULL DEFAULT 0;

UPDATE public.levy_notices n SET
  migrated_interest_charged = greatest(0, n.interest_charged - coalesce((
    SELECT sum(l.debit)
    FROM public.journal_entries j
    JOIN public.journal_lines l ON l.journal_entry_id = j.id
    JOIN public.account_codes a ON a.id = l.account_code_id
    WHERE j.source_type = 'INTEREST' AND j.source_id = n.id AND j.status = 'POSTED'
      AND a.account_sub_type = 'ACCOUNTS_RECEIVABLE'
  ), 0)),
  migrated_interest_paid = greatest(0, n.amount_paid - coalesce((
    SELECT sum(p.amount) FROM public.levy_payments p WHERE p.levy_notice_id = n.id AND p.reversed_at IS NULL
  ), 0))
WHERE n.migration_batch_id IS NOT NULL
  AND n.migrated_interest_charged = 0
  AND n.migrated_interest_paid = 0;
COMMIT;
