# Finance acceptance tests (TC-001 to TC-013)

The 13 acceptance cases from section 8.2 of the *Financial Management Requirements* (17 October 2026), with how each is tested and where it stands. Status is as at 23 October 2026, after finance hardening stages 1 to 7 and the acceptance gaps change.

| Status | Meaning |
|---|---|
| **Automated** | Covered by Vitest tests that run in CI (`npm test`). The manual steps are there for a check against the deployed app. |
| **Manual** | Met, but can only be checked in the running app. Follow the steps. |

## Summary

| Case | Title | Status |
|---|---|---|
| TC-001 | Duplicate receipt upload | Automated |
| TC-002 | Uploaded confirmation with no bank transaction | Manual |
| TC-003 | Payment allocated to the wrong lot | Automated |
| TC-004 | One payment covering several lots | Automated |
| TC-005 | Partial payment | Automated |
| TC-006 | Overpayment | Automated |
| TC-007 | Unidentified deposit | Automated, exclusion reason manual |
| TC-008 | Dishonoured or reversed payment | Automated |
| TC-009 | Document with incorrect extracted data | Automated |
| TC-010 | Change to a locked period | Automated |
| TC-011 | Owner opening another owner's document | Manual |
| TC-012 | Bank import with transactions already imported | Automated |
| TC-013 | Report total traced to source transactions | Automated |

All 13 cases are met as at 23 October 2026, after the acceptance gaps were closed.

"Automated" means the rules are unit tested. The database flows behind them (the reversal transaction, the import, the upload) have not yet been run end to end against a test scheme, so each case's manual steps should still be followed once before go-live.

## Before you start

Use a test scheme, never a live one. You need:

- a scheme with the default chart of accounts, an administrative fund and a capital works fund, and one bank account
- an adviser login and two owner logins (owner A on lot 3, owner B on lot 7)
- an approved levy schedule with notices issued for lots 1, 3, 5, 7 and 12
- a supplier set up with bank details verified

Each step names the screen to use. "Finance" is `/adviser/schemes/<id>/finance` unless it says owner portal.

---

## TC-001: Duplicate receipt upload

**Status: Automated: `src/lib/finance/payment-confirmations.test.ts`, "flags the same notice, amount and date from the same owner".**

**Steps**
1. Sign in as owner A. Go to Finance, Upload Payment Confirmation.
2. Upload a PDF against notice LN-001 with amount $3,000 and date 1 October 2026.
3. Upload a second document with the same notice, amount and date.

**Expected**
- The second upload is accepted.
- It is flagged as a possible duplicate, and the adviser is alerted.

**Checks**
- Both documents are in Finance, Documents.
- The second one's page shows "Possible duplicate" with a link to the first.
- The scheme's advisers receive an email.
- The activity log has `PAYMENT_CONFIRMATION_POSSIBLE_DUPLICATE`.
- An upload with a different amount, date or notice is not flagged, and neither is a match against a rejected upload.

**Also checked on every upload**
- The notice must be on one of the owner's own lots.
- The file must be in the scheme's payments folder.

---

## TC-002: Uploaded confirmation with no corresponding bank transaction

**Status: Manual.**

**Steps**
1. Sign in as owner A and upload a payment confirmation of $3,000 dated 1 October 2026 against one of lot 3's notices.
2. Make sure no bank transaction of $3,000 on that date has been imported.
3. Sign in as the adviser. Open Finance, Documents.

**Expected**
- The document is listed with verification status Pending.
- No journal entry is created: check Finance, Journal for new entries.
- The notice's balance is unchanged.

**Notes**
- An owner's upload never posts to the ledger. Only matching a bank transaction does (`src/app/(portal)/owner/(scheme)/finance/actions.ts` creates the document only).
- The requirements call the review list "Unmatched Payments". In the app it is the Documents list filtered to Pending.

---

## TC-003: Payment allocated to the wrong lot

**Status: Automated: `src/lib/finance/levy-reversal.test.ts`, "puts the notice back" and "needs the new receipts to add up to the amount moved".**

**Steps**
1. Receipt a $3,000 bank deposit to lot 5's notice in Finance, Reconciliation.
2. Open the receipt's journal entry, from the deposit or Finance, Journal.
3. Under Levy receipt, choose "It belongs to another lot: move it", pick lot 12's notice for $3,000, and move it.

**Expected**
- The receipt journal is reversed for lot 5 and entered again for lot 12.
- Lot 5's notice goes back to its earlier balance, and lot 12's balance falls by $3,000.
- The audit log shows both steps.

**Checks**
- The original entry is Reversed, with a reversal entry dated the same day.
- A new receipt entry credits lot 12, and the deposit is allocated to it.
- The activity log has `LEVY_RECEIPT_REVERSED` (reason WRONG_LOT) and `LEVY_RECEIPT_REALLOCATED`.
- A receipt on a reconciled bank transaction cannot be moved until the reconciliation is reopened.

---

## TC-004: One payment covering several lots

**Status: Automated: `src/lib/finance/levy-reversal.test.ts`, "credits each lot's notice on its own line under one entry".**

**Steps**
1. Import a $5,500 deposit.
2. In Finance, Reconciliation, receipt it to lot 3's notice ($2,000) and lot 7's notice ($3,500).

**Expected**
- Both notices show Paid.
- One receipt journal entry with two allocation lines.
- The bank transaction is Matched to that entry.

**Checks**
- The entry debits the bank $5,500 and credits levies receivable $2,000 (lot 3) and $3,500 (lot 7).
- The deposit is allocated in full to that one entry.

---

## TC-005: Partial payment

**Status: Automated: `src/lib/queries/levy-payment.test.ts` and `src/lib/finance/owner-credit.test.ts`.**

**Steps**
1. Record a $2,500 payment against lot 1's $4,000 notice.
2. Open the notice and lot 1's owner statement.

**Expected**
- Status Part paid, amount paid $2,500, balance $1,500.
- The statement shows the payment and the $1,500 remaining.

---

## TC-006: Overpayment

**Status: Automated: `src/lib/finance/owner-credit.test.ts`.**

**Steps**
1. Record a $3,500 payment against lot 1's $3,000 notice. Confirm that the extra is held as credit.
2. Open Finance, Owner credits.

**Expected**
- The notice is Paid.
- $500 is held as lot 1's credit, in levies paid in advance (DR Bank $3,500, CR Levies receivable $3,000, CR Levies paid in advance $500).
- The adviser can apply the credit to the next notice, or request a refund, which needs payment approval like a supplier invoice.

---

## TC-007: Unidentified deposit

**Status: Automated: `src/lib/finance/reconciliation.test.ts`. The exclusion reason is checked manually.**

**Steps**
1. Import a $2,750 deposit described "TRANSFER FROM UNKNOWN".
2. Open Finance, Reconciliation.

**Expected**
- The deposit stays Unmatched.
- The adviser can receipt it to a lot, post it to suspense, or exclude it with a reason.

**Checks**
- Receipting it to a lot and posting it to suspense both work. A period cannot close while a suspense item from that period is open.
- Exclude asks why. The reason is stored on the transaction and in the activity log, and exclude is refused without one.

---

## TC-008: Dishonoured or reversed payment

**Status: Automated: `src/lib/finance/levy-reversal.test.ts` and `src/lib/levies/levy-ledger.test.ts`, "shows a dishonoured payment and its reversal, with the reason".**

**Steps**
1. Receipt and reconcile a $3,000 payment for lot 5.
2. Open the receipt's journal entry. Under Levy receipt, choose "The bank dishonoured or reversed it".
3. Enter the dishonour date, a $15 fee with its expense account, and a note. Reverse it.

**Expected**
- A reversal journal entry is posted.
- The notice goes back to Issued (or Overdue if past due), and the owner's balance rises by $3,000.
- The owner's statement shows the dishonour with a note.
- The fee is a separate expense entry.

**Checks**
- The reversal is dated the dishonour date.
- The receipt stays on its deposit, so the reversal can be matched to the bank's reversing debit.
- The statement shows the payment, then "Payment for LN-… reversed, dishonoured: <note>" as a charge.
- Interest runs as if the payment had not been made.
- Any credit the receipt created is taken back out.
- A receipt whose credit has since been used must have that reversed first.

---

## TC-009: Document with incorrect extracted data

**Status: Automated: `src/lib/finance/invoice-review.test.ts`, "records the misread amount and the corrected amount".**

**Steps**
1. Go to Finance, Invoices, New. Upload a supplier invoice PDF.
2. Read is $1,100, but the invoice says $11,000. Change the subtotal and GST.
3. Tick the review box and create the invoice.
4. Open the invoice.

**Expected**
- The PDF is shown beside the form, and every field is editable.
- The invoice page lists Total "read from PDF" $1,100.00 and "entered" $11,000.00.
- The activity log has `SUPPLIER_INVOICE_EXTRACTION_REVIEWED` with the corrections.
- The values first read are kept unchanged in `invoice_extractions`. A database trigger refuses any change to them.

---

## TC-010: Attempted change to a locked period

**Status: Automated: `src/lib/queries/journal-entries.test.ts`, "blocks all entries to a LOCKED period, with the TC-010 message".**

**Steps**
1. Lock the July 2026 period in Finance, Periods.
2. Try to post a journal entry dated 15 July 2026.

**Expected**
- The entry is refused with: "This period is locked. Contact your system administrator to unlock."
- No entry is posted.

**Checks**
- The message is exactly that, followed by the period's name in brackets.
- Reversals, cutovers and receipt reversals are checked against the same rule.

---

## TC-011: Owner attempting to access another owner's documents

**Status: Manual.**

**Steps**
1. As owner B (lot 7), upload a payment confirmation.
2. As the adviser, find the document's id in Finance, Documents.
3. Sign in as owner A (lot 3) and open `/api/finance/documents/<that id>`.

**Expected**
- Forbidden (403).
- The attempt is logged.

**Checks**
- The response is 403 Forbidden.
- The activity log has `FINANCIAL_DOCUMENT_ACCESS_DENIED` with owner A and the document.
- An id that does not exist is still 404.
- The levy notice, owner statement, remittance, committee pack and statutory statements PDFs answer and log the same way.
- Storage serves files only to members of the scheme.

---

## TC-012: Bank import containing previously imported transactions

**Status: Automated: `src/lib/bank-import-parser.test.ts`, "skips T45 to T50 and imports T51 to T80, and says so".**

**Steps**
1. Import an OFX file with T1 to T50.
2. Import a second OFX file with T45 to T80.

**Expected**
- T45 to T50 are skipped by FITID, and T51 to T80 are imported.
- The adviser is told "6 duplicate transactions skipped, 30 new transactions imported."

**Checks**
- The FITID is stored in its own column, unique per bank account.
- FITIDs kept only as the reference by imports before this change are also recognised.
- A FITID repeated inside one file is skipped after the first.
- CSV imports, which have no FITID, still flag possible duplicates by date, amount and description.

---

## TC-013: Report total traced back to source transactions

**Status: Automated: `src/lib/finance/drill-down.test.ts`, "lists every entry posted to Maintenance and Repairs in the period, adding up to $15,200".**

**Steps**
1. Open Finance, Reports, Income and Expenditure for the period.
2. Click the Maintenance and Repairs amount.

**Expected**
- Every journal entry behind the amount is listed, and the list adds up to the figure on the report.
- Each entry links to its invoice and the invoice PDF, and shows any bank transaction it was matched to.

**Notes**
- The same drill-down is on the trial balance, the statutory statements (on the fund's cash or accrual basis) and the committee pack budget figures, in the adviser and accountant portals.

---

## Changes that closed the gaps

Made on 23 October 2026, in the acceptance gaps change:

| Case | Change |
|---|---|
| TC-001 | Owner uploads are checked against the owner's earlier ones, flagged (`duplicate_of_id`), logged and emailed to the advisers. The upload also checks that the notice is the owner's and the file is in the scheme's payments folder. |
| TC-003, TC-008 | Receipts are linked to their payments (`levy_payments.journal_entry_id`). Reversing one puts the notices back, reverses any credit and, except for a dishonour, takes it off the bank transaction. Move to another lot, dishonour (with fee) and entered in error are on the journal entry page. Reversed payments are shown on statements and left out of interest. |
| TC-004 | A payment across several notices is one receipt journal with a line for each lot (decision 23 October 2026). |
| TC-007 | Excluding a bank transaction needs a reason, stored on the transaction. |
| TC-010 | The locked period message uses the case's wording. |
| TC-011 | Refused document requests return 403 and are logged (decision 23 October 2026). |
| TC-012 | OFX transactions are skipped by FITID, with the case's message. |

Found and fixed at the same time:
- **Bank import dates.** Statement dates were moved to the day before for anyone east of UTC, because the date was turned into a timestamp in the browser.
- **Journal reversal checks.** Reversing a journal entry did not check that the entry belonged to the scheme, or that its period was open.
