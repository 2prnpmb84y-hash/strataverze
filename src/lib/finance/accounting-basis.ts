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

/**
 * Income and expenditure recognised in a period, per account and fund.
 *
 * `entries` must include every posted entry up to the end of the period, not
 * only those inside it, so an invoice approved earlier can be found when it
 * is paid inside the period. `levyIncomeAccount` gives the account levy
 * receipts are shown under on a cash basis for each fund.
 */
export function recognisedIncomeExpense(input: {
  entries: BasisEntry[];
  start: string;
  end: string;
  basisForFund: (fundId: string) => AccountingBasis;
  levyIncomeAccount: (fundId: string) => { accountId: string; accountCode: string; accountName: string } | null;
}): RecognisedLine[] {
  const totals = new Map<string, RecognisedLine>();
  const add = (l: Omit<RecognisedLine, "amountCents">, cents: number) => {
    if (cents === 0) return;
    const key = `${l.accountId}:${l.fundId}`;
    const row = totals.get(key) ?? { ...l, amountCents: 0 };
    row.amountCents += cents;
    totals.set(key, row);
  };

  // Invoice approval entries, by invoice id, for cash basis expense recognition.
  const invoices = new Map<string, BasisEntry>();
  for (const e of input.entries) if (e.sourceType === "INVOICE" && e.sourceId) invoices.set(e.sourceId, e);

  for (const e of input.entries) {
    if (e.date < input.start || e.date > input.end) continue;
    for (const l of e.lines) {
      const basis = input.basisForFund(l.fundId);
      if (isIncomeOrExpense(l)) {
        if (basis === "CASH" && e.sourceType && ACCRUAL_ONLY.has(e.sourceType)) continue;
        add({ ...pick(l), accountType: l.accountType as "INCOME" | "EXPENSE" }, signed(l));
        continue;
      }
      if (basis !== "CASH") continue;

      // Cash basis: a receivable credited by a receipt or applied credit is levy income now.
      if (l.accountSubType === "ACCOUNTS_RECEIVABLE" && (e.sourceType === "PAYMENT" || e.sourceType === "OWNER_CREDIT")) {
        const income = input.levyIncomeAccount(l.fundId);
        if (income) add({ ...income, accountType: "INCOME", accountSubType: "LEVY_INCOME", fundId: l.fundId }, l.creditCents - l.debitCents);
      }

      // Cash basis: paying an invoice recognises its expense lines, in proportion.
      if (l.accountSubType === "ACCOUNTS_PAYABLE" && e.sourceType === "PAYMENT" && e.sourceId && l.debitCents > 0) {
        const inv = invoices.get(e.sourceId);
        if (!inv) continue;
        const payable = inv.lines.filter((x) => x.accountSubType === "ACCOUNTS_PAYABLE").reduce((s, x) => s + x.creditCents - x.debitCents, 0);
        if (payable <= 0) continue;
        const share = l.debitCents / payable;
        for (const x of inv.lines) {
          if (x.accountType !== "EXPENSE" || x.fundId !== l.fundId) continue;
          add({ ...pick(x), accountType: "EXPENSE" }, Math.round(signed(x) * share));
        }
      }
    }
  }
  return [...totals.values()].sort((a, b) => a.accountCode.localeCompare(b.accountCode));
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
