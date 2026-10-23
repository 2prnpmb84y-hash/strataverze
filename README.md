# StrataVerze

StrataVerze is an owner-first strata management platform for New South Wales strata schemes under the *Strata Schemes Management Act 2015* (SSMA). Owners, committees, strata managers (advisers), accountants and suppliers each have their own portal. This README covers how to run the app and how the finance module works: its ledger, posting rules, controls, reports and the statutory rules it applies.

> StrataVerze is not legal or accounting advice. The statutory rules below are recorded with their sources in `src/config/statutory.ts`. Check the in-force legislation before relying on them, and have the accounts reviewed by a qualified accountant.

## Contents

- [Running the app](#running-the-app)
- [Finance module](#finance-module)
- [Posting rules](#posting-rules)
- [Controls](#controls)
- [Reports and statements](#reports-and-statements)
- [Cutover from another system](#cutover-from-another-system)
- [Statutory references](#statutory-references)
- [Data, security and migrations](#data-security-and-migrations)
- [Testing](#testing)
- [Known gaps](#known-gaps)

## Running the app

| | |
|---|---|
| Framework | Next.js 16 (App Router, `cacheComponents`) with React and TypeScript |
| Data | Supabase Postgres with row level security, accessed through Prisma 8 (`@prisma/orm-postgres`) |
| Auth and storage | Supabase Auth, and the private `documents` storage bucket |
| Email | Resend |
| PDFs | `pdf-lib` with the Inter font, rendered on the server (no headless browser) |
| Tests | Vitest |
| Hosting | Vercel |

```bash
npm install                 # also syncs the Prisma 8 skills
cp .env.example .env.local  # then fill in the values
npm run dev                 # http://localhost:3000
```

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npx tsc --noEmit` | Type check |
| `npm test` | Vitest, once |
| `npm run contract:emit` | Regenerates `src/prisma/contract.json` and `contract.d.ts` after a change to `prisma/schema.prisma` |

### Environment

Set in `.env.local` (see `.env.example`):

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase project |
| `DATABASE_URL`, `DIRECT_URL` | Postgres, pooled and direct |
| `APP_URL` | Links in emails and PDFs |
| `NEXT_PUBLIC_SITE_URL` | Password reset link |
| `RESEND_API_KEY`, `EMAIL_FROM` | Transactional email |
| `CRON_SECRET` | Bearer token for the scheduled platform invoice run (`/api/cron/platform-invoices`) |
| `PAYMENT_AUTH_IP_SALT` | Salt for the hashed IP kept with each payment approval |
| `ABN_LOOKUP_GUID` | ABN Lookup web services |
| `NEXT_PUBLIC_GOOGLE_MAPS_EMBED_API_KEY` | Optional, scheme maps |
| `PLATFORM_BILLING_CAPTURE`, `PLATFORM_INVOICING`, `PLATFORM_TXN_FEE_MODE`, `PLATFORM_REFERRAL_INCOME`, `PLATFORM_REFERRAL_DISCLOSURE`, `STRATAVERZE_GST_REGISTERED` | StrataVerze's own platform fees. All are off unless set to `on`. |

## Finance module

The finance code is in `src/lib/finance` (rules, mostly pure and unit tested), `src/lib/queries` (database access) and `src/app/(portal)/adviser/schemes/[id]/finance` (adviser screens and server actions). Accountants have read-only reports under `/accountant`, and the committee treasurer has a home page and reports under `/owner/finance`.

### Ledger

- **Double entry.** Every `JournalEntry` has two or more `JournalLine`s, and debits must equal credits (`createJournalEntry`).
- **Money is whole cents in business logic.** It is stored as `Decimal(12,2)`.
- **Every line names a fund.** The administrative fund and the capital works fund share one physical bank account, and each fund's balances come from its own lines.
- **Posted entries are never edited.** `reverseJournalEntry` posts a mirror entry, sets the original to `REVERSED`, and both stay in the ledger. Reports read `LEDGER_STATUSES` (`POSTED` and `REVERSED`, in `src/lib/finance/ledger-status.ts`), so an entry and its reversal net to zero. Drafts are never in a report.
- **Financial periods** are `OPEN`, `CLOSED` or `LOCKED`. A closed period accepts only `ADJUSTMENT` entries, and a locked period accepts nothing (`validatePeriodForPosting`).
- **Chart of accounts.** New schemes get the default NSW chart (`src/lib/queries/seed-chart-of-accounts.ts`). System accounts are found by sub-type, for example `BANK`, `ACCOUNTS_RECEIVABLE`, `ACCOUNTS_PAYABLE`, `LEVIES_IN_ADVANCE`, `SUSPENSE`, `GST_PAID` and `LEVY_INCOME`.

### Levies

- A `LevySchedule` holds the amount the owners corporation resolved to raise for a fund and year. Each lot's share follows its unit entitlement, split by the largest remainder method so the notices add up to the amount exactly (`src/lib/levies/notice-plan.ts`).
- A schedule needs the general meeting approval recorded before notices can be issued. A budget levy also needs the budget adopted.
- Notices are issued with the levy notice PDF attached. It includes the Financial Hardship Information Statement and the interest wording.
- **Owner credits.** A payment above what a notice owes is held as the lot's credit in levies paid in advance. Credit is applied to later notices or refunded, and a refund needs the same approval as a supplier payment (`src/lib/finance/owner-credits.ts`).
- **Interest** is statutory simple interest, worked out from each notice's due date and payment history (`statutoryInterestForScheme`). See [Statutory references](#statutory-references).

### Supplier invoices

- An invoice is entered as a draft, by hand or pre-filled from an uploaded PDF. Extraction is pattern matching and OCR, not AI.
- When a PDF is used, the form shows the PDF beside every editable field, and a review tick is required before the invoice is created. The values read are kept unchanged in `invoice_extractions`, and the corrections are recorded against the invoice.
- Approval needs the number of distinct approvers the scheme's payment policy sets. Approval posts the expense. Payment is recorded separately and posts the payment.

### Bank and reconciliation

- **Import.** Statements come in as CSV (column mapping saved per account) or OFX. Possible duplicates are flagged. A statement's running balance is checked for gaps.
- **Allocation.** A bank transaction is allocated to one or more ledger entries (`BankTransactionAllocation`). It is Matched only when its allocations add up to its amount.
- **Deposits.** A deposit can be receipted across several levy notices.
- **Unidentified items.** An item that can't be identified is posted to suspense. A period cannot close while a suspense item from that period is still open.
- **Three-way reconciliation.** The ledger is compared with the payment provider wallet and the bank statement, with every difference listed. Advisers, accountants and the treasurer can see it.

### Documents

- **Generated PDFs:** levy notices, owner statements, remittance advice, the committee pack and the statutory statements. Each is stored as a `FinancialDocument` with its SHA-256 hash, and identical copies are stored once.
- **Uploaded supplier invoices** are stored the same way.
- **Serving:** both are served through `/api/finance/documents/[id]`, which checks access by document type and lot.
- **Other uploads** are in the private `documents` bucket and are served by short-lived signed links.

## Posting rules

| Event | Source type | Debit | Credit | Where |
|---|---|---|---|---|
| Levy notices issued | `LEVY_RAISED` (schedule) | Levies receivable (fund) | Levy income (fund) | `postLevyRaisedJournal`, finance `actions.ts` |
| Levy payment received | `PAYMENT` (notice) | Bank, or suspense when clearing it | Levies receivable, up to what the notice owes. Levies paid in advance for any excess. | `receiptLevyPayment`, `levy-receipts.ts` |
| Interest charged | `INTEREST` (notice) | Levies receivable | Interest income | `interest.ts` |
| Owner credit applied to a notice | `OWNER_CREDIT` | Levies paid in advance | Levies receivable | `owner-credits.ts` |
| Owner credit refunded | `OWNER_CREDIT` (refund) | Levies paid in advance | Bank | `owner-credits.ts` |
| Supplier invoice approved | `INVOICE` (invoice) | Expense (GST-exclusive), GST paid | Accounts payable | `finaliseSupplierInvoiceApproval`, `invoice-approval.ts` |
| Supplier invoice paid | `PAYMENT` (invoice) | Accounts payable | Bank | finance `actions.ts` |
| Unidentified deposit | `SUSPENSE` (bank transaction) | Bank | Suspense | `postToSuspense`, `bank-allocations.ts` |
| Unidentified payment | `SUSPENSE` (bank transaction) | Suspense | Bank | `postToSuspense` |
| Suspense cleared | `SUSPENSE` (suspense item) | Suspense, or the account identified | The account identified, or suspense | `clearSuspenseItem` |
| Bank rule auto-post | `BANK_IMPORT` (bank transaction) | As the matching rule sets | As the matching rule sets | `matching-rules.ts` |
| Reversal | `REVERSAL` (original entry) | Each original credit | Each original debit | `reverseJournalEntry` |
| Opening balances at cutover | `DATA_MIGRATION` (cutover) | Each debit balance | Each credit balance | `executeCutover`, `migration-batches.ts` |

Receipts and payments go through the administrative fund's bank account, the one physical account, with each line tagged to the fund it belongs to.

StrataVerze's own transaction fees are kept in a separate platform fee ledger (`src/lib/billing`). They reach a scheme's books only as an invoice from the StrataVerze supplier, approved and paid like any other.

### Cash and accrual reporting

Posting is always on an accrual footing. Each fund also has a reporting basis (`Fund.accountingBasis`). It changes what the statements recognise, never what is posted (`src/lib/finance/accounting-basis.ts`).

| | Accrual | Cash |
|---|---|---|
| Levy income | When notices are issued | When payment is received or credit is applied |
| Expenses | When the invoice is approved | When the invoice is paid, in proportion to the amount paid |
| Interest charged | When charged | Not recognised until received |
| Reversals | As posted | Treated as the original, so reversing an unpaid invoice changes nothing, and a dishonoured receipt takes the income back out |

The default is cash for the administrative fund and accrual for the capital works fund (`DEFAULT_ACCOUNTING_BASIS`).

## Controls

- **Payment approval.** An invoice needs the number of distinct approvers set by the scheme's payment policy (`SchemePaymentPolicy`). The preparer can never approve their own invoice. Advisers can approve only if the policy allows it. A scheme with a single eligible approver may approve alone, and each such approval is logged as an exception. Each approval records the approver's role and a hashed IP.
- **Supplier bank details.** Every change to a supplier's bank details is versioned. Payment is blocked while a change is unverified, and a change inside the cooling-off period (5 business days by default, set per scheme) needs a second person to verify it.
- **Segregation of duties.** One pure function, `checkSegregation`, governs prepare, approve and record payment. Recording a payment you prepared, or one you alone approved, is allowed only as a logged exception.
- **Owner credit refunds** need the same approvals as a supplier payment.
- **Locked periods** accept no entries.
- **Activity log.** Every state change is logged with `logActivity`.

## Reports and statements

| Report | Portals | Notes |
|---|---|---|
| Income and expenditure | Adviser, accountant | From the ledger, by account and fund. Every amount links to its drill-down. |
| Trial balance | Adviser, accountant | As at a date. Every balance links to its drill-down. |
| Statutory statements pack | Adviser, accountant | Per fund, on the fund's basis: key financial information, income and expenditure, balance sheet, levy register and arrears by lot. Adopted at the AGM as a locked snapshot, with a PDF. |
| Committee pack | Adviser, accountant (the PDF also for committee members) | Fund summaries, arrears, budget against actual (linked to the drill-down), bank and recent activity |
| Owner statement | Adviser, owner | Notices, payments and credits, with a PDF |
| Aged arrears, levy register, fund summary, cash flow, fund projections, GST summary, bank reconciliation, three-way reconciliation, audit trail, platform charges | Adviser, accountant (three-way also the treasurer) | |
| Audit export | Adviser, accountant | A ZIP of CSV files for the auditor (`audit-export.ts`) |

**Drill-down (TC-013).**
- `getJournalEntriesForReportCell(schemeId, accountCodeId, fundId, periodRange, mode)` lists the entries behind any figure, and their total equals the figure.
- On a cash or accrual basis it uses the same per-entry walk as the statements (`recognitions`).
- Each entry links to its source record, its documents and the bank transactions it was matched to.

**Treasurer home.** `/owner/finance/treasurer` shows, for the month:
- unmatched bank transactions
- payments waiting for approval
- overdue levies
- items in suspense
- any period that has ended but is still open

## Cutover from another system

A scheme moves onto StrataVerze in two steps:

1. **Structure.** Bring the lots and the chart of accounts across in Finance, Data Migration.
2. **Cutover.** At one date, bring across five files (Finance, Data Migration, Cutover):
   - **Opening trial balance:** posted as one journal entry.
   - **Outstanding levy notices:** with their original due dates, so ageing and interest continue. Interest the old system charged counts as already charged.
   - **Unpaid supplier invoices:** already approved in the old system.
   - **Owner credits:** held in levies paid in advance.
   - **Bank accounts:** each one's last reconciled balance and date.

The four detail files never post to the ledger. Their balances are already in the trial balance.

**The cutover runs only when all of these hold:**
- every file is parsed on the server with no row errors, and its SHA-256 is kept
- the opening trial balance nets to zero
- each control account (levies receivable, accounts payable, levies paid in advance) has been compared with its detail, and every difference acknowledged
- someone has signed off, recording who, when, the source system, the cutover date, the file hashes and the acknowledged differences
- the files are still the ones that were signed off

It runs in one transaction, once per scheme.

**Templates.** StrataMax and Strata Master column templates are in `src/config/migration-templates/`. Both are marked **UNCONFIRMED** because neither vendor publishes its export column headings. Check them against sample exports before relying on them.

## Statutory references

Values are kept in `src/config/statutory.ts` with their sources. "Confirmed by StrataVerze" means the rule was confirmed by the business on the date shown, not verified against the legislation by the developer.

| Rule | Value in the platform | Source | Status |
|---|---|---|---|
| Interest on unpaid contributions | 10% a year simple interest, from one month after the due date | SSMA s 85(1) and (2) | From AustLII and NSW Government guidance. Check the in-force Act. |
| No interest by resolution | Only a general meeting resolution, recorded with its meeting and motion. No other rate can be set. | SSMA s 85(3) | General meeting only: confirmed by StrataVerze, 23 Oct 2026 |
| Payment plans | Interest keeps accruing on a payment plan unless the owners corporation resolves to waive it | SSMA s 85(5) | Confirmed by StrataVerze, 23 Oct 2026 |
| Levy notice period | At least 30 days, or 14 days for an urgent special levy for emergency repairs | NSW Government, Strata levies guidance | Guidance, not the section itself |
| Financial hardship statement | On every levy notice from 27 Oct 2025, with National Debt Helpline details | Strata Schemes Legislation Amendment Act 2025, NSW Government guidance | Check the in-force provision |
| Order a payment is applied | Levies, then interest, then recovery costs | Strata Schemes Legislation Amendment Act 2025 | Confirmed by StrataVerze, 23 Oct 2026. Section reference still to add. |
| Capital works fund plan | At least 10 years, reviewed at least every 5 years. Standard form from 1 Apr 2026. | SSMA s 80, Strata Schemes Legislation Amendment Act 2025 | Section numbers for the review period and standard form not yet confirmed |
| Statement of key financial information | The approved form's rows, per fund | SSMA s 94(2) | Row layout taken from a StrataMax guide. Check against the current NSW form. |
| Audit | Required for more than 100 lots, or levies raised for the year above $250,000 | SSMA s 95, Strata Schemes Management Regulation 2016 cl 21 | Thresholds and measure confirmed by StrataVerze, 23 Oct 2026. The Regulation speaks of the "annual budget". |
| Administrative and capital works funds | Each scheme keeps both | SSMA ss 73 and 74 (as cited in the requirements document) | Not separately verified |
| Accounting basis | Administrative fund cash, capital works fund accrual, by default | Financial Management Requirements | Business decision, not a statutory rule |

## Data, security and migrations

- **Schema.** `prisma/schema.prisma` uses PSL with snake_case `@map` columns. Run `npm run contract:emit` after every change.
- **Migrations** are idempotent SQL files in `prisma/migrations/`. They are applied by hand in the Supabase SQL editor, because the build environment cannot reach the database. Each file says so in its header.
- **Row level security** is on every finance table, and each migration adds a negative check that a user with no role in the scheme cannot read it. The application writes through its own connection, so the policies are for reads.
- **Audit records cannot be changed.** Triggers prevent changes to an adopted statutory pack snapshot, to the values read from an uploaded invoice, and to an executed cutover.
- **Storage.** The `documents` bucket is private. A file can be read or uploaded only under `schemes/<scheme id>/` by a member of that scheme or a platform admin, and overwritten or deleted only by a platform admin.
- **Access by role.**

  | Who | Can read |
  |---|---|
  | Advisers, accountants, the treasurer, platform admins | Scheme finance (`canReadSchemeFinance`) |
  | Committee members | Also committee and statutory reports |
  | Owners | Also the levy notices and statements of their own lots |

## Testing

```bash
npm test
```

Unit tests cover the rules in `src/lib`: levy apportionment, interest, owner credits, payment controls, reconciliation, accounting basis, statutory statements, drill-down, invoice review, the treasurer month and the cutover.

The 13 acceptance cases (TC-001 to TC-013) from the *Financial Management Requirements* are tracked in [`docs/finance/acceptance-tests.md`](docs/finance/acceptance-tests.md). It gives the steps, the expected result and the current status of each, and names the test that covers it where there is one.

## Known gaps

As at 23 October 2026:

- **TC-001 duplicate receipts.** Owner payment confirmations are not checked for duplicates.
- **TC-003 wrong lot and TC-008 dishonour.** Reversing a levy receipt journal does not reverse the levy payment or restore the notice. There is no reallocate or dishonour action yet.
- **TC-007 exclusion reason.** Excluding a bank transaction does not record a reason.
- **TC-011 access logging.** Refused document requests are not logged, and return 404 rather than 403.
- **TC-012 FITID.** OFX imports flag duplicates rather than skip them by FITID.
- **Payment confirmation checks.** The owner upload does not check that the chosen notice belongs to one of the owner's lots.
- **Not yet chosen.** No payment provider or bank feed provider has been chosen, so neither is integrated.
- **Templates unconfirmed.** The StrataMax and Strata Master templates need sample exports.
- **Existing schemes.** The four schemes created before the default chart was seeded automatically need their chart of accounts seeded.
