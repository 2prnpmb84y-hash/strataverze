-- Hello Zai payments, switched off (31 Oct 2026). Idempotent. Applied by hand
-- in the Supabase SQL editor, like the other migrations, and only with
-- Matthew Wrigley's approval.
--
-- Status: NOT APPLIED. Written only: not applied or rehearsed anywhere. It is
-- applied only with Matthew Wrigley's approval, after a rolled-back rehearsal.
--
-- When to apply: NOT needed before the code deploys. Nothing reads or writes
-- these tables while ZAI_PAYMENTS is off (src/lib/payments/zai/config.ts),
-- and it is off everywhere: no environment sets it. It MUST be applied before
-- ZAI_PAYMENTS is switched on in any environment, or the Zai webhook fails
-- when it stores an event. Switching on is itself gated on the Zai
-- assessment's conditions (21 Oct 2026): the legal opinion on trust money,
-- Zai's approval of stored value and sub-wallets, sandbox access, and KYB for
-- owners corporations. None of them is met yet.
--
-- zai_users: the Zai users StrataVerze creates (POST /users with an id
-- StrataVerze supplies): one for each owners corporation (role
-- OWNERS_CORPORATION, assessment option B) and one for each supplier paid
-- through an Item (SUPPLIER, with supplier_id). verification_state holds
-- Zai's user verification state (pending, pending_check, approved_kyc_check,
-- approved, https://developer.hellozai.com/docs/statuses, read 31 Oct 2026).
-- One owners corporation user for each building (zai_users_one_oc_idx).
--
-- zai_wallet_accounts: each user's main wallet account, and the sub-wallets
-- kept for one fund each (SUB_WALLET with fund_id). zai_account_id is the id
-- Zai gave. One main wallet for each Zai user (zai_wallet_accounts_one_main_idx)
-- and one sub-wallet for each fund of a building
-- (zai_wallet_accounts_one_sub_per_fund_idx). A wallet's building is its
-- user's: (zai_user_row_id, scheme_id) is a key to zai_users (id, scheme_id).
--
-- zai_payment_references: the reference Zai issued that identifies a lot's
-- payments (PAYID, VIRTUAL_ACCOUNT or BPAY_CRN), with the wallet they arrive
-- in. StrataVerze never generates one. A value identifies one lot only. The
-- wallet is one of the building's own: (zai_wallet_account_id, scheme_id) is a
-- key to zai_wallet_accounts (zai_account_id, scheme_id). That the lot is the
-- building's is checked by the app (lots has no (id, scheme_id) key, and no
-- existing table changes here).
--
-- zai_transactions: money moving through Zai as StrataVerze knows it, one row
-- for each Zai object (object type and id): a payment received (IN), matched
-- to a lot or left in the unmatched queue, and linked to its receipt journal
-- once receipted; or a payout StrataVerze asked for (OUT), with the supplier
-- invoice, who asked for it and who released it (never the same person), and
-- the idempotency key sent to Zai. The ledger (journal_entries and
-- journal_lines) stays the system of record. A payment received has a
-- journal exactly when it is RECEIPTED or REVERSAL_REVIEW, so a receipted
-- payment can never be put back in a queue to be receipted again (review H2). zai_updated_at is the updated_at
-- of the newest payload applied, so an older one delivered later is not
-- applied (Zai does not guarantee the order of delivery,
-- https://developer.hellozai.com/docs/webhooks, read 31 Oct 2026).
--
-- zai_webhook_events: every webhook whose signature verified, stored once:
-- dedupe_key is the SHA-256 of the body as received, so a repeated delivery of
-- the same payload is one row. stored_body is the body with the payer's name,
-- BSB and account number removed (payin_details is cut down to the PayID), so
-- no payer bank details are kept (decision D7 for how long the rest is kept).
--
-- Keys: the scheme, lot, fund, supplier, supplier invoice and journal keys are
-- foreign keys here and not declared in the contract, so no existing model
-- changes (as for pending_resolution_lots). Deleting a building cascades to
-- its rows in zai_users, zai_wallet_accounts, zai_payment_references and
-- zai_transactions (those with its scheme_id). It does not reach
-- zai_webhook_events, which have no building, or zai_transactions with no
-- building (payments into a wallet no building has). The keys between the Zai
-- tables, and from them to lots, funds, suppliers, supplier invoices and
-- journals, use the default NO ACTION, which is checked at the end of the
-- statement: rows deleted in the same cascade do not block it, while
-- deleting only a lot, fund, supplier, invoice, journal, Zai user or wallet
-- that a remaining Zai row relies on is blocked.
--
-- Every existing row passes, by construction (not by reading the data): the
-- tables are new and start empty, and no existing table gains a column, a
-- check or a trigger. No NSW, Queensland or draft pack row changes.
--
-- RLS on, no policies: the Data API is denied; the app connects as the owner.
-- The index and key names are the ones the emitted contract
-- (src/prisma/contract.json) expects. Database only, not in the contract (as
-- for migration_batches_one_executed and the foreign keys): the partial
-- unique indexes zai_users_one_oc_idx, zai_wallet_accounts_one_main_idx and
-- zai_wallet_accounts_one_sub_per_fund_idx, and the unique keys
-- zai_users_id_scheme_id_key and zai_wallet_accounts_zai_account_id_scheme_id_key
-- that the composite foreign keys use. Every name is within Postgres's
-- 63-character limit.

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.zai_users (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id          uuid NOT NULL,
  role               varchar(30) NOT NULL,
  supplier_id        uuid,
  zai_user_id        varchar(100) NOT NULL,
  zai_company_id     varchar(100),
  verification_state varchar(40) NOT NULL DEFAULT 'pending',
  zai_updated_at     timestamptz,
  created_by         uuid NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT zai_users_scheme_id_fkey FOREIGN KEY (scheme_id) REFERENCES public.schemes(id) ON DELETE CASCADE,
  CONSTRAINT zai_users_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id),
  CONSTRAINT zai_users_zai_user_id_key UNIQUE (zai_user_id),
  -- For the wallets' composite key to their user's building (database only).
  CONSTRAINT zai_users_id_scheme_id_key UNIQUE (id, scheme_id),
  CONSTRAINT zai_users_role_check CHECK (role IN ('OWNERS_CORPORATION', 'SUPPLIER')),
  -- A supplier user names its supplier; an owners corporation user names none.
  CONSTRAINT zai_users_supplier_check CHECK ((role = 'SUPPLIER') = (supplier_id IS NOT NULL)),
  -- Zai's user ids cannot contain a '.' (POST /users, https://developer.hellozai.com/reference/createuser, read 31 Oct 2026).
  CONSTRAINT zai_users_zai_user_id_check CHECK (zai_user_id <> '' AND position('.' in zai_user_id) = 0),
  CONSTRAINT zai_users_verification_state_check CHECK (verification_state IN ('pending', 'pending_check', 'approved_kyc_check', 'approved'))
);
CREATE INDEX IF NOT EXISTS zai_users_scheme_id_role_idx ON public.zai_users (scheme_id, role);
-- One owners corporation user for each building (assessment option B).
CREATE UNIQUE INDEX IF NOT EXISTS zai_users_one_oc_idx ON public.zai_users (scheme_id) WHERE role = 'OWNERS_CORPORATION';
ALTER TABLE public.zai_users ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.zai_wallet_accounts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id       uuid NOT NULL,
  zai_user_row_id uuid NOT NULL,
  kind            varchar(30) NOT NULL,
  fund_id         uuid,
  zai_account_id  varchar(100) NOT NULL,
  active          boolean NOT NULL DEFAULT true,
  zai_updated_at  timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT zai_wallet_accounts_scheme_id_fkey FOREIGN KEY (scheme_id) REFERENCES public.schemes(id) ON DELETE CASCADE,
  -- A wallet's building is its user's building.
  CONSTRAINT zai_wallet_accounts_user_scheme_fkey FOREIGN KEY (zai_user_row_id, scheme_id) REFERENCES public.zai_users(id, scheme_id),
  CONSTRAINT zai_wallet_accounts_fund_id_fkey FOREIGN KEY (fund_id) REFERENCES public.funds(id),
  CONSTRAINT zai_wallet_accounts_zai_account_id_key UNIQUE (zai_account_id),
  -- For the payment references' composite key to their wallet's building (database only).
  CONSTRAINT zai_wallet_accounts_zai_account_id_scheme_id_key UNIQUE (zai_account_id, scheme_id),
  CONSTRAINT zai_wallet_accounts_kind_check CHECK (kind IN ('MAIN', 'SUB_WALLET')),
  -- A sub-wallet holds one fund; the main wallet holds none.
  CONSTRAINT zai_wallet_accounts_fund_check CHECK ((kind = 'SUB_WALLET') = (fund_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS zai_wallet_accounts_scheme_id_idx ON public.zai_wallet_accounts (scheme_id);
CREATE INDEX IF NOT EXISTS zai_wallet_accounts_zai_user_row_id_idx ON public.zai_wallet_accounts (zai_user_row_id);
-- One main wallet for each Zai user, and one sub-wallet for each fund of a building.
CREATE UNIQUE INDEX IF NOT EXISTS zai_wallet_accounts_one_main_idx ON public.zai_wallet_accounts (zai_user_row_id) WHERE kind = 'MAIN';
CREATE UNIQUE INDEX IF NOT EXISTS zai_wallet_accounts_one_sub_per_fund_idx ON public.zai_wallet_accounts (scheme_id, fund_id) WHERE kind = 'SUB_WALLET';
ALTER TABLE public.zai_wallet_accounts ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.zai_payment_references (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id             uuid NOT NULL,
  lot_id                uuid NOT NULL,
  method                varchar(30) NOT NULL,
  value                 varchar(200) NOT NULL,
  zai_wallet_account_id varchar(100) NOT NULL,
  status                varchar(40) NOT NULL DEFAULT 'pending_activation',
  created_by            uuid NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT zai_payment_references_scheme_id_fkey FOREIGN KEY (scheme_id) REFERENCES public.schemes(id) ON DELETE CASCADE,
  CONSTRAINT zai_payment_references_lot_id_fkey FOREIGN KEY (lot_id) REFERENCES public.lots(id),
  -- The wallet the payments arrive in is one of the building's own.
  CONSTRAINT zai_payment_references_wallet_fkey FOREIGN KEY (zai_wallet_account_id, scheme_id) REFERENCES public.zai_wallet_accounts(zai_account_id, scheme_id),
  CONSTRAINT zai_payment_references_method_value_key UNIQUE (method, value),
  CONSTRAINT zai_payment_references_method_check CHECK (method IN ('PAYID', 'VIRTUAL_ACCOUNT', 'BPAY_CRN')),
  CONSTRAINT zai_payment_references_value_check CHECK (value <> ''),
  -- Zai's virtual account and PayID statuses (https://developer.hellozai.com/docs/statuses, read 31 Oct 2026), and DEREGISTERED.
  CONSTRAINT zai_payment_references_status_check CHECK (status IN ('pending_activation', 'active', 'activation_failed', 'DEREGISTERED'))
);
CREATE INDEX IF NOT EXISTS zai_payment_references_scheme_id_lot_id_idx ON public.zai_payment_references (scheme_id, lot_id);
ALTER TABLE public.zai_payment_references ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.zai_transactions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id           uuid,
  direction           varchar(3) NOT NULL,
  zai_object_type     varchar(40) NOT NULL,
  zai_object_id       varchar(100) NOT NULL,
  zai_state           varchar(40) NOT NULL,
  zai_updated_at      timestamptz NOT NULL,
  zai_type            varchar(40),
  zai_type_method     varchar(40),
  zai_account_id      varchar(100),
  amount              numeric(14,2) NOT NULL,
  currency            varchar(3) NOT NULL,
  reference_value     varchar(200),
  lot_id              uuid,
  match_status        varchar(30) NOT NULL,
  match_reason        varchar(200),
  journal_entry_id    uuid,
  supplier_invoice_id uuid,
  idempotency_key     varchar(100),
  initiated_by        uuid,
  released_by         uuid,
  released_at         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT zai_transactions_scheme_id_fkey FOREIGN KEY (scheme_id) REFERENCES public.schemes(id) ON DELETE CASCADE,
  CONSTRAINT zai_transactions_lot_id_fkey FOREIGN KEY (lot_id) REFERENCES public.lots(id),
  CONSTRAINT zai_transactions_journal_entry_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id),
  CONSTRAINT zai_transactions_supplier_invoice_id_fkey FOREIGN KEY (supplier_invoice_id) REFERENCES public.supplier_invoices(id),
  CONSTRAINT zai_transactions_zai_object_type_zai_object_id_key UNIQUE (zai_object_type, zai_object_id),
  CONSTRAINT zai_transactions_idempotency_key_key UNIQUE (idempotency_key),
  CONSTRAINT zai_transactions_direction_check CHECK (direction IN ('IN', 'OUT')),
  -- The webhook object types Zai documents for money (https://developer.hellozai.com/docs/webhooks, read 31 Oct 2026).
  CONSTRAINT zai_transactions_zai_object_type_check CHECK (zai_object_type IN ('transactions', 'batch_transactions', 'items', 'disbursements')),
  CONSTRAINT zai_transactions_amount_check CHECK (amount >= 0),
  CONSTRAINT zai_transactions_match_status_check CHECK (
    (direction = 'IN' AND match_status IN ('UNMATCHED', 'NEEDS_REVIEW', 'RECEIPTED', 'REVERSAL_REVIEW'))
    OR (direction = 'OUT' AND match_status IN ('AWAITING_RELEASE', 'RELEASED', 'SENT', 'FAILED', 'OUTCOME_UNKNOWN'))),
  -- A receipted payment (and one under reversal review, which was receipted) names its lot and its receipt journal.
  CONSTRAINT zai_transactions_receipted_check CHECK (match_status NOT IN ('RECEIPTED', 'REVERSAL_REVIEW') OR (lot_id IS NOT NULL AND journal_entry_id IS NOT NULL)),
  -- A payment received with a journal is receipted: it is never put back in a queue to be receipted again (review H2).
  -- Payouts are left out: a payout's payment journal sits beside its own statuses.
  CONSTRAINT zai_transactions_journal_status_check CHECK (direction = 'OUT' OR journal_entry_id IS NULL OR match_status IN ('RECEIPTED', 'REVERSAL_REVIEW')),
  -- A payout has its invoice, its key and who asked for it; the person who releases it is never that person.
  CONSTRAINT zai_transactions_out_check CHECK (
    direction = 'IN'
    OR (supplier_invoice_id IS NOT NULL AND idempotency_key IS NOT NULL AND initiated_by IS NOT NULL
        AND (released_by IS NULL OR released_by <> initiated_by)
        AND ((released_by IS NULL) = (released_at IS NULL))
        AND (match_status = 'AWAITING_RELEASE' OR released_by IS NOT NULL))),
  -- The payout fields are for payouts only.
  CONSTRAINT zai_transactions_in_check CHECK (
    direction = 'OUT'
    OR (supplier_invoice_id IS NULL AND idempotency_key IS NULL AND initiated_by IS NULL AND released_by IS NULL AND released_at IS NULL))
);
CREATE INDEX IF NOT EXISTS zai_transactions_scheme_id_match_status_idx ON public.zai_transactions (scheme_id, match_status);
ALTER TABLE public.zai_transactions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.zai_webhook_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dedupe_key        varchar(64) NOT NULL,
  object_type       varchar(40) NOT NULL,
  object_id         varchar(100),
  object_updated_at timestamptz,
  signed_at         timestamptz NOT NULL,
  stored_body       text NOT NULL,
  status            varchar(20) NOT NULL DEFAULT 'RECEIVED',
  error             varchar(500),
  received_at       timestamptz NOT NULL DEFAULT now(),
  processed_at      timestamptz,
  CONSTRAINT zai_webhook_events_dedupe_key_key UNIQUE (dedupe_key),
  -- The SHA-256 of the body as received, in lower-case hex.
  CONSTRAINT zai_webhook_events_dedupe_key_check CHECK (dedupe_key ~ '^[0-9a-f]{64}$'),
  CONSTRAINT zai_webhook_events_status_check CHECK (status IN ('RECEIVED', 'PROCESSED', 'STALE', 'IGNORED', 'FAILED'))
);
CREATE INDEX IF NOT EXISTS zai_webhook_events_object_type_object_id_idx ON public.zai_webhook_events (object_type, object_id);
CREATE INDEX IF NOT EXISTS zai_webhook_events_status_idx ON public.zai_webhook_events (status);
ALTER TABLE public.zai_webhook_events ENABLE ROW LEVEL SECURITY;

COMMIT;
