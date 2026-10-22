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

// ── Invoice extraction ───────────────────────────────────────
import {
  extractInvoiceFromPdf,
  type ExtractedInvoiceData,
} from "@/lib/queries/invoice-extraction";

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
} from "@/lib/queries/journal-entries";

// ── Bank transactions ─────────────────────────────────────────
import {
  importBankTransactions,
  matchTransaction,
  reconcileTransaction,
  excludeTransaction,
  unmatchTransaction,
} from "@/lib/queries/bank-transactions";

// ── Levy schedules & notices ──────────────────────────────────
import {
  createLevySchedule,
  createLevyNoticesBatch,
  issueLevyNotice,
  recordLevyPayment,
  approveLevySchedule,
  activateLevySchedule,
  getLevyScheduleById,
  getNextNoticeNumber,
} from "@/lib/queries/levy-schedules";
import { getSchemeById } from "@/lib/queries/schemes";
import { captureUsageFee } from "@/lib/billing/capture";
import { confirmedCentsFrom, feeErrorMessage } from "@/lib/billing/disclosure";
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
  approveInvoice,
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
  checkPaymentDuplicates,
  checkDocumentDuplicates,
} from "@/lib/queries/duplicate-detection";

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
  }>,
  importSource: string,
): Promise<ActionState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);

    if (!transactions || transactions.length === 0) {
      return { error: "No transactions to import." };
    }

    const importBatchId = crypto.randomUUID();

    const created = await importBankTransactions(
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
        source: importSource,
      },
    });

    revalidatePath(financePath(schemeId));
    return {
      success: true,
      data: {
        imported: newCount,
        duplicates: duplicateCount,
        batchId: importBatchId,
      },
    };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to import bank transactions." };
  }
}

export async function matchTransactionAction(
  schemeId: string,
  transactionId: string,
  journalEntryId: string,
): Promise<ActionState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);

    await matchTransaction(transactionId, journalEntryId, profile.id);

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "BANK_TRANSACTION_MATCHED",
      entityType: "BankTransaction",
      entityId: transactionId,
      metadata: { journalEntryId },
    });

    revalidatePath(financePath(schemeId));
    return { success: true };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to match transaction." };
  }
}

export async function reconcileTransactionAction(
  schemeId: string,
  transactionId: string,
): Promise<ActionState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);

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

export async function excludeTransactionAction(
  schemeId: string,
  transactionId: string,
): Promise<ActionState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);

    await excludeTransaction(transactionId);

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "BANK_TRANSACTION_EXCLUDED",
      entityType: "BankTransaction",
      entityId: transactionId,
      metadata: {},
    });

    revalidatePath(financePath(schemeId));
    return { success: true };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to exclude transaction." };
  }
}

export async function unmatchTransactionAction(
  schemeId: string,
  transactionId: string,
): Promise<ActionState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);

    await unmatchTransaction(transactionId);

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "BANK_TRANSACTION_UNMATCHED",
      entityType: "BankTransaction",
      entityId: transactionId,
      metadata: {},
    });

    revalidatePath(financePath(schemeId));
    return { success: true };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
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
    const created = await createLevyNoticesBatch(
      plan.map((n) => ({
        schemeId,
        levyScheduleId: scheduleId,
        lotId: n.lotId,
        ownerId: n.ownerId,
        fundId: schedule.fundId,
        noticeNumber: `LN-${String(seq++).padStart(4, "0")}`,
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

    revalidatePath(financePath(schemeId, "/levies"));
    revalidatePath(financePath(schemeId, `/levies/${scheduleId}`));
    return { success: true, data: { count: created.length } };
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
  );
  if (result.success) {
    revalidatePath(financePath(schemeId, `/levies/${notice.levyScheduleId}`));
  }
  return result;
}

export async function recordLevyPaymentAction(
  schemeId: string,
  levyNoticeId: string,
  amount: number,
  paymentDate: string,
  feeConfirmedCents: number | null = null,
): Promise<ActionState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);

    if (amount <= 0) return { error: "Payment amount must be greater than zero." };
    if (!paymentDate) return { error: "Payment date is required." };

    // Duplicate/overpayment detection
    const paymentDuplicates = await checkPaymentDuplicates(levyNoticeId, amount);
    if (paymentDuplicates.length > 0) {
      return {
        error: paymentDuplicates[0].matchReason,
        data: { isDuplicate: true },
      };
    }

    // Fetch the levy notice to determine its fund before recording payment
    const notice = await db.orm.public.LevyNotice
      .where((ln) => ln.id.eq(levyNoticeId))
      .include("fund")
      .first();

    await recordLevyPayment(levyNoticeId, amount, { paymentDate, recordedBy: profile.id, feeConfirmedCents });

    // ── Auto journal entry: DR Bank, CR Levies Receivable ──
    if (notice) {
      const fundType = (notice.fund?.fundType ?? "ADMINISTRATIVE") as
        | "ADMINISTRATIVE"
        | "CAPITAL_WORKS";

      const bankAccount = await getSystemAccountBySubType(
        schemeId,
        "BANK",
        "ADMINISTRATIVE",
      );
      const receivableAccount = await getSystemAccountBySubType(
        schemeId,
        "ACCOUNTS_RECEIVABLE",
        fundType,
      );

      if (bankAccount && receivableAccount) {
        const entryNumber = await getNextEntryNumber(schemeId);
        const entry = await createJournalEntry({
          schemeId,
          entryNumber,
          transactionDate: paymentDate,
          description: `Levy payment received — notice ${String(notice.noticeNumber)}`,
          entryType: "AUTO",
          sourceType: "PAYMENT",
          sourceId: levyNoticeId,
          createdBy: profile.id,
          lines: [
            {
              accountCodeId: bankAccount.id,
              fundId: notice.fundId,
              debit: amount,
              description: "Bank receipt — levy payment",
            },
            {
              accountCodeId: receivableAccount.id,
              fundId: notice.fundId,
              credit: amount,
              description: "Levies receivable reduced",
            },
          ],
        });
        await postJournalEntry(entry.id, profile.id);
      }
    }

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "LEVY_PAYMENT_RECORDED",
      entityType: "LevyNotice",
      entityId: levyNoticeId,
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
  },
): Promise<ActionState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);

    if (!data.supplierId) return { error: "Supplier is required." };
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

    revalidatePath(financePath(schemeId));
    return { success: true, data: { id: invoice.id } };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    if (isRedirectError(err)) throw err;
    return { error: "Failed to create supplier invoice." };
  }
}

export async function approveInvoiceAction(
  schemeId: string,
  invoiceId: string,
): Promise<ActionState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, [
      "ADVISER",
      "COMMITTEE",
    ]);

    await approveInvoice(invoiceId, profile.id);

    // ── Auto journal entry: DR Expense, CR Accounts Payable ──
    const invoice = await getSupplierInvoiceById(invoiceId);
    if (invoice && Number(invoice.totalAmount) > 0) {
      const totalAmount = Number(invoice.totalAmount);
      const gstAmount = Number(invoice.gstAmount ?? 0);
      const netAmount = totalAmount - gstAmount;

      const payableAccount = await getSystemAccountBySubType(
        schemeId,
        "ACCOUNTS_PAYABLE",
      );

      if (payableAccount && invoice.accountCodeId) {
        const entryNumber = await getNextEntryNumber(schemeId);
        const today = new Date().toISOString().split("T")[0];

        const lines: Array<{
          accountCodeId: string;
          fundId: string;
          debit?: number;
          credit?: number;
          description?: string;
          supplierId?: string;
        }> = [
          {
            accountCodeId: invoice.accountCodeId,
            fundId: invoice.fundId,
            debit: netAmount,
            description: `Expense — invoice ${String(invoice.invoiceNumber)}`,
            supplierId: invoice.supplierId,
          },
        ];

        // If GST was charged, debit the GST Paid account
        if (gstAmount > 0) {
          const gstPaidAccount = await getSystemAccountBySubType(
            schemeId,
            "GST_PAID",
          );
          if (gstPaidAccount) {
            lines.push({
              accountCodeId: gstPaidAccount.id,
              fundId: invoice.fundId,
              debit: gstAmount,
              description: "GST on supplier invoice",
            });
          } else {
            // No GST account seeded — debit full amount to expense
            lines[0].debit = totalAmount;
          }
        }

        lines.push({
          accountCodeId: payableAccount.id,
          fundId: invoice.fundId,
          credit: totalAmount,
          description: `Accounts payable — invoice ${String(invoice.invoiceNumber)}`,
          supplierId: invoice.supplierId,
        });

        const entry = await createJournalEntry({
          schemeId,
          entryNumber,
          transactionDate: today,
          description: `Invoice approved — ${String(invoice.invoiceNumber)} (${invoice.supplier?.companyName ?? "supplier"})`,
          entryType: "AUTO",
          sourceType: "INVOICE",
          sourceId: invoiceId,
          createdBy: profile.id,
          lines,
        });
        await postJournalEntry(entry.id, profile.id);
      }
    }

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "SUPPLIER_INVOICE_APPROVED",
      entityType: "SupplierInvoice",
      entityId: invoiceId,
      metadata: {},
    });

    revalidatePath(financePath(schemeId));
    return { success: true };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
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

    const line = await createBudgetLine(data);

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
    if (err instanceof AuthorisationError) return { error: err.message };
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
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to update budget line." };
  }
}

export async function deleteBudgetLineAction(
  schemeId: string,
  budgetLineId: string,
): Promise<ActionState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);

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
    if (err instanceof AuthorisationError) return { error: err.message };
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
): Promise<{
  error?: string;
  data?: ExtractedInvoiceData;
}> {
  try {
    await requireSchemeMembership(schemeId, ["ADVISER"]);

    const buffer = Buffer.from(base64Data, "base64");

    if (buffer.length > 10 * 1024 * 1024) {
      return { error: "PDF file exceeds 10 MB limit." };
    }

    const result = await extractInvoiceFromPdf(buffer);

    return { data: result };
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
