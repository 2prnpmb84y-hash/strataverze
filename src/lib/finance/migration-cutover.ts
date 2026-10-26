/**
 * Financial cutover from another system (pure).
 *
 * A cutover brings across, at one date: the opening trial balance, the
 * outstanding levy notices behind levies receivable, the unpaid supplier
 * invoices behind accounts payable, owner credit balances behind levies in
 * advance, and each bank account's last reconciled balance and date.
 *
 * The opening trial balance carries every ledger balance. The other files
 * are the detail behind the control accounts, so they create records (notices,
 * invoices, credits) but never post to the ledger again.
 *
 * Gates, in order:
 *  1. Every file parses with no row errors.
 *  2. The opening trial balance nets to zero.
 *  3. Someone signs off: who, when, the source system, the cutover date, the
 *     SHA-256 of every file, and any differences between a control account
 *     and its detail, which must be acknowledged one by one.
 *  4. Only then can the cutover be executed, and only with the same files.
 */
import { fundGapsCents, isSharedAccount } from "./fund-balance-check";

export type CutoverDataType = "opening_balances" | "levy_arrears" | "unpaid_invoices" | "owner_credits" | "bank_balances";

export const CUTOVER_DATA_TYPES: CutoverDataType[] = ["opening_balances", "levy_arrears", "unpaid_invoices", "owner_credits", "bank_balances"];

export const CUTOVER_LABELS: Record<CutoverDataType, string> = {
  opening_balances: "Opening trial balance",
  levy_arrears: "Outstanding levy notices",
  unpaid_invoices: "Unpaid supplier invoices",
  owner_credits: "Owner credit balances",
  bank_balances: "Bank reconciled balances",
};

/** Only the opening trial balance is required. The rest are needed when their control account is not zero. */
export const REQUIRED_FILES: CutoverDataType[] = ["opening_balances"];

export interface Lookups {
  accounts: Array<{ id: string; code: string; accountType: string; accountSubType: string | null; fundId: string | null }>;
  funds: Array<{ id: string; name: string; fundType: string }>;
  lots: Array<{ id: string; lotNumber: string }>;
  suppliers: Array<{ id: string; companyName: string; abn: string | null }>;
  bankAccounts: Array<{ id: string; accountName: string; bsb: string; accountNumber: string }>;
}

export interface ParsedRow<T> {
  rowNumber: number;
  value: T | null;
  errors: string[];
  warnings: string[];
}

export interface OpeningLine {
  accountId: string;
  accountCode: string;
  accountType: string;
  accountSubType: string | null;
  fundId: string;
  debitCents: number;
  creditCents: number;
  description: string | null;
}

export interface ArrearsNotice {
  lotId: string;
  lotNumber: string;
  fundId: string;
  noticeNumber: string | null;
  dueDate: string;
  periodStart: string | null;
  periodEnd: string | null;
  levyOutstandingCents: number;
  /** Total interest the old system charged on this notice to the cutover date. */
  interestChargedCents: number;
  /** The part of that interest already paid. */
  interestPaidCents: number;
  description: string | null;
}

export interface UnpaidInvoice {
  supplierId: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  totalCents: number;
  gstCents: number;
  paidCents: number;
  accountId: string;
  fundId: string;
  description: string;
}

export interface OwnerCredit {
  lotId: string;
  lotNumber: string;
  fundId: string;
  amountCents: number;
  note: string | null;
}

export interface BankBalance {
  bankAccountId: string;
  accountName: string;
  reconciledDate: string;
  reconciledBalanceCents: number;
}

export interface CutoverRows {
  opening_balances?: ParsedRow<OpeningLine>[];
  levy_arrears?: ParsedRow<ArrearsNotice>[];
  unpaid_invoices?: ParsedRow<UnpaidInvoice>[];
  owner_credits?: ParsedRow<OwnerCredit>[];
  bank_balances?: ParsedRow<BankBalance>[];
}

// ─── Field parsing ──────────────────────────────────────────────────────────

const norm = (s: string | undefined | null) => (s ?? "").trim().replace(/\s+/g, " ").toLowerCase();
const digits = (s: string | undefined | null) => (s ?? "").replace(/\D/g, "");

/** Australian or ISO date to ISO, or null. */
export function cutoverDate(value: string | undefined): string | null {
  const v = (value ?? "").trim();
  let y: number, m: number, d: number;
  let match = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else if ((match = v.match(/^(\d{4})-(\d{2})-(\d{2})$/))) [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Money to cents. Accepts "$1,234.50", "1234.5", "(12.00)" and "-12.00" for
 * negatives, and a trailing "CR" or "DR" (credit is negative). Null when it
 * is not a number. Blank is zero.
 */
export function cutoverCents(value: string | undefined): number | null {
  let v = (value ?? "").trim().toUpperCase();
  if (v === "") return 0;
  let sign = 1;
  if (v.endsWith("CR")) {
    sign = -1;
    v = v.slice(0, -2).trim();
  } else if (v.endsWith("DR")) {
    v = v.slice(0, -2).trim();
  }
  if (/^\(.*\)$/.test(v)) {
    sign = -sign;
    v = v.slice(1, -1);
  }
  v = v.replace(/[$,\s]/g, "");
  if (v.startsWith("-")) {
    sign = -sign;
    v = v.slice(1);
  }
  if (!/^\d+(\.\d{1,2})?$/.test(v)) return null;
  const [whole, frac = ""] = v.split(".");
  return sign * (Number(whole) * 100 + Number(frac.padEnd(2, "0")));
}

function fundFor(lookups: Lookups, name: string | undefined, fallback: string | null): string | null {
  const n = norm(name);
  if (n) {
    const byName = lookups.funds.find((f) => norm(f.name) === n);
    if (byName) return byName.id;
    const byType = lookups.funds.find((f) => {
      const t = norm(f.fundType);
      return t === n || (n.startsWith("admin") && t === "administrative") || ((n.startsWith("capital") || n.startsWith("sinking")) && t === "capital_works");
    });
    if (byType) return byType.id;
    return null;
  }
  return fallback;
}

const adminFund = (lookups: Lookups) => lookups.funds.find((f) => f.fundType === "ADMINISTRATIVE")?.id ?? lookups.funds[0]?.id ?? null;

function money(row: Record<string, string>, field: string, label: string, errors: string[], opts: { allowNegative?: boolean } = {}): number {
  const c = cutoverCents(row[field]);
  if (c === null) {
    errors.push(`${label} "${row[field]}" is not an amount.`);
    return 0;
  }
  if (c < 0 && !opts.allowNegative) {
    errors.push(`${label} cannot be negative.`);
    return 0;
  }
  return c;
}

/** One row of the opening trial balance: an account and a debit or a credit. */
export function parseOpeningRow(row: Record<string, string>, rowNumber: number, lookups: Lookups): ParsedRow<OpeningLine> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const code = (row.accountCode ?? "").trim();
  const account = lookups.accounts.find((a) => a.code.trim() === code);
  if (!code) errors.push("Account code is missing.");
  else if (!account) errors.push(`Account code "${code}" is not in the chart of accounts.`);
  let debit = money(row, "debit", "Debit", errors);
  let credit = money(row, "credit", "Credit", errors);
  // A single signed balance column is accepted too: positive is a debit.
  if (row.balance !== undefined && row.balance.trim() !== "" && debit === 0 && credit === 0) {
    const b = cutoverCents(row.balance);
    if (b === null) errors.push(`Balance "${row.balance}" is not an amount.`);
    else if (b >= 0) debit = b;
    else credit = -b;
  }
  if (debit > 0 && credit > 0) errors.push("A line can have a debit or a credit, not both.");
  if (debit === 0 && credit === 0 && errors.length === 0) warnings.push("Zero balance: the line will be left out.");
  const fundId = account ? fundFor(lookups, row.fundName, account.fundId ?? adminFund(lookups)) : null;
  if (account && !fundId) errors.push(row.fundName ? `Fund "${row.fundName}" is not one of the scheme's funds.` : "No fund for this account.");
  // An account kept for one fund can only carry that fund's balance (review B1).
  if (account && fundId && !isSharedAccount(account) && account.fundId !== fundId) {
    errors.push(`Account ${account.code} belongs to the ${lookups.funds.find((f) => f.id === account.fundId)?.name ?? "other fund"}, so it cannot carry a balance for the ${lookups.funds.find((f) => f.id === fundId)?.name ?? "fund named"}.`);
  }
  if (errors.length) return { rowNumber, value: null, errors, warnings };
  return {
    rowNumber,
    value: {
      accountId: account!.id,
      accountCode: account!.code,
      accountType: account!.accountType,
      accountSubType: account!.accountSubType,
      fundId: fundId!,
      debitCents: debit,
      creditCents: credit,
      description: row.description?.trim() || null,
    },
    errors,
    warnings,
  };
}

/** One outstanding levy notice, with its original due date so interest and ageing carry on correctly. */
export function parseArrearsRow(row: Record<string, string>, rowNumber: number, lookups: Lookups, cutover: string): ParsedRow<ArrearsNotice> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const lotNumber = (row.lotNumber ?? "").trim();
  const lot = lookups.lots.find((l) => l.lotNumber.trim() === lotNumber);
  if (!lotNumber) errors.push("Lot number is missing.");
  else if (!lot) errors.push(`Lot ${lotNumber} is not in this scheme.`);
  const fundId = fundFor(lookups, row.fundName, adminFund(lookups));
  if (!fundId) errors.push(`Fund "${row.fundName}" is not one of the scheme's funds.`);
  const dueDate = cutoverDate(row.dueDate);
  if (!dueDate) errors.push(`Due date "${row.dueDate ?? ""}" is not a date (use DD/MM/YYYY).`);
  else if (dueDate > cutover) warnings.push("Due after the cutover date: it is not yet overdue.");
  const levy = money(row, "levyOutstanding", "Levy outstanding", errors);
  const interestCharged = money(row, "interestCharged", "Interest charged", errors);
  const interestPaid = money(row, "interestPaid", "Interest paid", errors);
  if (interestPaid > interestCharged) errors.push("Interest paid is more than the interest charged.");
  if (levy === 0 && interestCharged - interestPaid === 0 && errors.length === 0) errors.push("Nothing is outstanding on this notice.");
  const periodStart = row.periodStart ? cutoverDate(row.periodStart) : null;
  const periodEnd = row.periodEnd ? cutoverDate(row.periodEnd) : null;
  if (row.periodStart && !periodStart) errors.push(`Period start "${row.periodStart}" is not a date.`);
  if (row.periodEnd && !periodEnd) errors.push(`Period end "${row.periodEnd}" is not a date.`);
  if (errors.length) return { rowNumber, value: null, errors, warnings };
  return {
    rowNumber,
    value: {
      lotId: lot!.id,
      lotNumber: lot!.lotNumber,
      fundId: fundId!,
      noticeNumber: row.noticeNumber?.trim() || null,
      dueDate: dueDate!,
      periodStart,
      periodEnd,
      levyOutstandingCents: levy,
      interestChargedCents: interestCharged,
      interestPaidCents: interestPaid,
      description: row.description?.trim() || null,
    },
    errors,
    warnings,
  };
}

/** One unpaid supplier invoice. The supplier must already be set up, matched by ABN or name. */
export function parseInvoiceRow(row: Record<string, string>, rowNumber: number, lookups: Lookups): ParsedRow<UnpaidInvoice> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const abn = digits(row.supplierAbn);
  const supplier =
    (abn.length === 11 ? lookups.suppliers.find((s) => digits(s.abn) === abn) : undefined) ??
    lookups.suppliers.find((s) => norm(s.companyName) === norm(row.supplierName));
  if (!supplier) errors.push(`Supplier "${row.supplierName || row.supplierAbn || ""}" is not set up. Add the supplier first.`);
  const invoiceNumber = (row.invoiceNumber ?? "").trim();
  if (!invoiceNumber) errors.push("Invoice number is missing.");
  const invoiceDate = cutoverDate(row.invoiceDate);
  const dueDate = cutoverDate(row.dueDate) ?? invoiceDate;
  if (!invoiceDate) errors.push(`Invoice date "${row.invoiceDate ?? ""}" is not a date.`);
  const total = money(row, "totalAmount", "Total", errors);
  const gst = money(row, "gstAmount", "GST", errors);
  const paid = money(row, "amountPaid", "Amount paid", errors);
  if (total === 0 && errors.length === 0) errors.push("Total is zero.");
  if (gst > total) errors.push("GST is more than the total.");
  if (paid >= total && total > 0) errors.push("The invoice is fully paid: leave it out.");
  const code = (row.accountCode ?? "").trim();
  const account = lookups.accounts.find((a) => a.code.trim() === code);
  if (!code) errors.push("Expense account code is missing.");
  else if (!account) errors.push(`Account code "${code}" is not in the chart of accounts.`);
  else if (account.accountType !== "EXPENSE") errors.push(`Account ${code} is not an expense account.`);
  const fundId = account ? fundFor(lookups, row.fundName, account.fundId ?? adminFund(lookups)) : null;
  if (account && !fundId) errors.push(`Fund "${row.fundName}" is not one of the scheme's funds.`);
  if (errors.length) return { rowNumber, value: null, errors, warnings };
  return {
    rowNumber,
    value: {
      supplierId: supplier!.id,
      invoiceNumber,
      invoiceDate: invoiceDate!,
      dueDate: dueDate!,
      totalCents: total,
      gstCents: gst,
      paidCents: paid,
      accountId: account!.id,
      fundId: fundId!,
      description: row.description?.trim() || `Invoice ${invoiceNumber} brought forward`,
    },
    errors,
    warnings,
  };
}

/** One lot's credit (levies paid in advance) in a fund. */
export function parseCreditRow(row: Record<string, string>, rowNumber: number, lookups: Lookups): ParsedRow<OwnerCredit> {
  const errors: string[] = [];
  const lotNumber = (row.lotNumber ?? "").trim();
  const lot = lookups.lots.find((l) => l.lotNumber.trim() === lotNumber);
  if (!lotNumber) errors.push("Lot number is missing.");
  else if (!lot) errors.push(`Lot ${lotNumber} is not in this scheme.`);
  const fundId = fundFor(lookups, row.fundName, adminFund(lookups));
  if (!fundId) errors.push(`Fund "${row.fundName}" is not one of the scheme's funds.`);
  // A credit may arrive as a negative balance ("-120.00" or "120.00 CR"): take its size.
  const raw = cutoverCents(row.creditAmount);
  if (raw === null) errors.push(`Credit "${row.creditAmount}" is not an amount.`);
  const amount = Math.abs(raw ?? 0);
  if (raw !== null && amount === 0) errors.push("Credit is zero.");
  if (errors.length) return { rowNumber, value: null, errors, warnings: [] };
  return { rowNumber, value: { lotId: lot!.id, lotNumber: lot!.lotNumber, fundId: fundId!, amountCents: amount, note: row.note?.trim() || null }, errors, warnings: [] };
}

/** One bank account's last reconciled balance and date. Matched by BSB and account number, else by name. */
export function parseBankRow(row: Record<string, string>, rowNumber: number, lookups: Lookups): ParsedRow<BankBalance> {
  const errors: string[] = [];
  const bsb = digits(row.bsb);
  const number = digits(row.accountNumber);
  const account =
    (bsb && number ? lookups.bankAccounts.find((a) => digits(a.bsb) === bsb && digits(a.accountNumber) === number) : undefined) ??
    lookups.bankAccounts.find((a) => norm(a.accountName) === norm(row.accountName));
  if (!account) errors.push(`Bank account "${row.accountName || `${row.bsb} ${row.accountNumber}`}" is not set up for this scheme.`);
  const date = cutoverDate(row.reconciledDate);
  if (!date) errors.push(`Reconciled date "${row.reconciledDate ?? ""}" is not a date.`);
  const balance = cutoverCents(row.reconciledBalance);
  if (balance === null) errors.push(`Balance "${row.reconciledBalance}" is not an amount.`);
  if (errors.length) return { rowNumber, value: null, errors, warnings: [] };
  return { rowNumber, value: { bankAccountId: account!.id, accountName: account!.accountName, reconciledDate: date!, reconciledBalanceCents: balance! }, errors, warnings: [] };
}

/** Duplicates within a file that would create the same record twice. */
export function duplicateProblems(rows: CutoverRows): Array<{ dataType: CutoverDataType; rowNumber: number; message: string }> {
  const out: Array<{ dataType: CutoverDataType; rowNumber: number; message: string }> = [];
  const check = <T>(dataType: CutoverDataType, list: ParsedRow<T>[] | undefined, key: (v: T) => string | null, what: (v: T) => string) => {
    const seen = new Map<string, number>();
    for (const r of list ?? []) {
      if (!r.value) continue;
      const k = key(r.value);
      if (!k) continue;
      const first = seen.get(k);
      if (first !== undefined) out.push({ dataType, rowNumber: r.rowNumber, message: `${what(r.value)} is also on row ${first}.` });
      else seen.set(k, r.rowNumber);
    }
  };
  check("unpaid_invoices", rows.unpaid_invoices, (v) => `${v.supplierId}:${v.invoiceNumber.toLowerCase()}`, (v) => `Invoice ${v.invoiceNumber}`);
  check("owner_credits", rows.owner_credits, (v) => `${v.lotId}:${v.fundId}`, (v) => `A credit for lot ${v.lotNumber} in this fund`);
  check("bank_balances", rows.bank_balances, (v) => v.bankAccountId, (v) => `Bank account ${v.accountName}`);
  check("levy_arrears", rows.levy_arrears, (v) => (v.noticeNumber ? v.noticeNumber.toLowerCase() : null), (v) => `Notice ${v.noticeNumber}`);
  return out;
}

// ─── Checks ─────────────────────────────────────────────────────────────────

export interface TrialBalanceCheck {
  debitCents: number;
  creditCents: number;
  differenceCents: number;
  balanced: boolean;
  lines: number;
}

/** The opening trial balance must net to zero: total debits equal total credits. */
export function openingTrialBalance(lines: OpeningLine[]): TrialBalanceCheck {
  const debitCents = lines.reduce((s, l) => s + l.debitCents, 0);
  const creditCents = lines.reduce((s, l) => s + l.creditCents, 0);
  return { debitCents, creditCents, differenceCents: debitCents - creditCents, balanced: debitCents === creditCents && lines.length > 0, lines: lines.length };
}

export interface TieOut {
  key: string;
  control: string;
  fundId: string | null;
  /** Balance of the control account(s) in the opening trial balance, in its normal direction. */
  ledgerCents: number;
  /** Total of the detail file. */
  detailCents: number;
  differenceCents: number;
  /** Bank differences are expected (unpresented items) and only shown; the others must be acknowledged. */
  needsAcknowledgement: boolean;
}

const sumWhere = (lines: OpeningLine[], sub: string, fundId: string | null, debitNormal: boolean) =>
  lines
    .filter((l) => l.accountSubType === sub && (fundId === null || l.fundId === fundId))
    .reduce((s, l) => s + (debitNormal ? l.debitCents - l.creditCents : l.creditCents - l.debitCents), 0);

/**
 * Each control account in the opening trial balance against the detail behind it:
 * levies receivable by fund against outstanding notices, accounts payable against
 * unpaid invoices, levies in advance by fund against owner credits, and the bank
 * accounts against their last reconciled balances.
 */
export function controlTieOuts(rows: CutoverRows, funds: Lookups["funds"]): TieOut[] {
  const lines = (rows.opening_balances ?? []).flatMap((r) => (r.value ? [r.value] : []));
  const arrears = (rows.levy_arrears ?? []).flatMap((r) => (r.value ? [r.value] : []));
  const invoices = (rows.unpaid_invoices ?? []).flatMap((r) => (r.value ? [r.value] : []));
  const credits = (rows.owner_credits ?? []).flatMap((r) => (r.value ? [r.value] : []));
  const bank = (rows.bank_balances ?? []).flatMap((r) => (r.value ? [r.value] : []));
  const out: TieOut[] = [];
  const push = (t: Omit<TieOut, "differenceCents">) => out.push({ ...t, differenceCents: t.ledgerCents - t.detailCents });

  for (const f of funds) {
    const ledger = sumWhere(lines, "ACCOUNTS_RECEIVABLE", f.id, true);
    const detail = arrears.filter((a) => a.fundId === f.id).reduce((s, a) => s + a.levyOutstandingCents + a.interestChargedCents - a.interestPaidCents, 0);
    if (ledger !== 0 || detail !== 0) push({ key: `ar:${f.id}`, control: `Levies receivable, ${f.name}`, fundId: f.id, ledgerCents: ledger, detailCents: detail, needsAcknowledgement: true });
    const advance = sumWhere(lines, "LEVIES_IN_ADVANCE", f.id, false);
    const creditTotal = credits.filter((c) => c.fundId === f.id).reduce((s, c) => s + c.amountCents, 0);
    if (advance !== 0 || creditTotal !== 0) push({ key: `lia:${f.id}`, control: `Levies paid in advance, ${f.name}`, fundId: f.id, ledgerCents: advance, detailCents: creditTotal, needsAcknowledgement: true });
  }
  const payable = sumWhere(lines, "ACCOUNTS_PAYABLE", null, false);
  const unpaid = invoices.reduce((s, i) => s + i.totalCents - i.paidCents, 0);
  if (payable !== 0 || unpaid !== 0) push({ key: "ap", control: "Accounts payable", fundId: null, ledgerCents: payable, detailCents: unpaid, needsAcknowledgement: true });
  const bankLedger = sumWhere(lines, "BANK", null, true);
  const reconciled = bank.reduce((s, b) => s + b.reconciledBalanceCents, 0);
  if (bankLedger !== 0 || reconciled !== 0) push({ key: "bank", control: "Bank (ledger against last reconciled statement balance)", fundId: null, ledgerCents: bankLedger, detailCents: reconciled, needsAcknowledgement: false });
  return out;
}

export interface CutoverFile {
  dataType: CutoverDataType;
  fileName: string;
  sha256: string;
  rowCount: number;
  errorCount: number;
}

export interface Readiness {
  trialBalance: TrialBalanceCheck;
  tieOuts: TieOut[];
  problems: string[];
  canSignOff: boolean;
}

/** Whether the staged files are ready to be signed off. */
export function cutoverReadiness(input: { files: CutoverFile[]; rows: CutoverRows; funds: Lookups["funds"]; cutoverDate: string | null }): Readiness {
  const problems: string[] = [];
  if (!input.cutoverDate) problems.push("Set the cutover date.");
  for (const t of REQUIRED_FILES) if (!input.files.some((f) => f.dataType === t)) problems.push(`Add the ${CUTOVER_LABELS[t].toLowerCase()}.`);
  for (const f of input.files) if (f.errorCount > 0) problems.push(`${CUTOVER_LABELS[f.dataType]}: ${f.errorCount} row${f.errorCount === 1 ? " has" : "s have"} errors.`);
  for (const d of duplicateProblems(input.rows)) problems.push(`${CUTOVER_LABELS[d.dataType]} row ${d.rowNumber}: ${d.message}`);
  const lines = (input.rows.opening_balances ?? []).flatMap((r) => (r.value ? [r.value] : []));
  const trialBalance = openingTrialBalance(lines);
  if (input.files.some((f) => f.dataType === "opening_balances") && !trialBalance.balanced) {
    problems.push(
      trialBalance.lines === 0
        ? "The opening trial balance has no lines."
        : `The opening trial balance does not net to zero: debits $${(trialBalance.debitCents / 100).toFixed(2)}, credits $${(trialBalance.creditCents / 100).toFixed(2)}.`,
    );
  }
  // Each fund's opening balances must balance on their own (review B1).
  for (const [fundId, gap] of fundGapsCents(lines)) {
    const name = input.funds.find((f) => f.id === fundId)?.name ?? "A fund";
    problems.push(`The ${name} opening balances do not net to zero: they are out by $${(Math.abs(gap) / 100).toFixed(2)}. Each fund must balance on its own.`);
  }
  const tieOuts = controlTieOuts(input.rows, input.funds);
  return { trialBalance, tieOuts, problems, canSignOff: problems.length === 0 };
}

export interface SignOff {
  signedOffBy: string;
  signedOffAt: string;
  sourceSystem: string;
  cutoverDate: string;
  files: Array<{ dataType: CutoverDataType; fileName: string; sha256: string }>;
  acknowledgedDifferences: Array<{ key: string; control: string; differenceCents: number }>;
  note: string | null;
}

/** Why a sign-off cannot be recorded, or null. Every difference that needs it must be acknowledged. */
export function signOffProblem(readiness: Readiness, acknowledgedKeys: string[]): string | null {
  if (!readiness.canSignOff) return readiness.problems[0] ?? "The cutover is not ready.";
  const missing = readiness.tieOuts.filter((t) => t.needsAcknowledgement && t.differenceCents !== 0 && !acknowledgedKeys.includes(t.key));
  if (missing.length) return `Acknowledge the difference on ${missing.map((m) => m.control).join(", ")} before signing off.`;
  return null;
}

/**
 * Why the cutover cannot be executed, or null. Re-checks the gates at the
 * moment of execution: the trial balance must still net to zero, there must
 * be a sign-off, and the files must be the ones that were signed off.
 */
export function executionProblem(input: { status: string; readiness: Readiness; signOff: SignOff | null; files: CutoverFile[] }): string | null {
  if (input.status === "EXECUTED") return "This cutover has already been executed.";
  if (!input.readiness.trialBalance.balanced) return "The opening trial balance must net to zero before the migration can run.";
  if (!input.readiness.canSignOff) return input.readiness.problems[0] ?? "The cutover is not ready.";
  if (!input.signOff) return "The cutover must be signed off before it runs.";
  const signed = new Map(input.signOff.files.map((f) => [f.dataType, f.sha256]));
  const changed = input.files.filter((f) => signed.get(f.dataType) !== f.sha256);
  if (changed.length || signed.size !== input.files.length) return "A file has changed since the sign-off. Sign off again.";
  for (const t of input.readiness.tieOuts) {
    if (!t.needsAcknowledgement || t.differenceCents === 0) continue;
    const ack = input.signOff.acknowledgedDifferences.find((a) => a.key === t.key);
    if (!ack || ack.differenceCents !== t.differenceCents) return "A difference has changed since the sign-off. Sign off again.";
  }
  return null;
}
