/**
 * Report drill-down (pure). A report cell is one account, optionally in one
 * fund, over a period. The drill-down lists the posted journal entries
 * behind that figure, and its total is the figure on the report.
 *
 * LEDGER mode lists every line posted to the account, as the trial balance
 * and the income and expenditure statement add them up. CASH and ACCRUAL
 * follow the statutory statements: the entries recognised on that basis, so
 * on a cash basis a levy receipt is listed under levy income and an invoice
 * payment under the expense account it pays.
 */
import { recognitions, type AccountingBasis, type BasisEntry, type RecognitionVia } from "./accounting-basis";

export type DrillMode = "LEDGER" | AccountingBasis;

export interface DrillDownParams {
  accountId: string;
  fundId: string | null;
  start: string | null;
  end: string | null;
  mode: DrillMode;
}

export interface DrillEntry extends BasisEntry {
  entryNumber: string;
  description: string;
  /** Line descriptions, by line position, for the notes shown beside each row. */
  lineNotes?: Array<string | null>;
}

export interface DrillRow {
  entryId: string;
  entryNumber: string;
  date: string;
  description: string;
  sourceType: string | null;
  sourceId: string | null;
  debitCents: number;
  creditCents: number;
  /** Signed in the account's normal direction (debit for assets and expenses, credit otherwise). */
  amountCents: number;
  via: RecognitionVia;
  notes: string[];
}

export interface DrillResult {
  rows: DrillRow[];
  debitCents: number;
  creditCents: number;
  totalCents: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Assets and expenses carry debit balances; liabilities, equity and income carry credit balances. */
export function normalSide(accountType: string): "DEBIT" | "CREDIT" {
  return accountType === "ASSET" || accountType === "EXPENSE" ? "DEBIT" : "CREDIT";
}

/** Read and check drill-down search params. Returns null when the link is malformed. */
export function parseDrillDownParams(sp: Record<string, string | string[] | undefined>): DrillDownParams | null {
  const one = (k: string) => {
    const v = sp[k];
    return typeof v === "string" && v !== "" ? v : null;
  };
  const accountId = one("account");
  const fundId = one("fund");
  const start = one("startDate");
  const end = one("endDate");
  const basis = one("basis");
  if (!accountId || !UUID.test(accountId)) return null;
  if (fundId && !UUID.test(fundId)) return null;
  if (start && !ISO_DAY.test(start)) return null;
  if (end && !ISO_DAY.test(end)) return null;
  if (start && end && start > end) return null;
  if (basis && basis !== "CASH" && basis !== "ACCRUAL") return null;
  return { accountId, fundId, start, end, mode: (basis as AccountingBasis | null) ?? "LEDGER" };
}

/** The link from a report cell to its drill-down. */
export function drillDownHref(base: string, p: { accountId: string; fundId?: string | null; start?: string | null; end?: string | null; basis?: AccountingBasis | null }): string {
  const q = new URLSearchParams({ account: p.accountId });
  if (p.fundId) q.set("fund", p.fundId);
  if (p.start) q.set("startDate", p.start);
  if (p.end) q.set("endDate", p.end);
  if (p.basis) q.set("basis", p.basis);
  return `${base}/drill-down?${q.toString()}`;
}

/**
 * The entries behind one report cell, oldest first.
 * `entries` must hold every posted entry up to the end of the period (for
 * CASH mode an invoice approved before the period is needed to recognise its
 * payment), and every line of each entry.
 */
export function cellRows(input: {
  entries: DrillEntry[];
  params: DrillDownParams;
  accountType: string;
  levyIncomeAccount: (fundId: string) => { accountId: string; accountCode: string; accountName: string } | null;
  /** Invoices brought across in a cutover (see RecognitionInput.extraInvoices). */
  extraInvoices?: BasisEntry[];
}): DrillResult {
  const { params } = input;
  const inFund = (fundId: string) => !params.fundId || fundId === params.fundId;
  const inRange = (d: string) => (!params.start || d >= params.start) && (!params.end || d <= params.end);
  const sign = normalSide(input.accountType) === "DEBIT" ? 1 : -1;
  const byId = new Map(input.entries.map((e) => [e.id, e]));
  const rows = new Map<string, DrillRow>();
  const row = (e: DrillEntry, via: RecognitionVia) => {
    const existing = rows.get(e.id);
    if (existing) return existing;
    const r: DrillRow = {
      entryId: e.id,
      entryNumber: e.entryNumber,
      date: e.date,
      description: e.description,
      sourceType: e.sourceType,
      sourceId: e.sourceId,
      debitCents: 0,
      creditCents: 0,
      amountCents: 0,
      via,
      notes: [],
    };
    rows.set(e.id, r);
    return r;
  };

  if (params.mode === "LEDGER") {
    for (const e of input.entries) {
      if (!inRange(e.date)) continue;
      e.lines.forEach((l, i) => {
        if (l.accountId !== params.accountId || !inFund(l.fundId)) return;
        const r = row(e, "POSTED");
        r.debitCents += l.debitCents;
        r.creditCents += l.creditCents;
        r.amountCents += sign * (l.debitCents - l.creditCents);
        const note = e.lineNotes?.[i];
        if (note && !r.notes.includes(note)) r.notes.push(note);
      });
    }
  } else {
    // The same walk the statutory statements use, limited to the cell's fund first,
    // so an invoice's payment share is worked out exactly as on the report.
    const scoped = input.entries.map((e) => ({ ...e, lines: e.lines.filter((l) => inFund(l.fundId)) }));
    const basis = params.mode;
    for (const rec of recognitions({
      entries: scoped,
      start: params.start ?? "0000-01-01",
      end: params.end ?? "9999-12-31",
      basisForFund: () => basis,
      levyIncomeAccount: input.levyIncomeAccount,
      extraInvoices: (input.extraInvoices ?? []).map((e) => ({ ...e, lines: e.lines.filter((l) => inFund(l.fundId)) })),
    })) {
      if (rec.line.accountId !== params.accountId) continue;
      const e = byId.get(rec.entryId);
      if (!e) continue;
      const r = row(e, rec.via);
      r.amountCents += rec.cents;
      // Recognised amounts are already in the account's normal direction.
      if (sign * rec.cents >= 0) r.debitCents += Math.abs(rec.cents);
      else r.creditCents += Math.abs(rec.cents);
    }
  }

  const list = [...rows.values()]
    .filter((r) => r.debitCents !== 0 || r.creditCents !== 0)
    .sort((a, b) => (a.date === b.date ? a.entryNumber.localeCompare(b.entryNumber, undefined, { numeric: true }) : a.date.localeCompare(b.date)));
  return {
    rows: list,
    debitCents: list.reduce((s, r) => s + r.debitCents, 0),
    creditCents: list.reduce((s, r) => s + r.creditCents, 0),
    totalCents: list.reduce((s, r) => s + r.amountCents, 0),
  };
}

/** What a journal entry's source record is, from its source type. */
export type SourceKind =
  | "LEVY_SCHEDULE"
  | "LEVY_NOTICE"
  | "SUPPLIER_INVOICE"
  | "BANK_TRANSACTION"
  | "SUSPENSE_ITEM"
  | "OWNER_CREDIT"
  | "OWNER_CREDIT_REFUND"
  | "JOURNAL_ENTRY";

/**
 * The tables a source id may point at, most likely first. A PAYMENT entry is
 * either a levy receipt (the notice) or a supplier payment (the invoice), and
 * an OWNER_CREDIT entry is a credit movement or a refund, so those are
 * resolved by looking the id up.
 */
export function sourceCandidates(sourceType: string | null): SourceKind[] {
  switch (sourceType) {
    case "LEVY_RAISED":
      return ["LEVY_SCHEDULE"];
    case "INVOICE":
      return ["SUPPLIER_INVOICE"];
    case "PAYMENT":
      return ["SUPPLIER_INVOICE", "LEVY_NOTICE"];
    case "INTEREST":
      return ["LEVY_NOTICE"];
    case "OWNER_CREDIT":
      return ["OWNER_CREDIT", "OWNER_CREDIT_REFUND"];
    case "SUSPENSE":
      return ["BANK_TRANSACTION", "SUSPENSE_ITEM"];
    case "BANK_IMPORT":
      return ["BANK_TRANSACTION"];
    case "REVERSAL":
      return ["JOURNAL_ENTRY"];
    default:
      return [];
  }
}

/** A plain description of the drill-down basis, for the page heading, in the building's words for a levy. */
export function modeLabel(mode: DrillMode, terms: { levy: string; levies: string } = { levy: "levy", levies: "levies" }): string {
  if (mode === "CASH") return `Cash basis: ${terms.levy} income when received, expenses when paid`;
  if (mode === "ACCRUAL") return `Accrual basis: ${terms.levies} when raised, expenses when approved`;
  return "Every posted line on this account";
}
