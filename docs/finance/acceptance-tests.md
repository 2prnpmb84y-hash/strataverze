# Finance acceptance tests (TC-001 to TC-013)

The 13 acceptance cases from section 8.2 of the *Financial Management Requirements* (17 October 2026), with how each is tested and where it stands. Status is as at 23 October 2026, after finance hardening stages 1 to 7.

| Status | Meaning |
|---|---|
| **Automated** | Covered by Vitest tests that run in CI (`npm test`). The manual steps are there for a check against the deployed app. |
| **Manual** | Can only be checked in the running app. Follow the steps. |
| **Partly met** | The main behaviour works, but part of the case as written does not. The gap is described. |
| **Not met** | The behaviour described is not built yet. The gap is described. |

## Summary

| Case | Title | Status |
|---|---|---|
| TC-001 | Duplicate receipt upload | Not met |
| TC-002 | Uploaded confirmation with no bank transaction | Manual |
| TC-003 | Payment allocated to the wrong lot | Not met |
| TC-004 | One payment covering several lots | Partly met (automated) |
| TC-005 | Partial payment | Automated |
| TC-006 | Overpayment | Automated |
| TC-007 | Unidentified deposit | Partly met (automated) |
| TC-008 | Dishonoured or reversed payment | Not met |
| TC-009 | Document with incorrect extracted data | Automated |
| TC-010 | Change to a locked period | Partly met (automated) |
| TC-011 | Owner opening another owner's document | Partly met |
| TC-012 | Bank import with transactions already imported | Not met |
| TC-013 | Report total traced to source transactions | Automated |

Four cases are not met and four are partly met. The gaps are listed at the end of this file.

## Before you start

Use a test scheme, never a live one. You need:

- a scheme with the default chart of accounts, an administrative fund and a capital works fund, and one bank account
- an adviser login and two owner logins (owner A on lot 3, owner B on lot 7)
- an approved levy schedule with notices issued for lots 1, 3, 5, 7 and 12
- a supplier set up with bank details verified

Each step names the screen to use. "Finance" is `/adviser/schemes/<id>/finance` unless it says owner portal.

---

## TC-001: Duplicate receipt upload

**Status: Not met.**

**Steps**
1. Sign in as owner A. Go to Finance, Upload Payment Confirmation.
2. Upload a PDF against notice LN-001 with amount $3,000 and date 1 October 2026.
3. Upload a second document with the same notice, amount and date.

**Expected**
- The second upload is accepted.
- It is flagged as a possible duplicate, and the adviser is alerted.

**Now**
- Both uploads are accepted, but neither is flagged and no alert is sent.
- Duplicate checks exist for supplier invoices and adviser document uploads (`src/lib/queries/duplicate-detection.ts`), but not for owner payment confirmations.

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

**Status: Not met.**

**Steps**
1. Receipt a $3,000 bank deposit to lot 5's notice in Finance, Reconciliation.
2. Find that the bank reference is for lot 12.
3. Try to move the receipt from lot 5 to lot 12.

**Expected**
- The receipt journal is reversed for lot 5 and entered again for lot 12.
- Lot 5's notice goes back to its earlier balance, and lot 12's balance falls by $3,000.
- The audit log shows both steps.

**Now**
- There is no reallocate action.
- Unmatching the deposit (`clearAllocations`) removes the bank allocation but leaves the receipt.
- Reversing the receipt journal reverses the ledger lines but does not reverse the `LevyPayment` or put back the notice's `amountPaid`, balance or status. The ledger and the notice then disagree.

---

## TC-004: One payment covering several lots

**Status: Partly met. Automated: `src/lib/finance/reconciliation.test.ts`, "splits a deposit across several levy receipts".**

**Steps**
1. Import a $5,500 deposit.
2. In Finance, Reconciliation, receipt it to lot 3's notice ($2,000) and lot 7's notice ($3,500).

**Expected**
- Both notices show Paid.
- One receipt journal entry with two allocation lines.
- The bank transaction is Matched to that entry.

**Now**
- Both notices are paid and the deposit is Matched.
- Each notice gets its own receipt journal entry, so there are two entries, each allocated part of the deposit.
- The ledger and bank figures are the same either way. Only the journal layout differs from the case as written.

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

**Status: Partly met. Automated: `src/lib/finance/reconciliation.test.ts`.**

**Steps**
1. Import a $2,750 deposit described "TRANSFER FROM UNKNOWN".
2. Open Finance, Reconciliation.

**Expected**
- The deposit stays Unmatched.
- The adviser can receipt it to a lot, post it to suspense, or exclude it with a reason.

**Now**
- Receipting it to a lot and posting it to suspense work. A period cannot close while a suspense item from that period is open.
- Exclude works, but no reason is asked for or recorded (`excludeTransactionAction`).

---

## TC-008: Dishonoured or reversed payment

**Status: Not met.**

**Steps**
1. Receipt and reconcile a $3,000 payment for lot 5.
2. Record the bank's reversal of it, and a $15 dishonour fee.

**Expected**
- A reversal journal entry is posted.
- The notice goes back to Issued (or Overdue if past due), and the owner's balance rises by $3,000.
- The owner's statement shows the dishonour with a note.
- The fee is a separate expense entry.

**Now**
- The receipt journal can be reversed, and the fee can be recorded as an expense.
- As in TC-003, the reversal does not touch the notice or the `LevyPayment`. The notice stays Paid and the statement does not show the dishonour.
- Cash basis statements now take a reversed receipt back out of income (stage 6).

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

**Status: Partly met. Automated: `src/lib/queries/journal-entries.test.ts`, "blocks all entries to a LOCKED period".**

**Steps**
1. Lock the July 2026 period in Finance, Periods.
2. Try to post a journal entry dated 15 July 2026.

**Expected**
- The entry is refused with: "This period is locked. Contact your system administrator to unlock."
- No entry is posted.

**Now**
- The entry is refused and not posted.
- The message reads "Cannot post to a locked period (July 2026). The period must be reopened before any entries can be posted." The wording differs from the case.

---

## TC-011: Owner attempting to access another owner's documents

**Status: Partly met.**

**Steps**
1. As owner B (lot 7), upload a payment confirmation.
2. As the adviser, find the document's id in Finance, Documents.
3. Sign in as owner A (lot 3) and open `/api/finance/documents/<that id>`.

**Expected**
- Forbidden (403).
- The attempt is logged.

**Now**
- Owner A cannot download it. The route checks access by document type and lot, and since 23 October 2026 storage only serves files to members of the scheme.
- The response is 404 Not Found, not 403. This avoids confirming that the document exists, but differs from the case.
- The attempt is not logged.
- Owner B's payment confirmations are not listed for owner A in the owner portal. Scheme documents in Documents are shared with every member of the scheme.

---

## TC-012: Bank import containing previously imported transactions

**Status: Not met.**

**Steps**
1. Import an OFX file with T1 to T50.
2. Import a second OFX file with T45 to T80.

**Expected**
- T45 to T50 are skipped by FITID, and T51 to T80 are imported.
- The adviser is told "6 duplicate transactions skipped, 30 new transactions imported."

**Now**
- FITID is read from the OFX (`src/lib/bank-import-parser.ts`) and kept as the transaction reference, but it is not used to skip.
- Duplicates are found by account, date, amount and description, then **imported and flagged** rather than skipped (`importBankTransactions`).
- The result gives counts of new and flagged transactions, not the message in the case.

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

## Gaps to close

| Case | What is needed |
|---|---|
| TC-001 | Check an owner's new payment confirmation against their earlier ones (same notice, amount and date). Flag the match and notify the adviser, without blocking the upload. |
| TC-003, TC-008 | When a levy receipt is reversed, also reverse its `LevyPayment` and restore the notice's amount paid, balance and status, with a statement line. Add a reallocate action (reverse, then receipt to the right notice) and a dishonour action (reverse, optional fee expense). |
| TC-004 | Decide whether one journal per notice is acceptable, or build one receipt journal with a line per notice. |
| TC-007 | Ask for and record a reason when a transaction is excluded. |
| TC-010 | Change the locked period message to the wording in the case, if preferred. |
| TC-011 | Log refused document requests. Decide between 403 and 404. |
| TC-012 | Skip OFX transactions whose FITID is already recorded for the account, store FITID in its own column, and report "n duplicate transactions skipped, n new transactions imported". |

The owner payment confirmation upload should also check that the chosen notice is one of the owner's own lots. At present it takes the notice id as given and the first lot the owner holds.
