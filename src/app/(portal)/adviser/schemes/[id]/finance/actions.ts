"use server";

import { revalidatePath } from "next/cache";
import {
  requireSchemeMembership,
  AuthorisationError,
} from "@/lib/auth/require-membership";
import {
  logActivity,
  getAuditTrailForExport,
  formatAuditTrailCsv,
  type AuditTrailFilters,
} from "@/lib/queries/activity-log";
import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";

// ── Invoice extraction ───────────────────────────────────────
import {
  extractInvoiceFromPdf,
  type ExtractedInvoiceData,
} from "@/lib/queries/invoice-extraction";
import { storeUploadedInvoicePdf } from "@/lib/pdf/store";
import { assertExtractionUsable, completeInvoiceReview, InvoiceReviewError, recordInvoiceExtraction } from "@/lib/finance/invoice-extractions";

// ── Chart of accounts ─────────────────────────────────────────
import {
  createAccountCode,
  updateAccountCode,
  deactivateAccountCode,
  getSystemAccountBySubType,
} from "@/lib/queries/account-codes";

// ── Seed ──────────────────────────────────────────────────────
import { seedDefaultChartOfAccounts } from "@/lib/queries/seed-chart-of-accounts";

// ── Bank accounts ─────────────────────────────────────────────
import {
  createBankAccount,
  updateBankAccount,
  deactivateBankAccount,
} from "@/lib/queries/bank-accounts";

// ── Journal entries ───────────────────────────────────────────
import {
  createJournalEntry,
  postJournalEntry,
  reverseJournalEntry,
  getNextEntryNumber,
  getJournalEntryById,
  validatePeriodForPosting,
} from "@/lib/queries/journal-entries";

// ── Bank transactions ─────────────────────────────────────────
import {
  importBankTransactions,
  reconcileTransaction,
  excludeTransaction,
} from "@/lib/queries/bank-transactions";

// ── Levy schedules & notices ──────────────────────────────────
import {
  createLevySchedule,
  createLevyNoticesBatch,
  issueLevyNotice,
  approveLevySchedule,
  activateLevySchedule,
  getLevyScheduleById,
  getNextNoticeNumber,
} from "@/lib/queries/levy-schedules";
import { getSchemeById } from "@/lib/queries/schemes";
import { captureUsageFee } from "@/lib/billing/capture";
import { confirmedCentsFrom, feeErrorMessage } from "@/lib/billing/disclosure";
import { isStrataVerzeSupplier } from "@/lib/billing/strataverze-supplier";
import { headers } from "next/headers";
import {
  PaymentControlError,
  authoriseSupplierInvoice,
  checkInvoiceControl,
  supplierInvoiceControls,
} from "@/lib/finance/invoice-approval";
import { checkBankDetailsForPayment } from "@/lib/finance/payment-controls";
import { applyOwnerCredit } from "@/lib/finance/owner-credits";
import { LevyReceiptError, receiptLevyPayment } from "@/lib/finance/levy-receipts";
import { getLevyReceipt, reallocateLevyReceipt, ReceiptReversalError, reverseLevyReceipt } from "@/lib/finance/levy-receipt-reversal";
import {
  ReconciliationError,
  allocateBankTransaction,
  allocatedByTransaction,
  clearAllocations,
  getAllocationCandidates,
  getSuspenseItems,
} from "@/lib/finance/bank-allocations";
import { suspenseBlockingClose, unallocatedCents } from "@/lib/finance/reconciliation";
import { sydneyToday } from "@/lib/finance/interest-setting";
import { interestSettingProblem } from "@/lib/finance/statutory-interest";
import { generalMeetingResolutionProblem } from "@/lib/finance/resolutions";
import { BudgetError, assertLineEditable, editableBudgetFor, getBudgets } from "@/lib/finance/budgets";
import { levyScheduleActivationProblem } from "@/lib/finance/budget-status";
import type { TimestampString } from "@prisma/orm-postgres/target/codec-types";
import { checkPlannedNotices, sendIssuedNotices } from "@/lib/levies/notice-content-data";
import { getLatestBankDetailVersion, getPaymentSettings, recordBankDetailChange } from "@/lib/queries/payment-controls";
import { loadPlanLots } from "@/lib/levies/load-plan-lots";
import {
  checkPlan,
  financialYearStart,
  fromCents,
  planNotices,
  toCents,
  toIsoDay,
  type LevyFrequency,
} from "@/lib/levies/notice-plan";

// ── Supplier invoices ─────────────────────────────────────────
import {
  createFinancialSupplier,
  createSupplierInvoice,
  recordInvoicePayment,
  cancelInvoice,
  getSupplierInvoiceById,
} from "@/lib/queries/supplier-invoices";

// ── Financial documents ───────────────────────────────────────
import {
  createFinancialDocument,
  reviewDocument,
  updateVerificationStatus,
} from "@/lib/queries/financial-documents";

// ── Financial periods ─────────────────────────────────────────
import {
  generateMonthlyPeriods,
  closePeriod,
  lockPeriod,
  reopenPeriod,
} from "@/lib/queries/financial-periods";

// ── Budget management ────────────────────────────────────────
import {
  createBudgetLine,
  updateBudgetLine,
  deleteBudgetLine,
} from "@/lib/queries/budget";

// ── Interest ─────────────────────────────────────────────────
import {
  chargeInterest,
  chargeInterestBatch,
} from "@/lib/queries/interest";

// ── Matching rules ──────────────────────────────────────────
import {
  createMatchingRule,
  updateMatchingRule,
  deleteMatchingRule,
  autoMatchTransactions,
} from "@/lib/queries/matching-rules";

// ── Duplicate detection ─────────────────────────────────────
import {
  checkInvoiceDuplicates,
  checkDocumentDuplicates,
} from "@/lib/queries/duplicate-detection";
import { importSummary } from "@/lib/bank-import-parser";

// ── Types ─────────────────────────────────────────────────────

export type ActionState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: boolean;
  data?: Record<string, unknown>;
};

/** Re-throw Next.js redirect errors so they propagate correctly. */
function isRedirectError(err: unknown): boolean {
  return (
    err !== null &&
    typeof err === "object" &&
    "digest" in err &&
    typeof (err as { digest: unknown }).digest === "string" &&
    (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

function financePath(schemeId: string, sub = "") {
  return `/adviser/schemes/${schemeId}/finance${sub}`;
}

// ═══════════════════════════════════════════════════════════════
// 1. CHART OF ACCOUNTS
// ═══════════════════════════════════════════════════════════════

export async function seedChartOfAccountsAction(
  schemeId: string,
): Promise<ActionState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);
    const created = await seedDefaultChartOfAccounts(schemeId);

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "CHART_OF_ACCOUNTS_SEEDED",
      entityType: "AccountCode",
      entityId: schemeId,
      metadata: { count: created.length },
    });

    revalidatePath(financePath(schemeId));
    return { success: true, data: { count: created.length } };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    if (isRedirectError(err)) throw err;
    const msg = err instanceof Error ? err.message : "Failed to seed chart of accounts.";
    return { error: msg };
  }
}

export async function createAccountCodeAction(
  schemeId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);

    const code = (formData.get("code") as string)?.trim();
    const name = (formData.get("name") as string)?.trim();
    const accountType = formData.get("accountType") as string;
    const accountSubType = (formData.get("accountSubType") as string) || undefined;
    const fundId = (formData.get("fundId") as string) || undefined;
    const gstApplicable = formData.get("gstApplicable") === "true";
    const description = (formData.get("description") as string) || undefined;

    const fieldErrors: Record<string, string> = {};
    if (!code) fieldErrors.code = "Account code is required.";
    if (!name) fieldErrors.name = "Account name is required.";
    if (!accountType) fieldErrors.accountType = "Account type is required.";
    if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

    const account = await createAccountCode({
      schemeId,
      code,
      name,
      accountType,
      accountSubType,
      fundId,
      gstApplicable,
      description,
    });

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "ACCOUNT_CODE_CREATED",
      entityType: "AccountCode",
      entityId: account.id,
      metadata: { code, name, accountType },
    });

    revalidatePath(financePath(schemeId));
    return { success: true, data: { id: account.id } };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    if (isRedirectError(err)) throw err;
    return { error: "Failed to create account code." };
  }
}

export async function updateAccountCodeAction(
  schemeId: string,
  accountCodeId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await requireSchemeMembership(schemeId, ["ADVISER"]);

    const name = (formData.get("name") as string)?.trim() || undefined;
    const accountSubType = formData.get("accountSubType") as string | null;
    const fundId = formData.get("fundId") as string | null;
    const gstApplicable = formData.has("gstApplicable")
      ? formData.get("gstApplicable") === "true"
      : undefined;
    const description = formData.get("description") as string | null;

    await updateAccountCode(accountCodeId, {
      name,
      accountSubType,
      fundId,
      gstApplicable,
      description,
    });

    revalidatePath(financePath(schemeId));
    return { success: true };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to update account code." };
  }
}

export async function deactivateAccountCodeAction(
  schemeId: string,
  accountCodeId: string,
): Promise<ActionState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);

    await deactivateAccountCode(accountCodeId);

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "ACCOUNT_CODE_DEACTIVATED",
      entityType: "AccountCode",
      entityId: accountCodeId,
      metadata: {},
    });

    revalidatePath(financePath(schemeId));
    return { success: true };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to deactivate account." };
  }
}

// ═══════════════════════════════════════════════════════════════
// 2. BANK ACCOUNTS
// ═══════════════════════════════════════════════════════════════

export async function createBankAccountAction(
  schemeId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);

    const bankName = (formData.get("bankName") as string)?.trim();
    const accountName = (formData.get("accountName") as string)?.trim();
    const bsb = (formData.get("bsb") as string)?.trim();
    const accountNumber = (formData.get("accountNumber") as string)?.trim();
    const accountType = (formData.get("accountType") as string) || "OPERATING";
    const isOperating = formData.get("isOperating") === "true";

    const fieldErrors: Record<string, string> = {};
    if (!bankName) fieldErrors.bankName = "Bank name is required.";
    if (!accountName) fieldErrors.accountName = "Account name is required.";
    if (!bsb) fieldErrors.bsb = "BSB is required.";
    else if (!/^\d{3}-?\d{3}$/.test(bsb))
      fieldErrors.bsb = "BSB must be in NNN-NNN format.";
    if (!accountNumber) fieldErrors.accountNumber = "Account number is required.";
    if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

    const account = await createBankAccount({
      schemeId,
      bankName,
      accountName,
      bsb: bsb.replace("-", "").replace(/(\d{3})(\d{3})/, "$1-$2"),
      accountNumber,
      accountType,
      isOperating,
    });

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "BANK_ACCOUNT_CREATED",
      entityType: "SchemeBankAccount",
      entityId: account.id,
      metadata: { bankName, accountType },
    });

    revalidatePath(financePath(schemeId));
    return { success: true, data: { id: account.id } };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    if (isRedirectError(err)) throw err;
    return { error: "Failed to create bank account." };
  }
}

export async function updateBankAccountAction(
  schemeId: string,
  bankAccountId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await requireSchemeMembership(schemeId, ["ADVISER"]);

    const bankName = (formData.get("bankName") as string)?.trim() || undefined;
    const accountName = (formData.get("accountName") as string)?.trim() || undefined;
    const accountType = (formData.get("accountType") as string)?.trim() || undefined;
    const isOperating = formData.get("isOperating") === "true" ? true : formData.get("isOperating") === "false" ? false : undefined;

    await updateBankAccount(bankAccountId, {
      bankName: bankName ?? null,
      accountName,
      accountType,
      isOperating,
    });

    revalidatePath(financePath(schemeId));
    return { success: true };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to update bank account." };
  }
}

export async function deactivateBankAccountAction(
  schemeId: string,
  bankAccountId: string,
): Promise<ActionState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);

    await deactivateBankAccount(bankAccountId);

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "BANK_ACCOUNT_DEACTIVATED",
      entityType: "SchemeBankAccount",
      entityId: bankAccountId,
      metadata: {},
    });

    revalidatePath(financePath(schemeId));
    return { success: true };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to deactivate bank account." };
  }
}

// ═══════════════════════════════════════════════════════════════
// 3. JOURNAL ENTRIES
// ═══════════════════════════════════════════════════════════════

interface JournalLineInput {
  accountCodeId: string;
  fundId: string;
  debit?: number;
  credit?: number;
  description?: string;
  lotId?: string;
  supplierId?: string;
  gstAmount?: number;
}

export async function createJournalEntryAction(
  schemeId: string,
  data: {
    transactionDate: string;
    description: string;
    entryType: string;
    sourceType: string;
    sourceId?: string;
    lines: JournalLineInput[];
  },
): Promise<ActionState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);

    if (!data.transactionDate) return { error: "Transaction date is required." };
    if (!data.description?.trim()) return { error: "Description is required." };
    if (!data.lines || data.lines.length === 0)
      return { error: "At least one journal line is required." };

    const entryNumber = await getNextEntryNumber(schemeId);

    const entry = await createJournalEntry({
      schemeId,
      entryNumber,
      transactionDate: data.transactionDate,
      description: data.description.trim(),
      entryType: data.entryType || "MANUAL",
      sourceType: data.sourceType || "MANUAL",
      sourceId: data.sourceId,
      createdBy: profile.id,
      lines: data.lines,
    });

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "JOURNAL_ENTRY_CREATED",
      entityType: "JournalEntry",
      entityId: entry.id,
      metadata: { entryNumber, entryType: data.entryType },
    });

    revalidatePath(financePath(schemeId));
    return { success: true, data: { id: entry.id, entryNumber } };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    if (isRedirectError(err)) throw err;
    const msg = err instanceof Error ? err.message : "Failed to create journal entry.";
    return { error: msg };
  }
}

export async function postJournalEntryAction(
  schemeId: string,
  entryId: string,
): Promise<ActionState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);

    await postJournalEntry(entryId, profile.id);

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "JOURNAL_ENTRY_POSTED",
      entityType: "JournalEntry",
      entityId: entryId,
      metadata: {},
    });

    revalidatePath(financePath(schemeId));
    return { success: true };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to post journal entry." };
  }
}

export async function reverseJournalEntryAction(
  schemeId: string,
  originalEntryId: string,
  description?: string,
): Promise<ActionState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);

    // The entry must be this scheme's.
    const original = await getJournalEntryById(originalEntryId);
    if (!original || original.schemeId !== schemeId) return { error: "Journal entry not found." };

    // A levy receipt is reversed with its notices, not just its ledger lines (TC-003, TC-008).
    if (original.sourceType === "PAYMENT") {
      const receipt = await getLevyReceipt(schemeId, originalEntryId);
      if (receipt && receipt.payments.length > 0) {
        const done = await reverseLevyReceipt({ schemeId, journalEntryId: originalEntryId, reason: "ENTERED_IN_ERROR", note: description ?? null, actorId: profile.id });
        revalidatePath(financePath(schemeId));
        return { success: true, data: { reversalId: done.reversalEntryId } };
      }
      const notice = original.sourceId ? await db.orm.public.LevyNotice.where((n) => n.id.eq(original.sourceId!)).first() : null;
      if (notice) {
        return { error: "This levy receipt was recorded before receipts were linked to their payments. Record a correcting entry instead of reversing it." };
      }
    }

    await validatePeriodForPosting(schemeId, new Date().toISOString().slice(0, 10), "REVERSAL");
    const entryNumber = await getNextEntryNumber(schemeId);

    const reversal = await reverseJournalEntry(originalEntryId, {
      entryNumber,
      createdBy: profile.id,
      description,
    });

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "JOURNAL_ENTRY_REVERSED",
      entityType: "JournalEntry",
      entityId: originalEntryId,
      metadata: { reversalId: reversal.id },
    });

    revalidatePath(financePath(schemeId));
    return { success: true, data: { reversalId: reversal.id } };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    const msg = err instanceof Error ? err.message : "Failed to reverse journal entry.";
    return { error: msg };
  }
}

/** Reverse a levy receipt with its notices: dishonoured, or entered in error (TC-008). */
export async function reverseLevyReceiptAction(
  schemeId: string,
  journalEntryId: string,
  input: { reason: string; note?: string; reversalDate?: string; feeCents?: number; feeAccountCodeId?: string },
): Promise<ActionState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);
    if (input.reason !== "DISHONOURED" && input.reason !== "ENTERED_IN_ERROR") return { error: "Choose why the receipt is being reversed." };
    const fee = input.feeCents && input.feeCents > 0 && input.feeAccountCodeId ? { amountCents: Math.round(input.feeCents), accountCodeId: input.feeAccountCodeId } : null;
    const done = await reverseLevyReceipt({
      schemeId,
      journalEntryId,
      reason: input.reason,
      note: input.note ?? null,
      reversalDate: input.reversalDate || null,
      fee: input.reason === "DISHONOURED" ? fee : null,
      actorId: profile.id,
    });
    revalidatePath(financePath(schemeId));
    return { success: true, data: { ...done } };
  } catch (err) {
    if (err instanceof AuthorisationError || err instanceof ReceiptReversalError) return { error: err.message };
    return { error: err instanceof Error ? err.message : "Failed to reverse the receipt." };
  }
}

/** Move a levy receipt to the right lot's notices (TC-003). */
export async function reallocateLevyReceiptAction(
  schemeId: string,
  journalEntryId: string,
  receipts: Array<{ levyNoticeId: string; amountCents: number }>,
  confirmOverpayment: boolean,
  note?: string,
): Promise<ActionState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);
    const done = await reallocateLevyReceipt({
      schemeId,
      journalEntryId,
      receipts: receipts.map((r) => ({ levyNoticeId: r.levyNoticeId, amountCents: Math.round(r.amountCents) })),
      confirmOverpayment,
      note: note ?? null,
      actorId: profile.id,
    });
    revalidatePath(financePath(schemeId));
    return { success: true, data: { ...done } };
  } catch (err) {
    if (err instanceof AuthorisationError || err instanceof ReceiptReversalError) return { error: err.message };
    if (err instanceof LevyReceiptError) return { error: err.message, data: err.data };
    return { error: err instanceof Error ? err.message : "Failed to move the receipt." };
  }
}

// ═══════════════════════════════════════════════════════════════
// 4. BANK TRANSACTIONS
// ═══════════════════════════════════════════════════════════════

export async function importBankTransactionsAction(
  schemeId: string,
  bankAccountId: string,
  transactions: Array<{
    transactionDate: string;
    amount: number;
    description: string;
    reference?: string;
    balance?: number;
    fitId?: string;
  }>,
  importSource: string,
): Promise<ActionState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);

    if (!transactions || transactions.length === 0) {
      return { error: "No transactions to import." };
    }
    const account = await db.orm.public.SchemeBankAccount.where((b) => and(b.id.eq(bankAccountId), b.schemeId.eq(schemeId))).first();
    if (!account) return { error: "Bank account not found." };

    const importBatchId = crypto.randomUUID();

    const { created, skipped } = await importBankTransactions(
      transactions.map((txn) => ({
        ...txn,
        bankAccountId,
        schemeId,
        importSource,
        importBatchId,
      })),
    );

    const duplicateCount = created.filter((t) => t.isDuplicate).length;
    const newCount = created.length - duplicateCount;
    const summary = importSummary({ skipped, imported: created.length, flagged: duplicateCount });

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "BANK_TRANSACTIONS_IMPORTED",
      entityType: "BankTransaction",
      entityId: importBatchId,
      metadata: {
        total: created.length,
        new: newCount,
        duplicates: duplicateCount,
        skipped,
        source: importSource,
      },
    });

    revalidatePath(financePath(schemeId));
    return {
      success: true,
      data: {
        imported: newCount,
        duplicates: duplicateCount,
        skipped,
        summary,
        batchId: importBatchId,
      },
    };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to import bank transactions." };
  }
}

/** Bank transaction of this scheme, or null. */
async function schemeTransaction(schemeId: string, transactionId: string) {
  const txn = await db.orm.public.BankTransaction.where((t) => t.id.eq(transactionId)).first();
  return txn && txn.schemeId === schemeId ? txn : null;
}

/**
 * Match a transaction to one journal entry: allocates as much of the
 * transaction as the entry has left. Use the allocation panel to split a
 * transaction across several entries.
 */
export async function matchTransactionAction(
  schemeId: string,
  transactionId: string,
  journalEntryId: string,
): Promise<ActionState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);
    const txn = await schemeTransaction(schemeId, transactionId);
    if (!txn) return { error: "Bank transaction not found." };
    const candidate = (await getAllocationCandidates(schemeId, 2000)).find((c) => c.id === journalEntryId);
    if (!candidate) return { error: "That entry is not a posted bank entry with an amount left to match." };
    const left = unallocatedCents(toCents(String(txn.amount)), (await allocatedByTransaction([txn.id])).get(txn.id) ?? 0);
    await allocateBankTransaction({
      schemeId,
      transactionId,
      requests: [{ journalEntryId, amountCents: Math.min(left, candidate.remainingCents) }],
      actorId: profile.id,
    });
    revalidatePath(financePath(schemeId));
    return { success: true };
  } catch (err) {
    if (err instanceof AuthorisationError || err instanceof ReconciliationError) return { error: err.message };
    return { error: "Failed to match transaction." };
  }
}

/** Mark a fully matched transaction as reconciled. */
export async function reconcileTransactionAction(
  schemeId: string,
  transactionId: string,
): Promise<ActionState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);
    const txn = await schemeTransaction(schemeId, transactionId);
    if (!txn) return { error: "Bank transaction not found." };
    if (txn.reconciliationStatus !== "MATCHED") return { error: "Only a fully matched transaction can be reconciled." };

    await reconcileTransaction(transactionId);

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "BANK_TRANSACTION_RECONCILED",
      entityType: "BankTransaction",
      entityId: transactionId,
      metadata: {},
    });

    revalidatePath(financePath(schemeId));
    return { success: true };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to reconcile transaction." };
  }
}

/** Exclude a transaction from reconciliation (nothing allocated to it yet). */
export async function excludeTransactionAction(
  schemeId: string,
  transactionId: string,
  reason: string,
): Promise<ActionState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);
    const why = (reason ?? "").trim().slice(0, 300);
    if (why.length < 3) return { error: "Give a reason for excluding the transaction." };
    const txn = await schemeTransaction(schemeId, transactionId);
    if (!txn) return { error: "Bank transaction not found." };
    if (((await allocatedByTransaction([txn.id])).get(txn.id) ?? 0) > 0) {
      return { error: "Part of this transaction is already allocated. Unmatch it before excluding it." };
    }

    await excludeTransaction(transactionId, why);

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "BANK_TRANSACTION_EXCLUDED",
      entityType: "BankTransaction",
      entityId: transactionId,
      metadata: { reason: why },
    });

    revalidatePath(financePath(schemeId));
    return { success: true };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to exclude transaction." };
  }
}

/** Remove a transaction's allocations so it can be matched again. */
export async function unmatchTransactionAction(
  schemeId: string,
  transactionId: string,
): Promise<ActionState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);
    await clearAllocations({ schemeId, transactionId, actorId: profile.id });
    revalidatePath(financePath(schemeId));
    return { success: true };
  } catch (err) {
    if (err instanceof AuthorisationError || err instanceof ReconciliationError) return { error: err.message };
    return { error: "Failed to unmatch transaction." };
  }
}

// ═══════════════════════════════════════════════════════════════
// 5. LEVY SCHEDULES & NOTICES
// ═══════════════════════════════════════════════════════════════

export async function createLevyScheduleAction(
  schemeId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);

    const fundId = (formData.get("fundId") as string)?.trim();
    const financialYear = Number(formData.get("financialYear") || 0);
    const frequency = (formData.get("frequency") as string) || "QUARTERLY";
    const budgetAmount = Number(formData.get("budgetAmount") || 0);
    const totalLots = Number(formData.get("totalLots") || 0);
    const totalEntitlement = Number(formData.get("totalEntitlement") || 0);

    const fieldErrors: Record<string, string> = {};
    if (!fundId) fieldErrors.fundId = "Fund is required.";
    if (financialYear <= 0) fieldErrors.financialYear = "Financial year is required.";
    if (budgetAmount <= 0) fieldErrors.budgetAmount = "Budget amount must be greater than zero.";
    if (totalLots <= 0) fieldErrors.totalLots = "Total lots must be greater than zero.";
    if (totalEntitlement <= 0) fieldErrors.totalEntitlement = "Total entitlement must be greater than zero.";
    if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

    const schedule = await createLevySchedule({
      schemeId,
      fundId,
      financialYear,
      budgetAmount,
      frequency,
      totalLots,
      totalEntitlement,
    });

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "LEVY_SCHEDULE_CREATED",
      entityType: "LevySchedule",
      entityId: schedule.id,
      metadata: { frequency, budgetAmount },
    });

    revalidatePath(financePath(schemeId));
    return { success: true, data: { id: schedule.id } };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    if (isRedirectError(err)) throw err;
    return { error: "Failed to create levy schedule." };
  }
}

/** DR Levies Receivable, CR Levy Income for notices raised against a fund. */
async function postLevyRaisedJournal(args: {
  schemeId: string;
  fundId: string;
  scheduleId: string;
  totalAmount: number;
  noticeCount: number;
  profileId: string;
}) {
  if (args.totalAmount <= 0) return;
  const fund = await db.orm.public.Fund.where((f) => f.id.eq(args.fundId)).first();
  const fundType = (fund?.fundType ?? "ADMINISTRATIVE") as "ADMINISTRATIVE" | "CAPITAL_WORKS";
  const receivableAccount = await getSystemAccountBySubType(args.schemeId, "ACCOUNTS_RECEIVABLE", fundType);
  const incomeAccount = await getSystemAccountBySubType(args.schemeId, "LEVY_INCOME", fundType);
  if (!receivableAccount || !incomeAccount) return;

  const entryNumber = await getNextEntryNumber(args.schemeId);
  const today = new Date().toISOString().split("T")[0];
  const entry = await createJournalEntry({
    schemeId: args.schemeId,
    entryNumber,
    transactionDate: today,
    description: `Levy notices issued — ${args.noticeCount} notice(s), ${fundType === "CAPITAL_WORKS" ? "Capital Works" : "Administrative"} fund`,
    entryType: "AUTO",
    sourceType: "LEVY_RAISED",
    sourceId: args.scheduleId,
    createdBy: args.profileId,
    lines: [
      { accountCodeId: receivableAccount.id, fundId: args.fundId, debit: args.totalAmount, description: "Levies receivable raised" },
      { accountCodeId: incomeAccount.id, fundId: args.fundId, credit: args.totalAmount, description: "Levy income recognised" },
    ],
  });
  await postJournalEntry(entry.id, args.profileId);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Load a schedule and confirm it belongs to the scheme. */
async function loadScheduleForScheme(schemeId: string, scheduleId: string) {
  const schedule = await getLevyScheduleById(scheduleId);
  if (!schedule || schedule.schemeId !== schemeId) return null;
  return schedule;
}

/**
 * Record the owners corporation's approval of a budget levy schedule.
 * The resolution date is the date of the general meeting that set the levies.
 */
export async function approveLevyScheduleAction(
  schemeId: string,
  scheduleId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);
    const resolutionDate = String(formData.get("resolutionDate") ?? "").trim();
    if (!ISO_DATE.test(resolutionDate)) {
      return { fieldErrors: { resolutionDate: "Enter the date the levies were resolved." } };
    }
    const schedule = await loadScheduleForScheme(schemeId, scheduleId);
    if (!schedule) return { error: "Levy schedule not found." };
    if (schedule.status !== "DRAFT") return { error: "Only a draft schedule can be approved." };

    await approveLevySchedule(scheduleId, profile.id, resolutionDate);
    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "LEVY_SCHEDULE_APPROVED",
      entityType: "LevySchedule",
      entityId: scheduleId,
      metadata: { resolutionDate },
    });
    revalidatePath(financePath(schemeId, `/levies/${scheduleId}`));
    return { success: true };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to record approval." };
  }
}

/**
 * Issue the notices for an approved schedule: one per lot per instalment, in
 * proportion to unit entitlement. Amounts are worked out here, never taken
 * from the browser.
 */
export async function issueScheduleNoticesAction(
  schemeId: string,
  scheduleId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);
    const schedule = await loadScheduleForScheme(schemeId, scheduleId);
    if (!schedule) return { error: "Levy schedule not found." };
    if (schedule.status !== "APPROVED") {
      return { error: "Record the owners corporation's approval before issuing notices." };
    }
    if ((schedule.levyNotices ?? []).length > 0) {
      return { error: "Notices have already been issued for this schedule." };
    }

    const isSpecial = schedule.levyType === "SPECIAL";
    // Budget levies need the budget for that fund and year adopted at a general meeting.
    const activation = levyScheduleActivationProblem({
      levyType: schedule.levyType,
      financialYear: Number(schedule.financialYear),
      fundName: String(schedule.fund?.name ?? "fund"),
      budgets: (await getBudgets(schemeId, Number(schedule.financialYear))).filter((b) => b.fundId === schedule.fundId),
    });
    if (activation) return { error: activation };
    const firstDueDate = isSpecial
      ? toIsoDay(schedule.dueDate)
      : String(formData.get("firstDueDate") ?? "").trim();
    if (!ISO_DATE.test(firstDueDate)) {
      return { fieldErrors: { firstDueDate: "Enter the due date of the first instalment." } };
    }

    const scheme = await getSchemeById(schemeId);
    if (!scheme) return { error: "Scheme not found." };
    const lots = await loadPlanLots(schemeId);
    const totalCents = toCents(String(schedule.budgetAmount));
    const issues = checkPlan({
      lots,
      totalEntitlement: Number(schedule.totalEntitlement),
      totalCents,
    });
    if (issues.length > 0) return { error: issues.map((i) => i.message).join(" ") };

    const periodStart = isSpecial
      ? toIsoDay(schedule.approvedAt) || firstDueDate
      : financialYearStart(Number(schedule.financialYear), String(scheme.financialYearEnd));
    const plan = planNotices({
      lots,
      totalCents,
      frequency: (isSpecial ? "ONE_OFF" : schedule.frequency) as LevyFrequency,
      periodStart,
      firstDueDate,
    });

    const first = await getNextNoticeNumber(schemeId);
    let seq = parseInt(first.replace(/\D/g, ""), 10) || 1;
    const numbered = plan.map((n) => ({ ...n, noticeNumber: `LN-${String(seq++).padStart(4, "0")}` }));

    // Every notice must carry what a NSW levy notice states before any is issued.
    const noticeDate = sydneyToday();
    const contentInput = {
      schemeId,
      fundId: schedule.fundId,
      issuerId: profile.id,
      noticeDate,
      isUrgentSpecialLevy: isSpecial && formData.get("urgentSpecialLevy") === "on",
      notices: numbered.map((n) => ({
        lotId: n.lotId,
        lotNumber: n.lotNumber,
        ownerId: n.ownerId,
        noticeNumber: n.noticeNumber,
        dueDate: n.dueDate,
        amountCents: n.amountCents,
      })),
    };
    const missing = await checkPlannedNotices(contentInput);
    if (missing.length > 0) {
      return {
        error: "The notices cannot be issued yet. Fix the items listed and try again.",
        data: { missing },
      };
    }

    const created = await createLevyNoticesBatch(
      numbered.map((n) => ({
        schemeId,
        levyScheduleId: scheduleId,
        lotId: n.lotId,
        ownerId: n.ownerId,
        fundId: schedule.fundId,
        noticeNumber: n.noticeNumber,
        periodStart: n.periodStart,
        periodEnd: n.periodEnd,
        dueDate: n.dueDate,
        amountDue: fromCents(n.amountCents),
      })),
    );
    for (const notice of created) await issueLevyNotice(notice.id);
    await activateLevySchedule(scheduleId);

    await postLevyRaisedJournal({
      schemeId,
      fundId: schedule.fundId,
      scheduleId,
      totalAmount: fromCents(totalCents),
      noticeCount: created.length,
      profileId: profile.id,
    });

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "LEVY_NOTICES_ISSUED",
      entityType: "LevySchedule",
      entityId: scheduleId,
      metadata: { count: created.length, total: fromCents(totalCents), firstDueDate },
    });

    // Apply owner credit to the new notices when the scheme has auto-apply on.
    let creditAppliedCents = 0;
    if (scheme.autoApplyOwnerCredit !== false) {
      creditAppliedCents = await applyOwnerCredit({
        schemeId,
        lotIds: [...new Set(created.map((n) => n.lotId))],
        actorId: profile.id,
      });
    }

    // Email each notice to its owner, with the notice attached as a PDF. A failed email does not undo the issue.
    const ids = new Map(created.map((n) => [String(n.noticeNumber), n.id]));
    const emailed = await sendIssuedNotices({
      ...contentInput,
      notices: contentInput.notices.map((n) => ({ ...n, noticeId: ids.get(n.noticeNumber) })),
    });
    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "LEVY_NOTICES_EMAILED",
      entityType: "LevySchedule",
      entityId: scheduleId,
      metadata: { emailed, notices: created.length },
    });

    revalidatePath(financePath(schemeId, "/levies"));
    revalidatePath(financePath(schemeId, `/levies/${scheduleId}`));
    return {
      success: true,
      data: { count: created.length, emailed, creditApplied: fromCents(creditAppliedCents) },
    };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to issue levy notices." };
  }
}

/**
 * Raise a special levy: a one-off contribution resolved by the owners
 * corporation, levied on every lot by unit entitlement.
 */
export async function createSpecialLevyAction(
  schemeId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);
    const fundId = String(formData.get("fundId") ?? "").trim();
    const title = String(formData.get("title") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim() || null;
    const amount = Number(formData.get("amount") || 0);
    const resolutionDate = String(formData.get("resolutionDate") ?? "").trim();
    const dueDate = String(formData.get("dueDate") ?? "").trim();

    const fieldErrors: Record<string, string> = {};
    if (!fundId) fieldErrors.fundId = "Fund is required.";
    if (!title) fieldErrors.title = "Give the special levy a title.";
    if (!(amount > 0)) fieldErrors.amount = "Amount must be greater than zero.";
    if (!ISO_DATE.test(resolutionDate)) fieldErrors.resolutionDate = "Enter the resolution date.";
    if (!ISO_DATE.test(dueDate)) fieldErrors.dueDate = "Enter the due date.";
    else if (ISO_DATE.test(resolutionDate) && dueDate < resolutionDate) {
      fieldErrors.dueDate = "The due date cannot be before the resolution date.";
    }
    if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

    const scheme = await getSchemeById(schemeId);
    if (!scheme) return { error: "Scheme not found." };
    if (!scheme.funds.some((f) => f.id === fundId)) return { fieldErrors: { fundId: "Choose a fund of this scheme." } };

    const schedule = await createLevySchedule({
      schemeId,
      fundId,
      financialYear: Number(dueDate.slice(0, 4)),
      budgetAmount: amount,
      frequency: "ONE_OFF",
      totalLots: scheme.totalLots,
      totalEntitlement: scheme.totalEntitlement,
      levyType: "SPECIAL",
      title,
      description,
      dueDate,
      approval: { approvedBy: profile.id, approvedAt: resolutionDate },
    });

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "SPECIAL_LEVY_CREATED",
      entityType: "LevySchedule",
      entityId: schedule.id,
      metadata: { title, amount, dueDate },
    });

    revalidatePath(financePath(schemeId, "/levies"));
    return { success: true, data: { id: schedule.id } };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to create the special levy." };
  }
}

/**
 * Record that the year-end pack (financial statements, GST summary, audit
 * trail export and committee pack) has been generated for a financial year.
 * Charges the StrataVerze year-end pack fee once per scheme per year, in the
 * same transaction as the record.
 */
export async function generateYearEndPackAction(
  schemeId: string,
  financialYear: number,
  feeConfirmedCents: number | null = null,
): Promise<ActionState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);
    if (!Number.isInteger(financialYear) || financialYear < 2000) {
      return { error: "Choose a financial year." };
    }
    await db.transaction(async (tx) => {
      await captureUsageFee(tx.orm, {
        schemeId,
        code: "YEAR_END_PACK",
        sourceType: "YearEndPack",
        sourceId: `${schemeId}_FY${financialYear}`,
        actorId: profile.id,
        confirmedCents: feeConfirmedCents,
      });
    });
    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "YEAR_END_PACK_GENERATED",
      entityType: "Scheme",
      entityId: schemeId,
      metadata: { financialYear },
    });
    revalidatePath(financePath(schemeId, "/reports"));
    return { success: true };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    const feeError = feeErrorMessage(err);
    if (feeError) return { error: feeError };
    return { error: "Failed to generate the year-end pack." };
  }
}

/** Form wrapper for recording a payment against one notice. */
export async function recordLevyPaymentFormAction(
  schemeId: string,
  levyNoticeId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const amount = Number(formData.get("amount") || 0);
  const paymentDate = String(formData.get("paymentDate") ?? "").trim();
  const notice = await db.orm.public.LevyNotice.where((ln) => ln.id.eq(levyNoticeId)).first();
  if (!notice || notice.schemeId !== schemeId) return { error: "Levy notice not found." };
  const result = await recordLevyPaymentAction(
    schemeId,
    levyNoticeId,
    amount,
    paymentDate,
    confirmedCentsFrom(formData),
    formData.get("confirmOverpayment") === "on",
  );
  if (result.success) {
    revalidatePath(financePath(schemeId, `/levies/${notice.levyScheduleId}`));
  }
  return result;
}

/**
 * Record a payment against a levy notice. A payment above what the notice
 * owes needs `confirmOverpayment`; the excess is then held as the owner's
 * credit for the lot (DR bank, CR levies paid in advance).
 */
export async function recordLevyPaymentAction(
  schemeId: string,
  levyNoticeId: string,
  amount: number,
  paymentDate: string,
  feeConfirmedCents: number | null = null,
  confirmOverpayment = false,
): Promise<ActionState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);
    if (!(amount > 0)) return { error: "Payment amount must be greater than zero." };
    if (!ISO_DATE.test(paymentDate)) return { error: "Payment date is required." };

    const result = await receiptLevyPayment({
      schemeId,
      levyNoticeId,
      amountCents: Math.round(amount * 100),
      paymentDate,
      actorId: profile.id,
      feeConfirmedCents,
      confirmOverpayment,
    });

    revalidatePath(financePath(schemeId));
    return { success: true, data: { creditHeld: fromCents(result.excessCents) } };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    if (err instanceof LevyReceiptError) return { error: err.message, data: err.data };
    const msg = err instanceof Error ? err.message : "Failed to record payment.";
    return { error: msg };
  }
}

// ═══════════════════════════════════════════════════════════════
// 6. SUPPLIER MANAGEMENT & INVOICES
// ═══════════════════════════════════════════════════════════════

export async function createFinancialSupplierAction(
  schemeId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);

    const companyName = (formData.get("companyName") as string)?.trim();
    const tradingName = (formData.get("tradingName") as string)?.trim() || undefined;
    const abn = (formData.get("abn") as string)?.trim() || undefined;
    const contactName = (formData.get("contactName") as string)?.trim() || undefined;
    const email = (formData.get("email") as string)?.trim() || undefined;
    const phone = (formData.get("phone") as string)?.trim() || undefined;
    const bankBsb = (formData.get("bankBsb") as string)?.trim() || undefined;
    const bankAccountNumber = (formData.get("bankAccountNumber") as string)?.trim() || undefined;
    const bankAccountName = (formData.get("bankAccountName") as string)?.trim() || undefined;
    const paymentTerms = Number(formData.get("paymentTerms") || 30);

    if (!companyName) {
      return { fieldErrors: { companyName: "Company name is required." } };
    }

    if (bankBsb && !/^\d{3}-?\d{3}$/.test(bankBsb)) {
      return { fieldErrors: { bankBsb: "BSB must be in NNN-NNN format." } };
    }

    const supplier = await createFinancialSupplier({
      schemeId,
      companyName,
      tradingName,
      abn,
      contactName,
      email,
      phone,
      bankBsb,
      bankAccountNumber,
      bankAccountName,
      paymentTerms,
    });

    // New bank details must be verified by someone else before any payment.
    if (bankBsb || bankAccountNumber) {
      await recordBankDetailChange(db.orm, {
        supplierId: supplier.id,
        schemeId,
        previous: { bsb: null, accountNumber: null, accountName: null },
        next: { bsb: bankBsb ?? null, accountNumber: bankAccountNumber ?? null, accountName: bankAccountName ?? null },
        changedBy: profile.id,
      });
    }

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "FINANCIAL_SUPPLIER_CREATED",
      entityType: "Supplier",
      entityId: supplier.id,
      metadata: { companyName },
    });

    revalidatePath(financePath(schemeId));
    return { success: true, data: { id: supplier.id } };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    if (isRedirectError(err)) throw err;
    return { error: "Failed to create supplier." };
  }
}

export async function createSupplierInvoiceAction(
  schemeId: string,
  data: {
    supplierId: string;
    invoiceNumber: string;
    invoiceDate: string;
    dueDate: string;
    subtotal: number;
    gstAmount: number;
    totalAmount: number;
    description: string;
    accountCodeId: string;
    fundId: string;
    /** Set when the invoice was filled in from an uploaded PDF (TC-009). */
    extractionId?: string;
    /** The adviser has checked each extracted field against the invoice. */
    reviewConfirmed?: boolean;
  },
): Promise<ActionState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);

    if (!data.supplierId) return { error: "Supplier is required." };
    if (data.extractionId && !data.reviewConfirmed) {
      return { error: "Check each field against the invoice and tick the review box before creating it." };
    }
    if (Math.round(data.subtotal * 100) + Math.round(data.gstAmount * 100) !== Math.round(data.totalAmount * 100)) {
      return { error: "Subtotal plus GST must equal the total." };
    }
    if (data.extractionId) await assertExtractionUsable(schemeId, data.extractionId);
    if (!data.invoiceNumber?.trim()) return { error: "Invoice number is required." };
    if (!data.invoiceDate) return { error: "Invoice date is required." };
    if (!data.dueDate) return { error: "Due date is required." };
    if (data.totalAmount <= 0) return { error: "Total amount must be greater than zero." };

    // Duplicate detection (warn but allow override via skipDuplicateCheck)
    const duplicates = await checkInvoiceDuplicates(
      schemeId,
      data.supplierId,
      data.invoiceNumber.trim(),
      data.totalAmount,
      data.invoiceDate,
    );

    if (duplicates.length > 0 && !(data as { skipDuplicateCheck?: boolean }).skipDuplicateCheck) {
      return {
        error: `Possible duplicate: ${duplicates[0].matchReason}. Existing invoice ${duplicates[0].invoiceNumber} (${duplicates[0].status}) for $${duplicates[0].totalAmount.toFixed(2)}. Submit again to proceed anyway.`,
        data: { isDuplicate: true, duplicates },
      };
    }

    const invoice = await createSupplierInvoice({
      schemeId,
      supplierId: data.supplierId,
      invoiceNumber: data.invoiceNumber.trim(),
      invoiceDate: data.invoiceDate,
      dueDate: data.dueDate,
      subtotal: data.subtotal,
      gstAmount: data.gstAmount,
      totalAmount: data.totalAmount,
      description: data.description,
      accountCodeId: data.accountCodeId,
      fundId: data.fundId,
      preparedById: profile.id,
    });

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "SUPPLIER_INVOICE_CREATED",
      entityType: "SupplierInvoice",
      entityId: invoice.id,
      metadata: {
        invoiceNumber: data.invoiceNumber,
        totalAmount: data.totalAmount,
        supplierId: data.supplierId,
      },
    });

    let correctionCount: number | undefined;
    let reviewWarning: string | undefined;
    if (data.extractionId) {
      try {
        const corrections = await completeInvoiceReview({
          schemeId,
          extractionId: data.extractionId,
          invoiceId: invoice.id,
          actorId: profile.id,
          accepted: {
            supplierId: data.supplierId,
            invoiceNumber: data.invoiceNumber.trim(),
            invoiceDate: data.invoiceDate,
            dueDate: data.dueDate,
            subtotalCents: Math.round(data.subtotal * 100),
            gstCents: Math.round(data.gstAmount * 100),
            totalCents: Math.round(data.totalAmount * 100),
            description: data.description ?? "",
          },
        });
        correctionCount = corrections.length;
      } catch (reviewErr) {
        // The invoice exists: say so, rather than reporting it as not created.
        console.error("Invoice review record failed:", reviewErr);
        reviewWarning = "The invoice was created, but the record of the extraction review could not be saved.";
      }
    }

    revalidatePath(financePath(schemeId));
    return { success: true, data: { id: invoice.id, correctionCount, reviewWarning } };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    if (err instanceof InvoiceReviewError) return { error: err.message };
    if (isRedirectError(err)) throw err;
    return { error: "Failed to create supplier invoice." };
  }
}

export async function approveInvoiceAction(
  schemeId: string,
  invoiceId: string,
): Promise<ActionState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER", "COMMITTEE", "PAYMENT_AUTHORISER"]);
    const ip = (await headers()).get("x-forwarded-for");
    const outcome = await authoriseSupplierInvoice({ schemeId, invoiceId, actorId: profile.id, ip });
    revalidatePath(financePath(schemeId));
    revalidatePath(financePath(schemeId, `/invoices/${invoiceId}`));
    return {
      success: true,
      data: {
        complete: outcome.complete,
        message: outcome.complete
          ? "Invoice approved."
          : `Approval ${outcome.approvals} of ${outcome.required} recorded. A second approver is needed.`,
      },
    };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    if (err instanceof PaymentControlError) return { error: err.message };
    console.error("approveInvoiceAction error:", err);
    return { error: "Failed to approve invoice." };
  }
}

export async function recordInvoicePaymentAction(
  schemeId: string,
  invoiceId: string,
  amount: number,
  paymentDate: string,
  _paymentReference?: string,
  feeConfirmedCents: number | null = null,
): Promise<ActionState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);

    if (amount <= 0) return { error: "Payment amount must be greater than zero." };
    if (!paymentDate) return { error: "Payment date is required." };

    // Fetch invoice details before recording payment
    const invoice = await getSupplierInvoiceById(invoiceId);
    if (!invoice || invoice.schemeId !== schemeId) return { error: "Invoice not found." };

    // Payment controls: approved, segregation of duties, verified bank details.
    const controls = await supplierInvoiceControls(invoiceId);
    const sod = controls ? await checkInvoiceControl(schemeId, "RECORD_PAYMENT", profile.id, controls.forControls) : null;
    if (!sod || sod.result === "blocked") return { error: sod?.reason ?? "Invoice not found." };
    const settings = await getPaymentSettings(schemeId);
    const bank = checkBankDetailsForPayment(
      await getLatestBankDetailVersion(invoice.supplierId),
      new Date().toISOString(),
      settings.coolingOffDays,
    );
    if (bank.result === "blocked") return { error: bank.reason };
    if (sod.result === "exception") {
      await logActivity({
        schemeId,
        actorId: profile.id,
        action: "PAYMENT_CONTROL_EXCEPTION",
        entityType: "SupplierInvoice",
        entityId: invoiceId,
        metadata: { control: "SEGREGATION_OF_DUTIES", reason: sod.reason },
      });
    }

    await recordInvoicePayment(invoiceId, amount, { paymentDate, actorId: profile.id, feeConfirmedCents });

    // ── Auto journal entry: DR Accounts Payable, CR Bank ──
    if (invoice) {
      const payableAccount = await getSystemAccountBySubType(
        schemeId,
        "ACCOUNTS_PAYABLE",
      );
      const bankAccount = await getSystemAccountBySubType(
        schemeId,
        "BANK",
        "ADMINISTRATIVE",
      );

      if (payableAccount && bankAccount) {
        const entryNumber = await getNextEntryNumber(schemeId);
        const entry = await createJournalEntry({
          schemeId,
          entryNumber,
          transactionDate: paymentDate,
          description: `Invoice payment — ${String(invoice.invoiceNumber)} (${invoice.supplier?.companyName ?? "supplier"})`,
          entryType: "AUTO",
          sourceType: "PAYMENT",
          sourceId: invoiceId,
          createdBy: profile.id,
          lines: [
            {
              accountCodeId: payableAccount.id,
              fundId: invoice.fundId,
              debit: amount,
              description: `Accounts payable settled — invoice ${String(invoice.invoiceNumber)}`,
              supplierId: invoice.supplierId,
            },
            {
              accountCodeId: bankAccount.id,
              fundId: invoice.fundId,
              credit: amount,
              description: "Bank payment — supplier invoice",
            },
          ],
        });
        await postJournalEntry(entry.id, profile.id);
      }
    }

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "SUPPLIER_INVOICE_PAYMENT",
      entityType: "SupplierInvoice",
      entityId: invoiceId,
      metadata: { amount, paymentDate },
    });

    revalidatePath(financePath(schemeId));
    return { success: true };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    const msg = err instanceof Error ? err.message : "Failed to record payment.";
    return { error: msg };
  }
}

export async function cancelInvoiceAction(
  schemeId: string,
  invoiceId: string,
): Promise<ActionState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);

    const target = await getSupplierInvoiceById(invoiceId);
    if (!target || target.schemeId !== schemeId) return { error: "Invoice not found." };
    if (isStrataVerzeSupplier(target.supplierId)) {
      return {
        error:
          "A StrataVerze invoice cannot be cancelled here. Leave it unapproved and contact StrataVerze if you dispute it.",
      };
    }

    await cancelInvoice(invoiceId);

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "SUPPLIER_INVOICE_CANCELLED",
      entityType: "SupplierInvoice",
      entityId: invoiceId,
      metadata: {},
    });

    revalidatePath(financePath(schemeId));
    return { success: true };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to cancel invoice." };
  }
}

// ═══════════════════════════════════════════════════════════════
// 7. FINANCIAL DOCUMENTS
// ═══════════════════════════════════════════════════════════════

export async function uploadFinancialDocumentAction(
  schemeId: string,
  data: {
    documentType: string;
    fileName: string;
    fileUrl: string;
    fileSize: number;
    mimeType: string;
    lotId?: string;
    supplierId?: string;
    supplierInvoiceId?: string;
    levyNoticeId?: string;
    bankTransactionId?: string;
    amount?: number;
    documentDate?: string;
    payerName?: string;
    payeeReference?: string;
  },
): Promise<ActionState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, [
      "ADVISER",
      "COMMITTEE",
      "OWNER",
    ]);

    if (!data.fileName) return { error: "File name is required." };
    if (!data.fileUrl) return { error: "File URL is required." };
    if (!data.documentType) return { error: "Document type is required." };

    // Validate file size (10 MB max per requirements)
    if (data.fileSize > 10 * 1024 * 1024) {
      return { error: "File size must not exceed 10 MB." };
    }

    // Validate MIME type
    const allowedTypes = [
      "application/pdf",
      "image/png",
      "image/jpeg",
      "image/jpg",
      "image/heic",
    ];
    if (!allowedTypes.includes(data.mimeType)) {
      return { error: "Only PDF, PNG, JPG, JPEG, and HEIC files are allowed." };
    }

    // Duplicate detection for documents
    const docDuplicates = await checkDocumentDuplicates(
      schemeId,
      data.fileName,
      data.fileSize,
      data.documentType,
      data.amount,
      data.documentDate,
    );

    if (docDuplicates.length > 0 && !(data as { skipDuplicateCheck?: boolean }).skipDuplicateCheck) {
      return {
        error: `Possible duplicate: ${docDuplicates[0].matchReason}. Existing document "${docDuplicates[0].fileName}" (${docDuplicates[0].documentStatus}). Submit again to proceed anyway.`,
        data: { isDuplicate: true, duplicates: docDuplicates },
      };
    }

    const doc = await createFinancialDocument({
      ...data,
      schemeId,
      uploadedBy: profile.id,
    });

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "FINANCIAL_DOCUMENT_UPLOADED",
      entityType: "FinancialDocument",
      entityId: doc.id,
      metadata: {
        documentType: data.documentType,
        fileName: data.fileName,
      },
    });

    revalidatePath(financePath(schemeId));
    return { success: true, data: { id: doc.id } };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to upload document." };
  }
}

export async function reviewDocumentAction(
  schemeId: string,
  documentId: string,
  data: {
    documentStatus: string;
    reviewNotes?: string;
  },
): Promise<ActionState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);

    await reviewDocument(documentId, {
      documentStatus: data.documentStatus,
      reviewedBy: profile.id,
      reviewNotes: data.reviewNotes,
    });

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "FINANCIAL_DOCUMENT_REVIEWED",
      entityType: "FinancialDocument",
      entityId: documentId,
      metadata: { status: data.documentStatus },
    });

    revalidatePath(financePath(schemeId));
    return { success: true };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to review document." };
  }
}

export async function updateDocumentVerificationAction(
  schemeId: string,
  documentId: string,
  status: string,
): Promise<ActionState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);

    await updateVerificationStatus(documentId, status);

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "FINANCIAL_DOCUMENT_VERIFICATION_UPDATED",
      entityType: "FinancialDocument",
      entityId: documentId,
      metadata: { verificationStatus: status },
    });

    revalidatePath(financePath(schemeId));
    return { success: true };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to update verification status." };
  }
}

// ═══════════════════════════════════════════════════════════════
// 8. FINANCIAL PERIODS
// ═══════════════════════════════════════════════════════════════

export async function generateFinancialPeriodsAction(
  schemeId: string,
  financialYearStart: string,
  financialYearEnd: string,
): Promise<ActionState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);

    if (!financialYearStart) {
      return { error: "Financial year start date is required." };
    }
    if (!financialYearEnd) {
      return { error: "Financial year end date is required." };
    }

    const periods = await generateMonthlyPeriods(schemeId, financialYearStart, financialYearEnd);

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "FINANCIAL_PERIODS_GENERATED",
      entityType: "FinancialPeriod",
      entityId: schemeId,
      metadata: {
        count: periods.length,
        yearStart: financialYearStart,
      },
    });

    revalidatePath(financePath(schemeId));
    return { success: true, data: { count: periods.length } };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    const msg = err instanceof Error ? err.message : "Failed to generate financial periods.";
    return { error: msg };
  }
}

export async function closePeriodAction(
  schemeId: string,
  periodId: string,
): Promise<ActionState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);
    const period = await db.orm.public.FinancialPeriod.where((p) => p.id.eq(periodId)).first();
    if (!period || period.schemeId !== schemeId) return { error: "Financial period not found." };
    if (period.status !== "OPEN") return { error: "Only an open period can be closed." };

    // Unidentified amounts in suspense must be cleared before the period closes.
    const periodEnd = String(period.endDate).slice(0, 10);
    const blocking = suspenseBlockingClose(
      periodEnd,
      (await getSuspenseItems(schemeId, "OPEN")).map((i) => ({
        id: i.id,
        transactionDate: i.transactionDate,
        amountCents: i.amountCents,
        description: i.description,
      })),
    );
    if (blocking.length > 0) {
      const list = blocking
        .slice(0, 5)
        .map((i) => `${i.transactionDate} $${fromCents(Math.abs(i.amountCents)).toFixed(2)} ${i.description}`)
        .join("; ");
      return {
        error: `Clear ${blocking.length} suspense item${blocking.length === 1 ? "" : "s"} before closing this period: ${list}${blocking.length > 5 ? "; and more" : ""}.`,
        data: { suspense: blocking },
      };
    }

    await closePeriod(periodId, profile.id);

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "FINANCIAL_PERIOD_CLOSED",
      entityType: "FinancialPeriod",
      entityId: periodId,
      metadata: {},
    });

    revalidatePath(financePath(schemeId));
    return { success: true };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to close financial period." };
  }
}

export async function lockPeriodAction(
  schemeId: string,
  periodId: string,
): Promise<ActionState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);

    await lockPeriod(periodId);

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "FINANCIAL_PERIOD_LOCKED",
      entityType: "FinancialPeriod",
      entityId: periodId,
      metadata: {},
    });

    revalidatePath(financePath(schemeId));
    return { success: true };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to lock financial period." };
  }
}

export async function reopenPeriodAction(
  schemeId: string,
  periodId: string,
): Promise<ActionState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);

    await reopenPeriod(periodId);

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "FINANCIAL_PERIOD_REOPENED",
      entityType: "FinancialPeriod",
      entityId: periodId,
      metadata: {},
    });

    revalidatePath(financePath(schemeId));
    return { success: true };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to reopen financial period." };
  }
}

// ═══════════════════════════════════════════════════════════════
// 10. BUDGET MANAGEMENT
// ═══════════════════════════════════════════════════════════════

export async function createBudgetLineAction(
  schemeId: string,
  data: {
    fundId: string;
    accountCodeId: string;
    financialYear: number;
    budgetAmount: number;
    notes?: string;
  },
): Promise<ActionState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);
    const account = await db.orm.public.AccountCode.where((a) => a.id.eq(data.accountCodeId)).first();
    if (!account || account.schemeId !== schemeId) return { error: "Choose an account of this scheme." };
    const budget = await editableBudgetFor(schemeId, data.fundId, data.financialYear, profile.id);

    const line = await createBudgetLine({ ...data, budgetId: budget.id });

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "BUDGET_LINE_CREATED",
      entityType: "BudgetLine",
      entityId: line.id,
      metadata: {
        fundId: data.fundId,
        accountCodeId: data.accountCodeId,
        financialYear: data.financialYear,
        budgetAmount: data.budgetAmount,
      },
    });

    revalidatePath(financePath(schemeId, "/budget"));
    return { success: true, data: { id: line.id } };
  } catch (err) {
    if (err instanceof AuthorisationError || err instanceof BudgetError) return { error: err.message };
    const message = err instanceof Error ? err.message : "";
    if (message.includes("unique") || message.includes("duplicate")) {
      return { error: "A budget line already exists for this account and financial year." };
    }
    return { error: "Failed to create budget line." };
  }
}

export async function updateBudgetLineAction(
  schemeId: string,
  budgetLineId: string,
  data: {
    budgetAmount?: number;
    notes?: string | null;
  },
): Promise<ActionState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);
    await assertLineEditable(schemeId, budgetLineId);

    await updateBudgetLine(budgetLineId, data);

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "BUDGET_LINE_UPDATED",
      entityType: "BudgetLine",
      entityId: budgetLineId,
      metadata: { ...data },
    });

    revalidatePath(financePath(schemeId, "/budget"));
    return { success: true };
  } catch (err) {
    if (err instanceof AuthorisationError || err instanceof BudgetError) return { error: err.message };
    return { error: "Failed to update budget line." };
  }
}

export async function deleteBudgetLineAction(
  schemeId: string,
  budgetLineId: string,
): Promise<ActionState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);
    await assertLineEditable(schemeId, budgetLineId);

    await deleteBudgetLine(budgetLineId);

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "BUDGET_LINE_DELETED",
      entityType: "BudgetLine",
      entityId: budgetLineId,
      metadata: {},
    });

    revalidatePath(financePath(schemeId, "/budget"));
    return { success: true };
  } catch (err) {
    if (err instanceof AuthorisationError || err instanceof BudgetError) return { error: err.message };
    return { error: "Failed to delete budget line." };
  }
}

// ═══════════════════════════════════════════════════════════════
// 11. INTEREST CHARGES
// ═══════════════════════════════════════════════════════════════

export async function chargeInterestAction(
  schemeId: string,
  noticeId: string,
  interestAmount: number,
): Promise<ActionState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);

    if (interestAmount <= 0) {
      return { error: "Interest amount must be greater than zero." };
    }

    const result = await chargeInterest({
      schemeId,
      noticeId,
      interestAmount,
      actorId: profile.id,
    });

    revalidatePath(financePath(schemeId, "/interest"));
    revalidatePath(financePath(schemeId));
    return {
      success: true,
      data: {
        noticeId: result.noticeId,
        interestAmount: result.interestAmount,
        journalEntryId: result.journalEntryId,
      },
    };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    if (isRedirectError(err)) throw err;
    const msg = err instanceof Error ? err.message : "Failed to charge interest.";
    return { error: msg };
  }
}

export async function chargeInterestBatchAction(
  schemeId: string,
): Promise<ActionState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);

    const result = await chargeInterestBatch({
      schemeId,
      actorId: profile.id,
    });

    revalidatePath(financePath(schemeId, "/interest"));
    revalidatePath(financePath(schemeId));
    return {
      success: true,
      data: {
        charged: result.charged,
        totalInterest: result.totalInterest,
      },
    };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    if (isRedirectError(err)) throw err;
    const msg = err instanceof Error ? err.message : "Failed to charge interest.";
    return { error: msg };
  }
}

// ═══════════════════════════════════════════════════════════════
// 12. ADJUSTMENT ENTRIES (CLOSED PERIOD)
// ═══════════════════════════════════════════════════════════════

export async function createAdjustmentEntryAction(
  schemeId: string,
  data: {
    transactionDate: string;
    description: string;
    lines: Array<{
      accountCodeId: string;
      fundId: string;
      debit?: number;
      credit?: number;
      description?: string;
    }>;
  },
): Promise<ActionState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);

    if (!data.description.trim()) {
      return { error: "Description is required." };
    }

    if (data.lines.length < 2) {
      return { error: "At least two journal lines are required for a balanced entry." };
    }

    const entryNumber = await getNextEntryNumber(schemeId);

    const entry = await createJournalEntry({
      schemeId,
      entryNumber,
      transactionDate: data.transactionDate,
      description: data.description.trim(),
      entryType: "ADJUSTMENT",
      sourceType: "ADJUSTMENT",
      createdBy: profile.id,
      lines: data.lines,
    });

    // Post immediately — period validation in postJournalEntry allows
    // ADJUSTMENT entries in CLOSED periods
    await postJournalEntry(entry.id, profile.id);

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "JOURNAL_ENTRY_POSTED",
      entityType: "JournalEntry",
      entityId: entry.id,
      metadata: {
        entryNumber,
        entryType: "ADJUSTMENT",
        transactionDate: data.transactionDate,
      },
    });

    revalidatePath(financePath(schemeId, "/periods"));
    revalidatePath(financePath(schemeId, "/journal"));
    revalidatePath(financePath(schemeId));
    return {
      success: true,
      data: { entryId: entry.id, entryNumber },
    };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    if (isRedirectError(err)) throw err;
    const msg = err instanceof Error ? err.message : "Failed to create adjustment entry.";
    return { error: msg };
  }
}

// ═══════════════════════════════════════════════════════════════
// 13. MATCHING RULES
// ═══════════════════════════════════════════════════════════════

export async function createMatchingRuleAction(
  schemeId: string,
  data: {
    name: string;
    description?: string;
    matchType: string;
    descriptionPattern?: string;
    referencePattern?: string;
    exactAmount?: number;
    minAmount?: number;
    maxAmount?: number;
    transactionSign?: string;
    targetAccountCodeId?: string;
    targetFundId?: string;
    autoPost?: boolean;
    priority?: number;
  },
): Promise<ActionState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);

    if (!data.name.trim()) {
      return { error: "Rule name is required." };
    }

    if (!data.matchType) {
      return { error: "Match type is required." };
    }

    const rule = await createMatchingRule({ schemeId, ...data });

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "MATCHING_RULE_CREATED",
      entityType: "MatchingRule",
      entityId: rule.id,
      metadata: { name: data.name, matchType: data.matchType },
    });

    revalidatePath(financePath(schemeId, "/matching-rules"));
    return { success: true, data: { id: rule.id } };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to create matching rule." };
  }
}

export async function updateMatchingRuleAction(
  schemeId: string,
  ruleId: string,
  data: Partial<{
    name: string;
    description: string | null;
    matchType: string;
    descriptionPattern: string | null;
    referencePattern: string | null;
    exactAmount: number | null;
    minAmount: number | null;
    maxAmount: number | null;
    transactionSign: string | null;
    targetAccountCodeId: string | null;
    targetFundId: string | null;
    autoPost: boolean;
    priority: number;
    isActive: boolean;
  }>,
): Promise<ActionState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);

    await updateMatchingRule(ruleId, data);

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "MATCHING_RULE_UPDATED",
      entityType: "MatchingRule",
      entityId: ruleId,
      metadata: { ...data },
    });

    revalidatePath(financePath(schemeId, "/matching-rules"));
    return { success: true };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to update matching rule." };
  }
}

export async function deleteMatchingRuleAction(
  schemeId: string,
  ruleId: string,
): Promise<ActionState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);

    await deleteMatchingRule(ruleId);

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "MATCHING_RULE_DELETED",
      entityType: "MatchingRule",
      entityId: ruleId,
      metadata: {},
    });

    revalidatePath(financePath(schemeId, "/matching-rules"));
    return { success: true };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to delete matching rule." };
  }
}

export async function runAutoMatchAction(
  schemeId: string,
  bankAccountId?: string,
): Promise<ActionState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);

    const result = await autoMatchTransactions(schemeId, bankAccountId, profile.id);

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "AUTO_MATCH_RUN",
      entityType: "Scheme",
      entityId: schemeId,
      metadata: {
        matched: result.matched,
        bankAccountId: bankAccountId ?? "all",
      },
    });

    revalidatePath(financePath(schemeId, "/matching-rules"));
    revalidatePath(financePath(schemeId, "/reconciliation"));
    return {
      success: true,
      data: {
        matched: result.matched,
        results: result.results,
      },
    };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to run auto-matching." };
  }
}

// ── Audit trail CSV export ───────────────────────────────────

export async function exportAuditTrailAction(
  schemeId: string,
  filters: AuditTrailFilters,
): Promise<{ error?: string; data?: { csv: string; filename: string } }> {
  try {
    await requireSchemeMembership(schemeId, ["ADVISER"]);

    const rows = await getAuditTrailForExport(schemeId, filters);
    const csv = formatAuditTrailCsv(rows);

    const datePart = new Date().toISOString().slice(0, 10);
    const filename = `audit-trail-${datePart}.csv`;

    return { data: { csv, filename } };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to export audit trail." };
  }
}

// ── Invoice PDF extraction ───────────────────────────────────

export async function extractInvoiceFromPdfAction(
  schemeId: string,
  base64Data: string,
  fileName = "invoice.pdf",
): Promise<{
  error?: string;
  data?: Omit<ExtractedInvoiceData, "rawText">;
  extractionId?: string;
  documentId?: string;
}> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);

    const buffer = Buffer.from(base64Data, "base64");

    if (buffer.length > 10 * 1024 * 1024) {
      return { error: "PDF file exceeds 10 MB limit." };
    }
    if (buffer.subarray(0, 5).toString("latin1") !== "%PDF-") {
      return { error: "That file is not a PDF." };
    }

    const result = await extractInvoiceFromPdf(buffer);

    // TC-009: keep the invoice and exactly what was read from it, before any review.
    const stored = await storeUploadedInvoicePdf({ schemeId, fileName, bytes: new Uint8Array(buffer), actorId: profile.id });
    const extractionId = await recordInvoiceExtraction({ schemeId, documentId: stored.id, data: result, actorId: profile.id });

    const { rawText: _rawText, ...data } = result;
    void _rawText;
    return { data, extractionId, documentId: stored.id };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    console.error("Invoice extraction error:", err);
    return {
      error:
        err instanceof Error
          ? err.message
          : "Failed to extract data from the PDF.",
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// INTEREST SETTING (SSMA 2015 s 85)
// ═══════════════════════════════════════════════════════════════

/**
 * Record whether the scheme charges statutory interest or, by a recorded
 * general meeting resolution, no interest. No other rate can be set.
 */
export async function saveInterestSettingAction(
  schemeId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);
    const mode = String(formData.get("mode") ?? "");
    const meetingId = String(formData.get("meetingId") ?? "").trim() || null;
    const motionId = String(formData.get("motionId") ?? "").trim() || null;
    const problem = interestSettingProblem({ mode, resolutionMeetingId: meetingId, resolutionMotionId: motionId });
    if (problem) return { error: problem };

    if (mode === "NO_INTEREST") {
      const resolution = await generalMeetingResolutionProblem(schemeId, meetingId, motionId);
      if (resolution) return { error: resolution };
    }

    await db.orm.public.Scheme.where((s) => s.id.eq(schemeId)).update({
      interestMode: mode,
      interestResolutionMeetingId: mode === "NO_INTEREST" ? meetingId : null,
      interestResolutionMotionId: mode === "NO_INTEREST" ? motionId : null,
      interestResolutionRecordedBy: profile.id,
      interestResolutionRecordedAt: new Date().toISOString() as unknown as TimestampString<3>,
    });
    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "INTEREST_SETTING_CHANGED",
      entityType: "Scheme",
      entityId: schemeId,
      metadata: { mode, meetingId, motionId },
    });
    revalidatePath(financePath(schemeId, "/interest"));
    return { success: true };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to save the interest setting." };
  }
}
