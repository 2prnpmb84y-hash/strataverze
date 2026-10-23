/**
 * Report drill-down (server). From a report cell to the journal entries
 * behind it, and from each entry to its source record, documents and bank
 * transactions (TC-013).
 */
import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";
import type { TimestampString } from "@prisma/orm-postgres/target/codec-types";
import { toBasisEntries } from "@/lib/queries/reports";
import { levyIncomeAccountPicker } from "./accounting-basis";
import { LEDGER_STATUSES } from "./ledger-status";
import { cellRows, sourceCandidates, type DrillDownParams, type DrillEntry, type DrillResult, type SourceKind } from "./drill-down";

const ts = (v: string) => v as unknown as TimestampString<3>;
const isoDay = (v: unknown) => String(v ?? "").slice(0, 10);
const cents = (v: unknown) => Math.round(Number(v ?? 0) * 100);
const NONE = ["00000000-0000-0000-0000-000000000000"];
const ids = (xs: Iterable<string | null | undefined>) => {
  const out = [...new Set([...xs].filter((x): x is string => !!x))];
  return out.length ? out : NONE;
};

export interface CellAccount {
  id: string;
  code: string;
  name: string;
  accountType: string;
}

export interface ReportCell extends DrillResult {
  account: CellAccount;
  fund: { id: string; name: string } | null;
  params: DrillDownParams;
}

/**
 * The journal entries behind one report cell: an account, optionally in one
 * fund, over a period. Returns null when the account or fund is not the
 * scheme's.
 */
export async function getJournalEntriesForReportCell(
  schemeId: string,
  accountCodeId: string,
  fundId: string | null,
  periodRange: { start: string | null; end: string | null },
  mode: DrillDownParams["mode"] = "LEDGER",
): Promise<ReportCell | null> {
  const [account, fund] = await Promise.all([
    db.orm.public.AccountCode.where((a) => and(a.id.eq(accountCodeId), a.schemeId.eq(schemeId))).first(),
    fundId ? db.orm.public.Fund.where((f) => and(f.id.eq(fundId), f.schemeId.eq(schemeId))).first() : Promise.resolve(null),
  ]);
  if (!account || (fundId && !fund)) return null;

  // Every ledger entry up to the end of the period: a cash basis cell needs
  // invoices approved before the period to recognise payments inside it.
  let q = db.orm.public.JournalEntry.where((je) => and(je.schemeId.eq(schemeId), je.status.in(LEDGER_STATUSES)));
  if (periodRange.end) q = q.where((je) => je.transactionDate.lte(ts(periodRange.end!)));
  if (mode === "LEDGER" && periodRange.start) q = q.where((je) => je.transactionDate.gte(ts(periodRange.start!)));
  const [entries, levyIncome] = await Promise.all([
    q.include("lines", (l) => l.include("accountCode")).limit(50000).all(),
    mode === "CASH"
      ? db.orm.public.AccountCode.where((a) => and(a.schemeId.eq(schemeId), a.accountSubType.eq("LEVY_INCOME"))).limit(20).all()
      : Promise.resolve([]),
  ]);

  const basis = toBasisEntries(entries);
  const drillEntries: DrillEntry[] = basis.map((b, i) => {
    const e = entries[i];
    return {
      ...b,
      entryNumber: String(e.entryNumber),
      description: String(e.description ?? ""),
      lineNotes: (e.lines ?? []).filter((l) => l.accountCode).map((l) => (l.description ? String(l.description) : null)),
    };
  });
  const params: DrillDownParams = { accountId: accountCodeId, fundId, start: periodRange.start, end: periodRange.end, mode };
  const result = cellRows({
    entries: drillEntries,
    params,
    accountType: String(account.accountType),
    levyIncomeAccount: levyIncomeAccountPicker(levyIncome),
  });
  return {
    ...result,
    params,
    account: { id: account.id, code: String(account.code), name: String(account.name), accountType: String(account.accountType) },
    fund: fund ? { id: fund.id, name: String(fund.name) } : null,
  };
}

export interface EntrySourceRecord {
  kind: SourceKind;
  id: string;
  label: string;
  /** For a levy notice: its schedule, so the adviser link can open it. */
  levyScheduleId?: string;
}

export interface EntryDocument {
  id: string;
  fileName: string;
  fileUrl: string;
  documentType: string;
}

export interface EntryBankTransaction {
  id: string;
  date: string;
  amountCents: number;
  description: string;
  status: string;
}

export interface EntrySources {
  source: EntrySourceRecord | null;
  documents: EntryDocument[];
  bankTransactions: EntryBankTransaction[];
}

/**
 * For each entry, where it came from: the source record, the documents
 * attached to that record, and the bank transactions it was matched or
 * allocated to. Every lookup is limited to the scheme.
 */
export async function getEntrySources(
  schemeId: string,
  entries: Array<{ id: string; sourceType: string | null; sourceId: string | null }>,
): Promise<Map<string, EntrySources>> {
  const out = new Map<string, EntrySources>();
  if (entries.length === 0) return out;
  const want = (k: SourceKind) => ids(entries.filter((e) => sourceCandidates(e.sourceType).includes(k)).map((e) => e.sourceId));
  const entryIds = ids(entries.map((e) => e.id));

  const [invoices, notices, schedules, txns, suspense, credits, refunds, originals, matched, allocations, lineTxns] = await Promise.all([
    db.orm.public.SupplierInvoice.where((x) => and(x.schemeId.eq(schemeId), x.id.in(want("SUPPLIER_INVOICE")))).include("supplier").limit(5000).all(),
    db.orm.public.LevyNotice.where((x) => and(x.schemeId.eq(schemeId), x.id.in(want("LEVY_NOTICE")))).include("lot").limit(5000).all(),
    db.orm.public.LevySchedule.where((x) => and(x.schemeId.eq(schemeId), x.id.in(want("LEVY_SCHEDULE")))).limit(500).all(),
    db.orm.public.BankTransaction.where((x) => and(x.schemeId.eq(schemeId), x.id.in(want("BANK_TRANSACTION")))).limit(5000).all(),
    db.orm.public.SuspenseItem.where((x) => and(x.schemeId.eq(schemeId), x.id.in(want("SUSPENSE_ITEM")))).limit(5000).all(),
    db.orm.public.OwnerCreditTransaction.where((x) => and(x.schemeId.eq(schemeId), x.id.in(want("OWNER_CREDIT")))).limit(5000).all(),
    db.orm.public.OwnerCreditRefund.where((x) => and(x.schemeId.eq(schemeId), x.id.in(want("OWNER_CREDIT_REFUND")))).limit(5000).all(),
    db.orm.public.JournalEntry.where((x) => and(x.schemeId.eq(schemeId), x.id.in(want("JOURNAL_ENTRY")))).limit(5000).all(),
    db.orm.public.BankTransaction.where((x) => and(x.schemeId.eq(schemeId), x.matchedJournalEntryId.in(entryIds))).limit(5000).all(),
    db.orm.public.BankTransactionAllocation.where((x) => and(x.schemeId.eq(schemeId), x.journalEntryId.in(entryIds))).limit(20000).all(),
    db.orm.public.JournalLine.where((x) => and(x.journalEntryId.in(entryIds), x.bankTransactionId.isNotNull())).limit(20000).all(),
  ]);

  // Bank transactions reached through allocations or journal lines, not yet loaded.
  const loaded = new Set([...txns, ...matched].map((t) => t.id));
  const moreTxnIds = [...allocations.map((a) => a.bankTransactionId), ...lineTxns.map((l) => l.bankTransactionId), ...suspense.map((s) => s.bankTransactionId)].filter(
    (x): x is string => !!x && !loaded.has(x),
  );
  const moreTxns = moreTxnIds.length
    ? await db.orm.public.BankTransaction.where((x) => and(x.schemeId.eq(schemeId), x.id.in(ids(moreTxnIds)))).limit(20000).all()
    : [];
  const txnById = new Map([...txns, ...matched, ...moreTxns].map((t) => [t.id, t]));
  const lots = await (() => {
    const lotIds = [...credits, ...refunds].map((c) => c.lotId);
    return lotIds.length ? db.orm.public.Lot.where((l) => and(l.schemeId.eq(schemeId), l.id.in(ids(lotIds)))).limit(5000).all() : Promise.resolve([]);
  })();
  const lotNumber = (id: string) => String(lots.find((l) => l.id === id)?.lotNumber ?? "?");

  // Documents attached to the source records and bank transactions.
  const [invoiceDocs, noticeDocs, txnDocs] = await Promise.all([
    db.orm.public.FinancialDocument.where((d) => and(d.schemeId.eq(schemeId), d.supplierInvoiceId.in(ids(invoices.map((i) => i.id))))).limit(5000).all(),
    db.orm.public.FinancialDocument.where((d) => and(d.schemeId.eq(schemeId), d.levyNoticeId.in(ids(notices.map((n) => n.id))))).limit(5000).all(),
    db.orm.public.FinancialDocument.where((d) => and(d.schemeId.eq(schemeId), d.bankTransactionId.in(ids(txnById.keys())))).limit(5000).all(),
  ]);
  const toDoc = (d: (typeof invoiceDocs)[number]): EntryDocument => ({ id: d.id, fileName: String(d.fileName), fileUrl: String(d.fileUrl), documentType: String(d.documentType) });
  const toTxn = (t: (typeof txns)[number]): EntryBankTransaction => ({
    id: t.id,
    date: isoDay(t.transactionDate),
    amountCents: cents(t.amount),
    description: String(t.description),
    status: String(t.reconciliationStatus),
  });

  for (const e of entries) {
    let source: EntrySourceRecord | null = null;
    const docList: EntryDocument[] = [];
    const txnIds = new Set<string>();
    const sid = e.sourceId;
    if (sid) {
      for (const kind of sourceCandidates(e.sourceType)) {
        if (kind === "SUPPLIER_INVOICE") {
          const i = invoices.find((x) => x.id === sid);
          if (i) {
            source = { kind, id: i.id, label: `Invoice ${String(i.invoiceNumber)} from ${String(i.supplier?.companyName ?? "supplier")}` };
            docList.push(...invoiceDocs.filter((d) => d.supplierInvoiceId === i.id).map(toDoc));
          }
        } else if (kind === "LEVY_NOTICE") {
          const n = notices.find((x) => x.id === sid);
          if (n) {
            source = { kind, id: n.id, label: `Levy notice ${String(n.noticeNumber)}, Lot ${String(n.lot?.lotNumber ?? "?")}`, levyScheduleId: n.levyScheduleId };
            docList.push(...noticeDocs.filter((d) => d.levyNoticeId === n.id).map(toDoc));
          }
        } else if (kind === "LEVY_SCHEDULE") {
          const s = schedules.find((x) => x.id === sid);
          if (s) source = { kind, id: s.id, label: s.title ? String(s.title) : `Levy schedule FY${s.financialYear} (${String(s.frequency).toLowerCase().replace("_", " ")})` };
        } else if (kind === "BANK_TRANSACTION") {
          const t = txnById.get(sid);
          if (t) {
            source = { kind, id: t.id, label: `Bank transaction ${isoDay(t.transactionDate)}: ${String(t.description)}` };
            txnIds.add(t.id);
          }
        } else if (kind === "SUSPENSE_ITEM") {
          const s = suspense.find((x) => x.id === sid);
          if (s) {
            source = { kind, id: s.id, label: `Suspense item: ${String(s.description)}` };
            txnIds.add(s.bankTransactionId);
          }
        } else if (kind === "OWNER_CREDIT") {
          const c = credits.find((x) => x.id === sid);
          if (c) source = { kind, id: c.id, label: `Owner credit, Lot ${lotNumber(c.lotId)} (${String(c.type).toLowerCase().replace(/_/g, " ")})` };
        } else if (kind === "OWNER_CREDIT_REFUND") {
          const r = refunds.find((x) => x.id === sid);
          if (r) source = { kind, id: r.id, label: `Owner credit refund to ${String(r.payeeName)}, Lot ${lotNumber(r.lotId)}` };
        } else if (kind === "JOURNAL_ENTRY") {
          const o = originals.find((x) => x.id === sid);
          if (o) source = { kind, id: o.id, label: `Reverses journal entry ${String(o.entryNumber)}` };
        }
        if (source) break;
      }
    }
    for (const t of matched) if (t.matchedJournalEntryId === e.id) txnIds.add(t.id);
    for (const a of allocations) if (a.journalEntryId === e.id) txnIds.add(a.bankTransactionId);
    for (const l of lineTxns) if (l.journalEntryId === e.id && l.bankTransactionId) txnIds.add(l.bankTransactionId);
    const bankTransactions = [...txnIds].map((id) => txnById.get(id)).filter((t) => !!t).map((t) => toTxn(t!));
    for (const t of bankTransactions) docList.push(...txnDocs.filter((d) => d.bankTransactionId === t.id).map(toDoc));
    const seen = new Set<string>();
    out.set(e.id, { source, documents: docList.filter((d) => (seen.has(d.id) ? false : (seen.add(d.id), true))), bankTransactions });
  }
  return out;
}
