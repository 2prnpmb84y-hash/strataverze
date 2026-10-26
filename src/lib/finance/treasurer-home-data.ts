/** Loading the treasurer's "this month" view (server). */
import { db } from "@/prisma/db";
import { schemeToday } from "@/lib/jurisdiction/scheme-time";
import { and } from "@prisma/orm-postgres/orm-client";
import { getInvoicesAwaitingApproval, getWorksInvoicesAwaitingApproval } from "./invoice-approval";
import { getOwnerCreditRefunds } from "./owner-credits";
import { treasurerMonth, type TreasurerInputs, type TreasurerMonth } from "./treasurer-home";

const isoDay = (v: unknown) => String(v ?? "").slice(0, 10);
const cents = (v: unknown) => Math.round(Number(v ?? 0) * 100);

export async function getTreasurerMonth(schemeId: string, todayDay?: string): Promise<TreasurerMonth> {
  const today = todayDay ?? (await schemeToday(schemeId));
  const [txns, invoices, works, refunds, notices, suspense, periods] = await Promise.all([
    db.orm.public.BankTransaction
      .where((t) => and(t.schemeId.eq(schemeId), t.reconciliationStatus.eq("UNMATCHED"), t.isDuplicate.eq(false)))
      .orderBy((t) => t.transactionDate.asc())
      .limit(5000)
      .all(),
    getInvoicesAwaitingApproval([schemeId]),
    getWorksInvoicesAwaitingApproval([schemeId]),
    getOwnerCreditRefunds([schemeId], ["AWAITING_APPROVAL"]),
    db.orm.public.LevyNotice
      .where((n) => and(n.schemeId.eq(schemeId), n.status.in(["ISSUED", "PARTIALLY_PAID", "OVERDUE"])))
      .include("lot")
      .limit(20000)
      .all(),
    db.orm.public.SuspenseItem.where((s) => and(s.schemeId.eq(schemeId), s.status.eq("OPEN"))).limit(5000).all(),
    db.orm.public.FinancialPeriod.where((p) => p.schemeId.eq(schemeId)).limit(500).all(),
  ]);

  const input: TreasurerInputs = {
    today,
    unmatched: txns.map((t) => ({ id: t.id, date: isoDay(t.transactionDate), amountCents: cents(t.amount), description: String(t.description) })),
    approvals: [
      ...invoices.map((i) => ({
        id: i.id,
        kind: "SUPPLIER_INVOICE" as const,
        label: `${String(i.supplier?.companyName ?? "Supplier")} invoice ${String(i.invoiceNumber)}`,
        amountCents: cents(i.totalAmount),
        dueDate: isoDay(i.dueDate) || null,
      })),
      ...works.map((w) => ({
        id: w.id,
        kind: "WORKS_INVOICE" as const,
        label: `Works invoice ${String(w.invoiceNumber)}`,
        amountCents: cents(w.assessedAmount ?? w.claimedAmount),
        dueDate: isoDay(w.dueDate) || null,
      })),
      ...refunds.map((r) => ({
        id: r.id,
        kind: "CREDIT_REFUND" as const,
        label: `Owner credit refund to ${String(r.payeeName)}`,
        amountCents: cents(r.amount),
        dueDate: null,
      })),
    ],
    notices: notices.map((n) => ({
      id: n.id,
      noticeNumber: String(n.noticeNumber),
      lotNumber: String(n.lot?.lotNumber ?? "?"),
      dueDate: isoDay(n.dueDate),
      balanceCents: cents(n.balanceOutstanding),
      status: String(n.status),
    })),
    suspense: suspense.map((s) => ({ id: s.id, transactionDate: isoDay(s.transactionDate), amountCents: cents(s.amount), description: String(s.description) })),
    periods: periods.map((p) => ({ id: p.id, name: String(p.name), startDate: isoDay(p.startDate), endDate: isoDay(p.endDate), status: String(p.status) })),
  };
  return treasurerMonth(input);
}
