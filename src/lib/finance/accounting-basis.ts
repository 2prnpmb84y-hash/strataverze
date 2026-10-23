/**
 * Cash and accrual reporting (pure). The ledger is posted once, on an
 * accrual footing: levies are raised to levies receivable when notices
 * issue, and supplier invoices are posted to accounts payable when approved.
 * The basis only changes what a report recognises as income and expenditure.
 *
 * ACCRUAL: income and expenditure as posted (levies on issue, expenses on
 * invoice approval).
 * CASH: levy income when money is received (or owner credit is applied),
 * and an invoice's expense when it is paid, in proportion to the amount
 * paid. Entries that only accrue (levies raised, interest charged, invoice
 * approval) are left out.
 */

export type AccountingBasis = "CASH" | "ACCRUAL";

export interface BasisLine {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  accountSubType: string | null;
  fundId: string;
  debitCents: number;
  creditCents: number;
}

export interface BasisEntry {
  id: string;
  date: string;
  sourceType: string | null;
  sourceId: string | null;
  lines: BasisLine[];
}

export interface RecognisedLine {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: "INCOME" | "EXPENSE";
  accountSubType: string | null;
  fundId: string;
  amountCents: number;
}

/** Entries that recognise income or expense only on an accrual basis. */
const ACCRUAL_ONLY = new Set(["LEVY_RAISED", "INTEREST", "INVOICE"]);

const isIncomeOrExpense = (l: BasisLine) => l.accountType === "INCOME" || l.accountType === "EXPENSE";
const signed = (l: BasisLine) => (l.accountType === "INCOME" ? l.creditCents - l.debitCents : l.debitCents - l.creditCents);

export interface RecognitionInput {
  entries: BasisEntry[];
  start: string;
  end: string;
  basisForFund: (fundId: string) => AccountingBasis;
  levyIncomeAccount: (fundId: string) => { accountId: string; accountCode: string; accountName: string } | null;
}

/** How an entry came to be recognised against an account. */
export type RecognitionVia = "POSTED" | "LEVY_RECEIPT" | "INVOICE_PAYMENT";

/** One entry's contribution to one account and fund in a period. */
export interface Recognition {
  entryId: string;
  line: Omit<RecognisedLine, "amountCents">;
  cents: number;
  via: RecognitionVia;
}

/**
 * Every contribution to income and expenditure in a period, entry by entry.
 * The report totals are the sum of these, so a drill-down built from them
 * always adds up to the figure on the report.
 *
 * `entries` must include every posted entry up to the end of the period, not
 * only those inside it, so an invoice approved earlier can be found when it
 * is paid inside the period. `levyIncomeAccount` gives the account levy
 * receipts are shown under on a cash basis for each fund.
 */
export function recognitions(input: RecognitionInput): Recognition[] {
  const out: Recognition[] = [];
  const add = (entryId: string, line: Omit<RecognisedLine, "amountCents">, cents: number, via: RecognitionVia) => {
    if (cents !== 0) out.push({ entryId, line, cents, via });
  };

  // Invoice approval entries, by invoice id, for cash basis expense recognition.
  const invoices = new Map<string, BasisEntry>();
  for (const e of input.entries) if (e.sourceType === "INVOICE" && e.sourceId) invoices.set(e.sourceId, e);
  // A reversal is treated as its original: reversing an invoice approval is
  // accrual only, and reversing a receipt or a payment undoes cash recognised.
  const byId = new Map(input.entries.map((e) => [e.id, e]));
  const effective = (e: BasisEntry) => {
    const original = e.sourceType === "REVERSAL" && e.sourceId ? byId.get(e.sourceId) : undefined;
    return original ? { sourceType: original.sourceType, sourceId: original.sourceId } : { sourceType: e.sourceType, sourceId: e.sourceId };
  };

  for (const e of input.entries) {
    if (e.date < input.start || e.date > input.end) continue;
    const src = effective(e);
    for (const l of e.lines) {
      const basis = input.basisForFund(l.fundId);
      if (isIncomeOrExpense(l)) {
        if (basis === "CASH" && src.sourceType && ACCRUAL_ONLY.has(src.sourceType)) continue;
        add(e.id, { ...pick(l), accountType: l.accountType as "INCOME" | "EXPENSE" }, signed(l), "POSTED");
        continue;
      }
      if (basis !== "CASH") continue;

      // Cash basis: a receivable credited by a receipt or applied credit is levy income now
      // (and a reversed receipt takes it back out).
      if (l.accountSubType === "ACCOUNTS_RECEIVABLE" && (src.sourceType === "PAYMENT" || src.sourceType === "OWNER_CREDIT")) {
        const income = input.levyIncomeAccount(l.fundId);
        if (income) add(e.id, { ...income, accountType: "INCOME", accountSubType: "LEVY_INCOME", fundId: l.fundId }, l.creditCents - l.debitCents, "LEVY_RECEIPT");
      }

      // Cash basis: paying an invoice recognises its expense lines, in proportion
      // (and a reversed payment takes them back out).
      const paid = l.debitCents - l.creditCents;
      if (l.accountSubType === "ACCOUNTS_PAYABLE" && src.sourceType === "PAYMENT" && src.sourceId && paid !== 0) {
        const inv = invoices.get(src.sourceId);
        if (!inv) continue;
        const payable = inv.lines.filter((x) => x.accountSubType === "ACCOUNTS_PAYABLE").reduce((s, x) => s + x.creditCents - x.debitCents, 0);
        if (payable <= 0) continue;
        const share = paid / payable;
        for (const x of inv.lines) {
          if (x.accountType !== "EXPENSE" || x.fundId !== l.fundId) continue;
          add(e.id, { ...pick(x), accountType: "EXPENSE" }, Math.round(signed(x) * share), "INVOICE_PAYMENT");
        }
      }
    }
  }
  return out;
}

/** Income and expenditure recognised in a period, per account and fund. */
export function recognisedIncomeExpense(input: RecognitionInput): RecognisedLine[] {
  const totals = new Map<string, RecognisedLine>();
  for (const r of recognitions(input)) {
    const key = `${r.line.accountId}:${r.line.fundId}`;
    const row = totals.get(key) ?? { ...r.line, amountCents: 0 };
    row.amountCents += r.cents;
    totals.set(key, row);
  }
  return [...totals.values()].sort((a, b) => a.accountCode.localeCompare(b.accountCode));
}

/** The levy income account a fund's cash receipts are shown under: the fund's own, else the first. */
export function levyIncomeAccountPicker(accounts: Array<{ id: string; code: unknown; name: unknown; fundId: string | null }>) {
  return (fundId: string) => {
    const a = accounts.find((x) => x.fundId === fundId) ?? accounts[0];
    return a ? { accountId: a.id, accountCode: String(a.code), accountName: String(a.name) } : null;
  };
}

function pick(l: BasisLine) {
  return { accountId: l.accountId, accountCode: l.accountCode, accountName: l.accountName, accountSubType: l.accountSubType, fundId: l.fundId };
}

/** Totals of recognised lines. */
export function incomeExpenseTotals(lines: RecognisedLine[]) {
  const income = lines.filter((l) => l.accountType === "INCOME").reduce((s, l) => s + l.amountCents, 0);
  const expense = lines.filter((l) => l.accountType === "EXPENSE").reduce((s, l) => s + l.amountCents, 0);
  return { incomeCents: income, expenseCents: expense, surplusCents: income - expense };
}
