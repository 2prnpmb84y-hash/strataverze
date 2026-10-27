"use server";
import { logError } from "@/lib/log";
import { noticeLeadMark, noticeLeadText } from "@/lib/jurisdiction/wording";

import { uploadErrorMessage, consumeUpload, verifyUpload } from "@/lib/storage/uploads";
import { recordSecurityEvent } from "@/lib/audit/security-audit";
import { revalidatePath } from "next/cache";
import { requireRecentMfa } from "@/lib/auth/mfa-enforcement";
import {
  requireSchemeMembership,
  AuthorisationError,
} from "@/lib/auth/require-membership";
import { assertOneOf } from "@/lib/auth/scheme-scope";
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
  approveLevySchedule,
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
import { schemeTimeZone, schemeToday } from "@/lib/jurisdiction/scheme-time";
import { interestSettingProblem } from "@/lib/finance/statutory-interest";
import { rulesForScheme } from "@/lib/jurisdiction/scheme-rules";
import { fundNameWords, ledgerFundDefinition } from "@/lib/jurisdiction/funds";
import { UnsupportedJurisdictionError, needRule } from "@/config/statutory";
import { generalMeetingResolutionProblem } from "@/lib/finance/resolutions";
import { BudgetError, assertLineEditable, editableBudgetFor, getBudgets } from "@/lib/finance/budgets";
import { levyScheduleActivationProblem } from "@/lib/finance/budget-status";
import type { TimestampString } from "@prisma/orm-postgres/target/codec-types";
import { checkPlannedNotices } from "@/lib/levies/notice-content-data";
import { issueNoticeBatch, issueOverdueDrafts, overdueDrafts } from "@/lib/levies/issue-notices";
import { issueTiming, lateMessage, urgentNoticeProblem, type IssueTiming } from "@/lib/levies/issue-timing";
import { getLatestBankDetailVersion, getPaymentSettings, recordBankDetailChange } from "@/lib/queries/payment-controls";
import { afterFinanceChange, contractorOfSupplier } from "@/lib/works/finance-link";
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
import { FundIntegrityError, accountFundProblem } from "@/lib/finance/fund-integrity";

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

/**
 * Message for an unexpected error: logged here, never shown to the browser.
 * Deliberate validation messages from the finance helpers are plain Errors
 * the UI relies on, so pass those through `keepMessages`.
 */
function unexpectedError(err: unknown, fallback: string, keepMessages: readonly RegExp[] = []): string {
  const feeError = feeErrorMessage(err);
  if (feeError) return feeError;
  // A fund out of balance, or an account used for the other fund (review B1).
  if (err instanceof FundIntegrityError) return err.message;
  // A building in a state whose rules have not been added (multi-jurisdiction plan).
  if (err instanceof UnsupportedJurisdictionError) return err.message;
  const message = err instanceof Error ? err.message : "";
  if (message && keepMessages.some((re) => re.test(message))) return message;
  logError(fallback, err);
  return fallback;
}

/** Validation messages thrown by the journal and period helpers (journal-entries.ts). */
const LEDGER_RULE_MESSAGES: readonly RegExp[] = [
  /^Journal entry is not balanced/,
  /^Journal entry must have at least one line/,
  /^This period is locked\./,
  /^Cannot post to a closed period/,
  /^Only draft journal entries can be posted\./,
  /^Only posted journal entries can be reversed/,
  // Owner credit (owner-credits.ts), applied with receipts and notices.
  /^Owner credit cannot go below zero\./,
  /^A credit movement must be more than zero\./,
  /^There is not enough credit for this\./,
];

/** Validation messages thrown by the interest helpers (interest.ts). */
const INTEREST_RULE_MESSAGES: readonly RegExp[] = [
  /^Interest amount must be greater than zero\./,
  /^Levy notice not found\./,
  /^No more than \$[\d,.]+ of interest is owed on this notice to date\./,
  /^Required system accounts .* not found\./,
  /^The owners corporation has resolved that contributions bear no interest/,
];

/** The ids a record refers to, de-duplicated; anything that is not a string is refused. */
function idList(values: readonly unknown[] | undefined, label: string): string[] {
  const ids = new Set<string>();
  for (const v of values ?? []) {
    if (v === undefined || v === null || v === "") continue;
    if (typeof v !== "string") throw new AuthorisationError(`${label} not found.`);
    ids.add(v);
  }
  return [...ids];
}

/**
 * Throw AuthorisationError unless every referenced account, fund, lot and
 * supplier belongs to this scheme (SEC-004). One query per table.
 * `allowPlatformSupplier` also accepts the platform-wide StrataVerze supplier.
 */
async function assertLinksInScheme(
  schemeId: string,
  links: {
    accountCodeIds?: readonly unknown[];
    fundIds?: readonly unknown[];
    lotIds?: readonly unknown[];
    supplierIds?: readonly unknown[];
    allowPlatformSupplier?: boolean;
  },
): Promise<void> {
  const accountCodeIds = idList(links.accountCodeIds, "Account");
  if (accountCodeIds.length > 0) {
    const rows = await db.orm.public.AccountCode
      .where((a) => and(a.id.in(accountCodeIds), a.schemeId.eq(schemeId)))
      .limit(accountCodeIds.length)
      .all();
    if (rows.length !== accountCodeIds.length) throw new AuthorisationError("Account not found.");
  }
  const fundIds = idList(links.fundIds, "Fund");
  if (fundIds.length > 0) {
    const rows = await db.orm.public.Fund
      .where((f) => and(f.id.in(fundIds), f.schemeId.eq(schemeId)))
      .limit(fundIds.length)
      .all();
    if (rows.length !== fundIds.length) throw new AuthorisationError("Fund not found.");
  }
  const lotIds = idList(links.lotIds, "Lot");
  if (lotIds.length > 0) {
    const rows = await db.orm.public.Lot
      .where((l) => and(l.id.in(lotIds), l.schemeId.eq(schemeId)))
      .limit(lotIds.length)
      .all();
    if (rows.length !== lotIds.length) throw new AuthorisationError("Lot not found.");
  }
  const supplierIds = idList(links.supplierIds, "Supplier").filter(
    (sid) => !(links.allowPlatformSupplier && isStrataVerzeSupplier(sid)),
  );
  if (supplierIds.length > 0) {
    const rows = await db.orm.public.Supplier
      .where((s) => and(s.id.in(supplierIds), s.schemeId.eq(schemeId)))
      .limit(supplierIds.length)
      .all();
    if (rows.length !== supplierIds.length) throw new AuthorisationError("Supplier not found.");
  }
}

/** Entry types an adviser may give a manual journal (journal-entry-form.tsx). */
const MANUAL_ENTRY_TYPES = ["MANUAL", "ADJUSTMENT", "CLOSING"] as const;

/** Review statuses offered on the document page, plus those in prisma/schema.prisma. */
const DOCUMENT_STATUSES = ["UPLOADED", "UNDER_REVIEW", "REVIEWED", "VERIFIED", "REJECTED", "SUPERSEDED", "ARCHIVED"] as const;
const VERIFICATION_STATUSES = ["PENDING", "VERIFIED", "FLAGGED", "MATCHED", "UNMATCHED", "DISPUTED"] as const;

/** Document types on the adviser upload form, plus those in prisma/schema.prisma. */
const UPLOAD_DOCUMENT_TYPES = [
  "RECEIPT", "INVOICE", "BANK_STATEMENT", "LEVY_NOTICE", "INSURANCE", "CONTRACTOR_QUOTE", "TAX_DOCUMENT", "OTHER",
  "SUPPLIER_INVOICE", "SUPPLIER_RECEIPT", "PAYMENT_CONFIRMATION", "RECEIPT_ISSUED",
] as const;

/** Matching rule criteria (prisma/schema.prisma MatchingRule). */
const MATCH_TYPES = ["DESCRIPTION", "REFERENCE", "AMOUNT", "DESCRIPTION_AND_AMOUNT"] as const;
const TRANSACTION_SIGNS = ["CREDIT", "DEBIT", "ANY"] as const;

// ═══════════════════════════════════════════════════════════════
// 1. CHART OF ACCOUNTS
// ═══════════════════════════════════════════════════════════════

export async function seedChartOfAccountsAction(
  schemeId: string,
): Promise<ActionState> {
  // Read before seeding, so the message below needs no further lookup.
  let fundNames: string | null = null;
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);
    // The building's funds as its pack names them: "administrative and capital works".
    const { rules } = await rulesForScheme(schemeId);
    fundNames = `${fundNameWords(ledgerFundDefinition(rules, "ADMINISTRATIVE"))} and ${fundNameWords(ledgerFundDefinition(rules, "CAPITAL_WORKS"))}`;
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
    if (err instanceof Error && /has no (ADMINISTRATIVE|CAPITAL_WORKS) fund\./.test(err.message)) {
      return { error: fundNames ? `Create the ${fundNames} funds before seeding the chart of accounts.` : "Create the funds before seeding the chart of accounts." };
    }
    return { error: unexpectedError(err, "Failed to seed chart of accounts.") };
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
    await assertLinksInScheme(schemeId, { fundIds: [fundId] });

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
    // "No specific fund" is sent as an empty value.
    const fundIdOrNull = fundId === "" ? null : fundId;
    await assertLinksInScheme(schemeId, { fundIds: [fundIdOrNull] });

    const updated = await updateAccountCode(schemeId, accountCodeId, {
      name,
      accountSubType,
      fundId: fundIdOrNull,
      gstApplicable,
      description,
    });
    if (!updated) return { error: "Account code not found." };

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

    const deactivated = await deactivateAccountCode(schemeId, accountCodeId);
    if (!deactivated) return { error: "Account code not found." };

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
    // A sensitive operation: needs an authenticator check in the last 15 minutes.
    await requireRecentMfa();

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
    // A sensitive operation: needs an authenticator check in the last 15 minutes.
    await requireRecentMfa();

    const bankName = (formData.get("bankName") as string)?.trim() || undefined;
    const accountName = (formData.get("accountName") as string)?.trim() || undefined;
    const accountType = (formData.get("accountType") as string)?.trim() || undefined;
    const isOperating = formData.get("isOperating") === "true" ? true : formData.get("isOperating") === "false" ? false : undefined;

    const updated = await updateBankAccount(schemeId, bankAccountId, {
      bankName: bankName ?? null,
      accountName,
      accountType,
      isOperating,
    });
    if (!updated) return { error: "Bank account not found." };

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
    await requireRecentMfa();

    const deactivated = await deactivateBankAccount(schemeId, bankAccountId);
    if (!deactivated) return { error: "Bank account not found." };

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
    if (!Array.isArray(data.lines) || data.lines.length === 0)
      return { error: "At least one journal line is required." };
    const entryType = data.entryType || "MANUAL";
    assertOneOf(entryType, MANUAL_ENTRY_TYPES, "entry type");
    if (data.lines.some((l) => !l?.accountCodeId || !l?.fundId)) {
      return { error: "Each journal line needs an account and a fund." };
    }
    // Every account, fund, lot and supplier on the lines must be this scheme's.
    await assertLinksInScheme(schemeId, {
      accountCodeIds: data.lines.map((l) => l.accountCodeId),
      fundIds: data.lines.map((l) => l.fundId),
      lotIds: data.lines.map((l) => l.lotId),
      supplierIds: data.lines.map((l) => l.supplierId),
      allowPlatformSupplier: true,
    });
    // Only the line fields a journal line has: nothing else from the browser.
    const lines: JournalLineInput[] = data.lines.map((l) => ({
      accountCodeId: l.accountCodeId,
      fundId: l.fundId,
      debit: l.debit,
      credit: l.credit,
      description: l.description,
      lotId: l.lotId,
      supplierId: l.supplierId,
      gstAmount: l.gstAmount,
    }));

    const entryNumber = await getNextEntryNumber(schemeId);

    const entry = await createJournalEntry({
      schemeId,
      entryNumber,
      transactionDate: data.transactionDate,
      description: data.description.trim(),
      entryType,
      // A manual journal is always recorded as manual, whatever the browser says.
      sourceType: "MANUAL",
      createdBy: profile.id,
      lines,
    });

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "JOURNAL_ENTRY_CREATED",
      entityType: "JournalEntry",
      entityId: entry.id,
      metadata: { entryNumber, entryType },
    });

    revalidatePath(financePath(schemeId));
    return { success: true, data: { id: entry.id, entryNumber } };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    if (isRedirectError(err)) throw err;
    return { error: unexpectedError(err, "Failed to create journal entry.", LEDGER_RULE_MESSAGES) };
  }
}

export async function postJournalEntryAction(
  schemeId: string,
  entryId: string,
): Promise<ActionState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);

    // The entry must be this scheme's (SEC-004).
    const entry = await db.orm.public.JournalEntry
      .where((je) => and(je.id.eq(entryId), je.schemeId.eq(schemeId)))
      .first();
    if (!entry) return { error: "Journal entry not found." };

    await postJournalEntry(entry.id, profile.id);

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
    return { error: unexpectedError(err, "Failed to post journal entry.", LEDGER_RULE_MESSAGES) };
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

    // The reversal is dated today in the building's time zone (see reverseJournalEntry).
    await validatePeriodForPosting(schemeId, await schemeToday(schemeId), "REVERSAL");
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
    return { error: unexpectedError(err, "Failed to reverse journal entry.", LEDGER_RULE_MESSAGES) };
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
    if (err instanceof LevyReceiptError) return { error: err.message, data: err.data };
    return { error: unexpectedError(err, "Failed to reverse the receipt.", LEDGER_RULE_MESSAGES) };
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
    return { error: unexpectedError(err, "Failed to move the receipt.", LEDGER_RULE_MESSAGES) };
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
    const fund = await db.orm.public.Fund.where((f) => and(f.id.eq(fundId), f.schemeId.eq(schemeId))).first();
    if (!fund) return { fieldErrors: { fundId: "Choose a fund of this scheme." } };

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

    const today = await schemeToday(schemeId);
    // Levies are paid in advance: a budget levy instalment falls due on the
    // first day of the period it covers. A special levy has its own date.
    const periodStart = isSpecial
      ? toIsoDay(schedule.approvedAt) || toIsoDay(schedule.dueDate)
      : financialYearStart(Number(schedule.financialYear), String(scheme.financialYearEnd));
    const firstDueDate = isSpecial ? toIsoDay(schedule.dueDate) : periodStart;
    if (!ISO_DATE.test(firstDueDate)) return { error: "This special levy has no due date." };
    // Instalments the previous manager raised before the takeover are not raised again.
    const raisedBefore = new Set(String(schedule.raisedBeforeTakeover ?? "").split(",").map((x) => Number(x.trim())).filter((x) => x > 0));
    const plan = planNotices({
      lots,
      totalCents,
      frequency: (isSpecial ? "ONE_OFF" : schedule.frequency) as LevyFrequency,
      periodStart,
      firstDueDate,
    }).filter((n) => !raisedBefore.has(n.instalment));
    // Periods already levied by an earlier schedule for this fund and year
    // (one whose planned notices were stopped) are not levied again, and
    // instalments the previous manager raised stay excluded.
    if (!isSpecial) {
      const sameYear = await db.orm.public.LevySchedule
        .where((x) => and(x.schemeId.eq(schemeId), x.fundId.eq(schedule.fundId), x.financialYear.eq(Number(schedule.financialYear)), x.levyType.eq("ORDINARY")))
        .limit(50)
        .all();
      if (sameYear.some((x) => x.id !== scheduleId && x.status === "ACTIVE")) {
        return { error: "This fund already has an active levy schedule for this year. Stop its planned notices first." };
      }
      const earlier = sameYear.filter((x) => x.id !== scheduleId && x.status === "SUPERSEDED");
      const earlierRaised = new Set(earlier.flatMap((x) => String(x.raisedBeforeTakeover ?? "").split(",").map((v) => Number(v.trim())).filter((v) => v > 0)));
      const issued = earlier.length
        ? await db.orm.public.LevyNotice.where((n) => and(n.levyScheduleId.in(earlier.map((x) => x.id)), n.status.neq("DRAFT"))).limit(20000).all()
        : [];
      const periods = [...new Map(issued.map((n) => [`${toIsoDay(n.periodStart)}|${toIsoDay(n.periodEnd)}`, { start: toIsoDay(n.periodStart), end: toIsoDay(n.periodEnd) }])).values()];
      const kept = [];
      for (const n of plan) {
        const overlaps = periods.filter((p) => p.start <= n.periodEnd && n.periodStart <= p.end);
        if (!overlaps.length) {
          // The previous manager's instalments, when the frequency is the same.
          if (earlierRaised.has(n.instalment) && earlier.some((x) => x.frequency === schedule.frequency && x.raisedBeforeTakeover)) continue;
          kept.push(n);
          continue;
        }
        // Already levied for exactly this period: skip it. Overlapping differently (another frequency): refuse.
        if (overlaps.some((p) => p.start === n.periodStart && p.end === n.periodEnd)) continue;
        return { error: "An earlier schedule for this fund and year levied periods that overlap these instalments differently. Use the same frequency as the earlier schedule." };
      }
      plan.splice(0, plan.length, ...kept);
    }
    if (plan.length === 0) return { error: "Every instalment of this schedule has already been raised (by the previous manager, or on an earlier schedule), so there is nothing to plan." };

    // When each notice goes out: 5 weeks before it falls due. A special levy
    // is resolved for one date and goes out now.
    const { rules: schemeRules } = await rulesForScheme(schemeId);
    const levyRule = schemeRules.NOTICE_RULES;
    // The shorter notice for an urgent special levy, only where the building's pack has one.
    const urgentSpecialLevy = isSpecial && formData.get("urgentSpecialLevy") === "on";
    const urgentProblem = urgentSpecialLevy ? urgentNoticeProblem(levyRule, schemeRules.TERMINOLOGY) : null;
    if (urgentProblem) return { error: urgentProblem };
    const timed = plan.map((n) => ({ n, t: isSpecial ? ({ kind: "planned", issueOn: today, dueDate: n.dueDate } as IssueTiming) : issueTiming(n.dueDate, today, levyRule) }));
    const late = [...new Map(timed.filter((x) => x.t.kind !== "planned").map((x) => [x.n.instalment, lateMessage(x.t, `Instalment ${x.n.instalment}`, levyRule)!])).values()];
    if (late.length && formData.get("confirmLate") !== "on") {
      return { error: `Some instalments cannot be given ${noticeLeadText(levyRule)}' notice. Check them below and confirm to go ahead.`, data: { late } };
    }

    const first = await getNextNoticeNumber(schemeId);
    let seq = parseInt(first.replace(/\D/g, ""), 10) || 1;
    const numbered = timed.map(({ n, t }) => ({ ...n, dueDate: t.dueDate, issueOn: t.issueOn, noticeNumber: `LN-${String(seq++).padStart(4, "0")}` }));
    const goesNow = (x: { issueOn: string }) => x.issueOn <= today;

    // Every notice must carry what a NSW levy notice states, checked now for
    // all of them: those going out today, and those going out later.
    const toContent = (list: typeof numbered) =>
      list.map((n) => ({ lotId: n.lotId, lotNumber: n.lotNumber, ownerId: n.ownerId, noticeNumber: n.noticeNumber, dueDate: n.dueDate, amountCents: n.amountCents }));
    const now = numbered.filter(goesNow);
    const later = numbered.filter((n) => !goesNow(n));
    const missing = [
      ...(now.length ? await checkPlannedNotices({ schemeId, fundId: schedule.fundId, issuerId: profile.id, noticeDate: today, isUrgentSpecialLevy: urgentSpecialLevy, notices: toContent(now) }) : []),
      ...(later.length
        ? await checkPlannedNotices({ schemeId, fundId: schedule.fundId, issuerId: profile.id, noticeDate: later.map((n) => n.issueOn).sort()[0], notices: toContent(later) })
        : []),
    ].filter((m, i, all) => all.findIndex((x) => x.code === m.code && x.message === m.message) === i);
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
      { activateScheduleId: scheduleId },
    );

    const issueNow = created
      .map((c, i) => ({ c, n: numbered[i] }))
      .filter((x) => goesNow(x.n))
      .map(({ c, n }) => ({ id: c.id, noticeNumber: n.noticeNumber, lotId: n.lotId, lotNumber: n.lotNumber, ownerId: n.ownerId, dueDate: n.dueDate, amountCents: n.amountCents }));
    const result = await issueNoticeBatch({ schemeId, scheduleId, fundId: schedule.fundId, issuerId: profile.id, noticeDate: today, notices: issueNow, isUrgentSpecialLevy: urgentSpecialLevy });
    const nextIssueOn = later.map((n) => n.issueOn).sort()[0] ?? null;
    if (later.length) {
      await logActivity({
        schemeId,
        actorId: profile.id,
        action: "LEVY_NOTICES_PLANNED",
        entityType: "LevySchedule",
        entityId: scheduleId,
        metadata: { count: later.length, issueDates: [...new Set(later.map((n) => n.issueOn))].sort(), late },
      });
    }

    revalidatePath(financePath(schemeId, "/levies"));
    revalidatePath(financePath(schemeId, `/levies/${scheduleId}`));
    return {
      success: true,
      data: { count: result.count, planned: later.length, nextIssueOn, emailed: result.emailed, creditApplied: fromCents(result.creditAppliedCents) },
    };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    // A closed or locked period: the levy could not be posted, so the notices stay planned.
    if (err instanceof Error && /^(Cannot post to a closed period|This period is locked)/.test(err.message)) {
      return { error: `${err.message} The notices were not sent; they stay planned.` };
    }
    if (err instanceof UnsupportedJurisdictionError) return { error: err.message };
    return { error: "Failed to issue levy notices." };
  }
}

/**
 * Send the planned notices whose 5-week mark has passed (they were held, or
 * the daily job did not run), once the Adviser confirms (25 Oct 2026). Those
 * with fewer than 30 days left fall due 30 days from today instead.
 */
export async function issueOverdueNoticesAction(
  schemeId: string,
  scheduleId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);
    const schedule = await loadScheduleForScheme(schemeId, scheduleId);
    if (!schedule) return { error: "Levy schedule not found." };
    if (schedule.status !== "ACTIVE") return { error: "Only an active schedule's planned notices can be sent." };
    const today = await schemeToday(schemeId);
    const list = await overdueDrafts(schemeId, scheduleId, today);
    const levyRule = (await rulesForScheme(schemeId)).rules.NOTICE_RULES;
    if (!list.length) return { error: `No planned notice is past its ${noticeLeadMark(levyRule)}.` };
    const late = [...new Set(list.map(({ n, t }) => lateMessage(t, `Notices due ${toIsoDay(n.dueDate).split("-").reverse().join("/")}`, levyRule)!))];
    if (formData.get("confirmLate") !== "on") {
      return { error: `Confirm that these notices go out today with less than ${noticeLeadText(levyRule)}' notice.`, data: { late } };
    }
    const r = await issueOverdueDrafts({ schemeId, scheduleId, fundId: schedule.fundId, issuerId: profile.id, today });
    if (r.missing.length) {
      return { error: "The notices cannot be issued yet. Fix the items listed and try again.", data: { missing: r.missing.map((message) => ({ code: message, message })) } };
    }
    revalidatePath(financePath(schemeId, "/levies"));
    revalidatePath(financePath(schemeId, `/levies/${scheduleId}`));
    return { success: true, data: { count: r.count, emailed: r.emailed } };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    // A closed or locked period: the levy could not be posted, so the notices stay planned.
    if (err instanceof Error && /^(Cannot post to a closed period|This period is locked)/.test(err.message)) {
      return { error: `${err.message} The notices were not sent; they stay planned.` };
    }
    if (err instanceof UnsupportedJurisdictionError) return { error: err.message };
    return { error: "Failed to send the notices." };
  }
}

/**
 * Stop a schedule's planned notices (25 Oct 2026), for example when the
 * budget is revised: notices not yet sent are removed (they were never
 * issued, so nothing is owed or posted) and the schedule is superseded.
 * Notices already issued stay as they are.
 */
export async function stopPlannedNoticesAction(schemeId: string, scheduleId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);
    await requireRecentMfa();
    const schedule = await loadScheduleForScheme(schemeId, scheduleId);
    if (!schedule) return { error: "Levy schedule not found." };
    if (schedule.status !== "ACTIVE") return { error: "Only an active schedule's planned notices can be stopped." };
    if (formData.get("confirmStop") !== "on") return { error: "Confirm that the planned notices are to be stopped." };
    const drafts = await db.orm.public.LevyNotice
      .where((n) => and(n.schemeId.eq(schemeId), n.levyScheduleId.eq(scheduleId), n.status.eq("DRAFT")))
      .limit(5000)
      .all();
    const removed = drafts.length
      ? await db.orm.public.LevyNotice.where((n) => and(n.schemeId.eq(schemeId), n.levyScheduleId.eq(scheduleId), n.status.eq("DRAFT"))).deleteAndCount()
      : 0;
    await db.orm.public.LevySchedule.where((s) => and(s.id.eq(scheduleId), s.schemeId.eq(schemeId))).update({ status: "SUPERSEDED" });
    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "LEVY_NOTICES_STOPPED",
      entityType: "LevySchedule",
      entityId: scheduleId,
      metadata: { removed, noticeNumbers: drafts.map((d) => String(d.noticeNumber)) },
    });
    revalidatePath(financePath(schemeId, "/levies"));
    revalidatePath(financePath(schemeId, `/levies/${scheduleId}`));
    return { success: true, data: { removed } };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to stop the planned notices." };
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
  // recordLevyPaymentAction authorises the caller and checks the notice
  // belongs to the scheme; nothing is read here until it has.
  const result = await recordLevyPaymentAction(
    schemeId,
    levyNoticeId,
    amount,
    paymentDate,
    confirmedCentsFrom(formData),
    formData.get("confirmOverpayment") === "on",
  );
  if (result.success) {
    const notice = await db.orm.public.LevyNotice
      .where((ln) => and(ln.id.eq(levyNoticeId), ln.schemeId.eq(schemeId)))
      .first();
    if (notice) revalidatePath(financePath(schemeId, `/levies/${notice.levyScheduleId}`));
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
    return { error: unexpectedError(err, "Failed to record payment.", LEDGER_RULE_MESSAGES) };
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
    // A due date before the invoice date is a typing error (review B13).
    if (data.dueDate.slice(0, 10) < data.invoiceDate.slice(0, 10)) return { error: "The due date must be on or after the invoice date." };
    // The supplier, account and fund must be this scheme's.
    await assertLinksInScheme(schemeId, {
      supplierIds: [data.supplierId],
      accountCodeIds: [data.accountCodeId],
      fundIds: [data.fundId],
    });
    // The account must belong to the invoice's fund, or approval could not post (review B1).
    const fundProblem = await accountFundProblem(db.orm, schemeId, data.accountCodeId, data.fundId);
    if (fundProblem) return { error: fundProblem };

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
        logError("Invoice review record failed:", reviewErr);
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
    // A sensitive operation: needs an authenticator check in the last 15 minutes.
    await requireRecentMfa();
    const ip = (await headers()).get("x-forwarded-for");
    const outcome = await authoriseSupplierInvoice({ schemeId, invoiceId, actorId: profile.id, ip });
    if (outcome.complete) await afterFinanceChange(invoiceId, ["APPROVED"]);
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
    logError("approveInvoiceAction error:", err);
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
    // A sensitive operation: needs an authenticator check in the last 15 minutes.
    await requireRecentMfa();

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
    const latestBank = await getLatestBankDetailVersion(invoice.supplierId);
    // A marketplace contractor is paid only to bank details they gave and the building verified.
    if (!latestBank && (await contractorOfSupplier(invoice.supplierId))) {
      return { error: "The contractor has not given bank details yet. Ask them to add them in StrataVerze, then verify them before paying." };
    }
    const bank = checkBankDetailsForPayment(latestBank, new Date().toISOString(), settings.coolingOffDays, await schemeTimeZone(schemeId));
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
    await afterFinanceChange(invoiceId, ["PARTIALLY_PAID", "PAID"]);

    revalidatePath(financePath(schemeId));
    return { success: true };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    if (err instanceof PaymentControlError) return { error: err.message };
    return { error: unexpectedError(err, "Failed to record payment.", LEDGER_RULE_MESSAGES) };
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

    // A works contractor's invoice can be cancelled only before it is
    // approved: after that it is posted to the ledger, and cancelling it
    // would let a fresh invoice go past the work order's amount.
    if (target.worksInvoiceId && !["DRAFT", "AWAITING_APPROVAL"].includes(String(target.status))) {
      return { error: "This invoice came from a works order and has been approved, so it cannot be cancelled here. Reverse the journal and contact StrataVerze if it must be undone." };
    }

    await cancelInvoice(invoiceId);
    await afterFinanceChange(invoiceId, ["CANCELLED"]);

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
    /** From prepareUploadAction: the file is already in storage (S3). */
    uploadId: string;
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
    // Only the adviser documents page uploads through this action. Owners
    // upload payment confirmations through their own portal.
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);

    if (typeof data?.uploadId !== "string" || !data.uploadId) return { error: "Choose a file to upload." };
    if (!data.documentType) return { error: "Document type is required." };
    assertOneOf(data.documentType, UPLOAD_DOCUMENT_TYPES, "document type");
    if (data.amount !== undefined && (typeof data.amount !== "number" || !Number.isFinite(data.amount))) {
      return { error: "Enter a valid amount." };
    }
    if (data.documentDate !== undefined && !(typeof data.documentDate === "string" && ISO_DATE.test(data.documentDate))) {
      return { error: "Enter a valid document date." };
    }
    for (const text of [data.payerName, data.payeeReference]) {
      if (text !== undefined && (typeof text !== "string" || text.length > 200)) return { error: "Payer details are too long." };
    }

    // What actually arrived in storage, checked: its size, and that its
    // contents match its type (S3). Nothing the browser claims is used.
    let upload;
    try {
      upload = await verifyUpload({ uploadId: data.uploadId, schemeId, purpose: "finance_document", profileId: profile.id });
    } catch (err) {
      const message = uploadErrorMessage(err);
      if (message) return { error: message };
      throw err;
    }

    // Duplicate detection for documents
    const docDuplicates = await checkDocumentDuplicates(
      schemeId,
      upload.fileName,
      upload.size,
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

    // Every record the document is linked to must be this scheme's.
    await assertLinksInScheme(schemeId, { lotIds: [data.lotId], supplierIds: [data.supplierId] });
    const invoiceId = idList([data.supplierInvoiceId], "Invoice")[0];
    if (invoiceId) {
      const invoice = await db.orm.public.SupplierInvoice.where((i) => and(i.id.eq(invoiceId), i.schemeId.eq(schemeId))).first();
      if (!invoice) return { error: "Invoice not found." };
    }
    const noticeId = idList([data.levyNoticeId], "Levy notice")[0];
    if (noticeId) {
      const notice = await db.orm.public.LevyNotice.where((n) => and(n.id.eq(noticeId), n.schemeId.eq(schemeId))).first();
      if (!notice) return { error: "Levy notice not found." };
    }
    const transactionId = idList([data.bankTransactionId], "Bank transaction")[0];
    if (transactionId && !(await schemeTransaction(schemeId, transactionId))) {
      return { error: "Bank transaction not found." };
    }

    // Only the known fields, with the authorised scheme and uploader.
    // Claimed atomically, so the same upload cannot make two records (S3).
    const doc = await consumeUpload(
      data.uploadId,
      () =>
        createFinancialDocument({
        documentType: data.documentType,
        fileName: upload.fileName,
        fileUrl: upload.path,
        fileSize: upload.size,
        mimeType: upload.mimeType,
        lotId: data.lotId || undefined,
        supplierId: data.supplierId || undefined,
        supplierInvoiceId: invoiceId,
        levyNoticeId: noticeId,
        bankTransactionId: transactionId,
        amount: data.amount,
        documentDate: data.documentDate,
        payerName: data.payerName,
        payeeReference: data.payeeReference,
        schemeId,
        uploadedBy: profile.id,
      }),
      (d) => `FinancialDocument:${d.id}`,
    );

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "FINANCIAL_DOCUMENT_UPLOADED",
      entityType: "FinancialDocument",
      entityId: doc.id,
      metadata: {
        documentType: data.documentType,
        fileName: upload.fileName,
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
    assertOneOf(data?.documentStatus, DOCUMENT_STATUSES, "document status");
    if (data.reviewNotes !== undefined && typeof data.reviewNotes !== "string") return { error: "Invalid review notes." };

    const reviewed = await reviewDocument(schemeId, documentId, {
      documentStatus: data.documentStatus,
      reviewedBy: profile.id,
      reviewNotes: data.reviewNotes,
    });
    if (!reviewed) return { error: "Document not found." };

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
    assertOneOf(status, VERIFICATION_STATUSES, "verification status");

    const updated = await updateVerificationStatus(schemeId, documentId, status);
    if (!updated) return { error: "Document not found." };

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
    return { error: unexpectedError(err, "Failed to generate financial periods.") };
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

    const closed = await closePeriod(schemeId, periodId, profile.id);
    if (!closed) return { error: "Only an open period can be closed." };

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
    const period = await db.orm.public.FinancialPeriod
      .where((p) => and(p.id.eq(periodId), p.schemeId.eq(schemeId)))
      .first();
    if (!period) return { error: "Financial period not found." };
    if (period.status !== "CLOSED") return { error: "Only a closed period can be locked." };

    const locked = await lockPeriod(schemeId, period.id);
    if (!locked) return { error: "Only a closed period can be locked." };

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
    // A sensitive operation: needs an authenticator check in the last 15 minutes.
    await requireRecentMfa();
    const period = await db.orm.public.FinancialPeriod
      .where((p) => and(p.id.eq(periodId), p.schemeId.eq(schemeId)))
      .first();
    if (!period) return { error: "Financial period not found." };
    // A locked period stays locked (TC-010): only a closed one can be reopened.
    if (period.status !== "CLOSED") return { error: "Only a closed period can be reopened." };

    const reopened = await reopenPeriod(schemeId, period.id);
    if (!reopened) return { error: "Only a closed period can be reopened." };

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
    return { error: unexpectedError(err, "Failed to charge interest.", [...INTEREST_RULE_MESSAGES, ...LEDGER_RULE_MESSAGES]) };
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
    return { error: unexpectedError(err, "Failed to charge interest.", [...INTEREST_RULE_MESSAGES, ...LEDGER_RULE_MESSAGES]) };
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

    if (!Array.isArray(data.lines) || data.lines.length < 2) {
      return { error: "At least two journal lines are required for a balanced entry." };
    }
    if (data.lines.some((l) => !l?.accountCodeId || !l?.fundId)) {
      return { error: "Each journal line needs an account and a fund." };
    }
    // Every account and fund on the lines must be this scheme's.
    await assertLinksInScheme(schemeId, {
      accountCodeIds: data.lines.map((l) => l.accountCodeId),
      fundIds: data.lines.map((l) => l.fundId),
    });
    // Only the fields an adjustment line has: nothing else from the browser.
    const lines = data.lines.map((l) => ({
      accountCodeId: l.accountCodeId,
      fundId: l.fundId,
      debit: l.debit,
      credit: l.credit,
      description: l.description,
    }));

    const entryNumber = await getNextEntryNumber(schemeId);

    const entry = await createJournalEntry({
      schemeId,
      entryNumber,
      transactionDate: data.transactionDate,
      description: data.description.trim(),
      entryType: "ADJUSTMENT",
      sourceType: "ADJUSTMENT",
      createdBy: profile.id,
      lines,
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
    return { error: unexpectedError(err, "Failed to create adjustment entry.", LEDGER_RULE_MESSAGES) };
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

    if (typeof data?.name !== "string" || !data.name.trim()) {
      return { error: "Rule name is required." };
    }

    if (!data.matchType) {
      return { error: "Match type is required." };
    }
    assertOneOf(data.matchType, MATCH_TYPES, "match type");
    if (data.transactionSign !== undefined && data.transactionSign !== null) {
      assertOneOf(data.transactionSign, TRANSACTION_SIGNS, "transaction sign");
    }
    // The rule posts to these: they must be this scheme's.
    await assertLinksInScheme(schemeId, {
      accountCodeIds: [data.targetAccountCodeId],
      fundIds: [data.targetFundId],
    });
    // The rule posts the account against the fund: they must match (review B1).
    if (data.targetAccountCodeId && data.targetFundId) {
      const fundProblem = await accountFundProblem(db.orm, schemeId, data.targetAccountCodeId, data.targetFundId);
      if (fundProblem) return { error: fundProblem };
    }

    // Build the rule from the known fields only, with the authorised scheme
    // last, so nothing the browser sends can set another scheme (SEC-004).
    const rule = await createMatchingRule({
      name: data.name,
      description: data.description,
      matchType: data.matchType,
      descriptionPattern: data.descriptionPattern,
      referencePattern: data.referencePattern,
      exactAmount: data.exactAmount,
      minAmount: data.minAmount,
      maxAmount: data.maxAmount,
      transactionSign: data.transactionSign,
      targetAccountCodeId: data.targetAccountCodeId,
      targetFundId: data.targetFundId,
      autoPost: data.autoPost === true,
      priority: data.priority,
      schemeId,
    });

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
    if (data.matchType !== undefined) assertOneOf(data.matchType, MATCH_TYPES, "match type");
    if (data.transactionSign !== undefined && data.transactionSign !== null) {
      assertOneOf(data.transactionSign, TRANSACTION_SIGNS, "transaction sign");
    }
    await assertLinksInScheme(schemeId, {
      accountCodeIds: [data.targetAccountCodeId],
      fundIds: [data.targetFundId],
    });
    // The rule posts the account against the fund: they must match (review B1).
    if (data.targetAccountCodeId && data.targetFundId) {
      const fundProblem = await accountFundProblem(db.orm, schemeId, data.targetAccountCodeId, data.targetFundId);
      if (fundProblem) return { error: fundProblem };
    }

    const updated = await updateMatchingRule(schemeId, ruleId, {
      name: data.name,
      description: data.description,
      matchType: data.matchType,
      descriptionPattern: data.descriptionPattern,
      referencePattern: data.referencePattern,
      exactAmount: data.exactAmount,
      minAmount: data.minAmount,
      maxAmount: data.maxAmount,
      transactionSign: data.transactionSign,
      targetAccountCodeId: data.targetAccountCodeId,
      targetFundId: data.targetFundId,
      autoPost: data.autoPost,
      priority: data.priority,
      isActive: data.isActive,
    });
    if (!updated) return { error: "Matching rule not found." };

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

    const deleted = await deleteMatchingRule(schemeId, ruleId);
    if (!deleted) return { error: "Matching rule not found." };

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
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);
    // A sensitive operation: needs an authenticator check in the last 15 minutes.
    await requireRecentMfa();

    const rows = await getAuditTrailForExport(schemeId, filters);
    await recordSecurityEvent({
      action: "export.csv",
      outcome: "allowed",
      actorProfileId: profile.id,
      actorRole: "ADVISER",
      schemeId,
      resourceType: "Scheme",
      resourceId: schemeId,
      metadata: { kind: "finance_audit_trail", rows: rows.length },
    });
    const csv = formatAuditTrailCsv(rows, await schemeTimeZone(schemeId));

    const datePart = await schemeToday(schemeId);
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
    logError("Invoice extraction error:", err);
    return {
      // Database and library messages stay in the server log (S7, SEC-025).
      error: "Failed to extract data from the PDF.",
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
    const { rules } = await rulesForScheme(schemeId);
    const problem = interestSettingProblem({ mode, resolutionMeetingId: meetingId, resolutionMotionId: motionId }, needRule(rules, "STATUTORY_INTEREST"));
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
    if (err instanceof UnsupportedJurisdictionError) return { error: err.message };
    return { error: "Failed to save the interest setting." };
  }
}
