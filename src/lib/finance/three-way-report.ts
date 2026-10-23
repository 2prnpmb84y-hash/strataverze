/**
 * Three-way reconciliation report (server side): the ledger bank balance per
 * fund, the payment provider's wallet balance, and the bank statement
 * balance, with the differences itemised.
 */
import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";
import type { TimestampString } from "@prisma/orm-postgres/target/codec-types";
import { toCents } from "@/lib/billing/money";
import { allocatedByTransaction, getAllocationCandidates, getSuspenseItems } from "./bank-allocations";
import { threeWayReconciliation, type ThreeWayInput, type ThreeWayResult } from "./reconciliation";
import { walletBalanceProvider } from "./wallet-provider";
import { LEDGER_STATUSES } from "@/lib/finance/ledger-status";

const ts = (v: string) => v as unknown as TimestampString<3>;
const isoDay = (v: unknown) => String(v ?? "").slice(0, 10);

export interface ThreeWayReport extends ThreeWayResult {
  asAt: string;
  input: ThreeWayInput;
}

export async function getThreeWayReconciliationReport(schemeId: string, asAt: string): Promise<ThreeWayReport> {
  const [funds, accounts, entries, candidates, suspense] = await Promise.all([
    db.orm.public.Fund.where((f) => f.schemeId.eq(schemeId)).limit(20).all(),
    db.orm.public.SchemeBankAccount.where((a) => and(a.schemeId.eq(schemeId), a.isActive.eq(true))).limit(50).all(),
    db.orm.public.JournalEntry
      .where((je) => and(je.schemeId.eq(schemeId), je.status.in(LEDGER_STATUSES), je.transactionDate.lte(ts(asAt))))
      .include("lines", (l) => l.include("accountCode"))
      .limit(50000)
      .all(),
    getAllocationCandidates(schemeId, 5000),
    getSuspenseItems(schemeId, "OPEN"),
  ]);

  // Ledger: posted lines on bank accounts, by the fund on the line.
  const byFund = new Map<string, number>();
  for (const e of entries) {
    for (const l of e.lines ?? []) {
      if (l.accountCode?.accountSubType !== "BANK") continue;
      byFund.set(l.fundId, (byFund.get(l.fundId) ?? 0) + toCents(String(l.debit ?? 0)) - toCents(String(l.credit ?? 0)));
    }
  }
  const ledgerByFund = funds.map((f) => ({ fundId: f.id, fundName: String(f.name), cents: byFund.get(f.id) ?? 0 }));

  // Statement: the latest imported balance on or before the date, per account.
  const statementByAccount = await Promise.all(
    accounts.map(async (a) => {
      const last = await db.orm.public.BankTransaction
        .where((t) => and(t.bankAccountId.eq(a.id), t.balance.isNotNull(), t.isDuplicate.eq(false), t.transactionDate.lte(ts(asAt))))
        .orderBy([(t) => t.transactionDate.desc(), (t) => t.importedAt.desc()])
        .first();
      return {
        bankAccountId: a.id,
        accountName: String(a.accountName),
        cents: last ? toCents(String(last.balance)) : null,
        asAt: last ? isoDay(last.transactionDate) : null,
      };
    }),
  );

  // Bank items not in the ledger: unallocated parts of transactions, and excluded ones.
  const txns = await db.orm.public.BankTransaction
    .where((t) => and(t.schemeId.eq(schemeId), t.isDuplicate.eq(false), t.transactionDate.lte(ts(asAt))))
    .limit(50000)
    .all();
  const allocated = await allocatedByTransaction(txns.map((t) => t.id));
  const unmatchedBank = txns
    .map((t) => {
      const amount = toCents(String(t.amount));
      const left = t.reconciliationStatus === "EXCLUDED" ? Math.abs(amount) : Math.max(0, Math.abs(amount) - (allocated.get(t.id) ?? 0));
      return {
        id: t.id,
        date: isoDay(t.transactionDate),
        description: t.reconciliationStatus === "EXCLUDED" ? `${String(t.description)} (excluded)` : String(t.description),
        cents: Math.sign(amount) * left,
      };
    })
    .filter((x) => x.cents !== 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  // Ledger items not yet on the statement: unmatched parts of bank entries.
  const pendingLedger = candidates
    .filter((c) => c.date <= asAt)
    .map((c) => ({ id: c.id, date: c.date, description: `${c.entryNumber} ${c.description}`, cents: Math.sign(c.bankSideCents) * c.remainingCents }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const input: ThreeWayInput = {
    ledgerByFund,
    statementByAccount,
    walletCents: await walletBalanceProvider().walletBalanceCents(schemeId, asAt),
    unmatchedBank,
    pendingLedger,
    suspense: suspense
      .filter((s) => s.transactionDate <= asAt)
      .map((s) => ({ id: s.id, date: s.transactionDate, description: s.description, cents: s.amountCents })),
  };
  return { ...threeWayReconciliation(input), asAt, input };
}
