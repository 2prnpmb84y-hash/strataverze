/**
 * Audit export (server side): one zip for the auditor with the general
 * ledger, trial balance, journal with source links, bank reconciliation and
 * the audit trail, for a financial year.
 */
import { zipSync, strToU8 } from "fflate";
import { schemeTimeZone } from "@/lib/jurisdiction/scheme-time";
import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";
import type { TimestampString } from "@prisma/orm-postgres/target/codec-types";
import { toCents } from "@/lib/billing/money";
import { getTrialBalanceReport } from "@/lib/queries/reports";
import { formatAuditTrailCsv, getAuditTrailForExport } from "@/lib/queries/activity-log";
import { financialYearRange } from "./statutory-pack";
import { csv } from "./csv";
import { inLedger } from "@/lib/finance/ledger-status";

const ts = (v: string) => v as unknown as TimestampString<3>;
const isoDay = (v: unknown) => String(v ?? "").slice(0, 10);
const money = (cents: number) => (cents / 100).toFixed(2);

/** Where in StrataVerze a journal entry's source can be seen. */
export function sourceLink(schemeId: string, entry: { id: string; sourceType: string | null; sourceId: string | null }): string {
  const base = `/adviser/schemes/${schemeId}/finance`;
  switch (entry.sourceType) {
    case "INVOICE":
      return entry.sourceId ? `${base}/invoices/${entry.sourceId}` : `${base}/journal/${entry.id}`;
    case "LEVY_RAISED":
      return entry.sourceId ? `${base}/levies/${entry.sourceId}` : `${base}/journal/${entry.id}`;
    default:
      return `${base}/journal/${entry.id}`;
  }
}

export async function buildAuditExport(schemeId: string, financialYear: number): Promise<{ fileName: string; zip: Uint8Array }> {
  const scheme = await db.orm.public.Scheme.where((s) => s.id.eq(schemeId)).first();
  if (!scheme) throw new Error("Scheme not found.");
  const { start, end } = financialYearRange(financialYear, String(scheme.financialYearEnd ?? "06-30"));

  const [entries, txns, accounts, trial, trail] = await Promise.all([
    db.orm.public.JournalEntry
      .where((je) => and(je.schemeId.eq(schemeId), je.transactionDate.lte(ts(end))))
      .include("lines", (l) => l.include("accountCode").include("fund"))
      .orderBy([(je) => je.transactionDate.asc(), (je) => je.entryNumber.asc()])
      .limit(50000)
      .all(),
    db.orm.public.BankTransaction
      .where((t) => and(t.schemeId.eq(schemeId), t.transactionDate.gte(ts(start)), t.transactionDate.lte(ts(end))))
      .include("bankAccount")
      .orderBy((t) => t.transactionDate.asc())
      .limit(50000)
      .all(),
    db.orm.public.AccountCode.where((a) => a.schemeId.eq(schemeId)).limit(1000).all(),
    getTrialBalanceReport(schemeId, end, null),
    getAuditTrailForExport(schemeId, { startDate: start, endDate: end }),
  ]);
  const allocations = txns.length
    ? await db.orm.public.BankTransactionAllocation.where((a) => a.bankTransactionId.in(txns.map((t) => t.id))).limit(100000).all()
    : [];
  const entryNumber = new Map(entries.map((e) => [e.id, String(e.entryNumber)]));

  // General ledger: posted lines by account, with the opening balance at the start of the year.
  const posted = entries.filter((e) => inLedger(e.status));
  const gl: unknown[][] = [["Account code", "Account name", "Fund", "Date", "Entry", "Description", "Debit", "Credit", "Balance"]];
  for (const a of [...accounts].sort((x, y) => String(x.code).localeCompare(String(y.code)))) {
    const lines = posted.flatMap((e) => (e.lines ?? []).filter((l) => l.accountCodeId === a.id).map((l) => ({ e, l })));
    if (lines.length === 0) continue;
    const debitNormal = a.accountType === "ASSET" || a.accountType === "EXPENSE";
    const move = (l: (typeof lines)[number]["l"]) => (debitNormal ? 1 : -1) * (toCents(String(l.debit ?? 0)) - toCents(String(l.credit ?? 0)));
    let balance = lines.filter(({ e }) => isoDay(e.transactionDate) < start).reduce((s, { l }) => s + move(l), 0);
    gl.push([a.code, a.name, "", start, "", "Opening balance", "", "", money(balance)]);
    for (const { e, l } of lines.filter(({ e }) => isoDay(e.transactionDate) >= start)) {
      balance += move(l);
      gl.push([
        a.code,
        a.name,
        l.fund?.name ?? "",
        isoDay(e.transactionDate),
        e.entryNumber,
        l.description ?? e.description,
        money(toCents(String(l.debit ?? 0))),
        money(toCents(String(l.credit ?? 0))),
        money(balance),
      ]);
    }
  }

  const tb: unknown[][] = [["Account code", "Account name", "Type", "Fund", "Debit", "Credit"]];
  for (const l of trial.lines) tb.push([l.accountCode, l.accountName, l.accountType, l.fundName, l.debitBalance.toFixed(2), l.creditBalance.toFixed(2)]);
  tb.push(["", "Total", "", "", trial.totalDebits.toFixed(2), trial.totalCredits.toFixed(2)]);

  const journal: unknown[][] = [["Entry", "Date", "Status", "Type", "Source type", "Source id", "Source link", "Description", "Debits", "Credits"]];
  for (const e of entries.filter((x) => isoDay(x.transactionDate) >= start)) {
    const d = (e.lines ?? []).reduce((s, l) => s + toCents(String(l.debit ?? 0)), 0);
    const c = (e.lines ?? []).reduce((s, l) => s + toCents(String(l.credit ?? 0)), 0);
    journal.push([e.entryNumber, isoDay(e.transactionDate), e.status, e.entryType, e.sourceType ?? "", e.sourceId ?? "", sourceLink(schemeId, e), e.description, money(d), money(c)]);
  }

  const bank: unknown[][] = [["Date", "Bank account", "Description", "Reference", "Amount", "Statement balance", "Status", "Allocated", "Allocated to"]];
  for (const t of txns) {
    const own = allocations.filter((a) => a.bankTransactionId === t.id);
    bank.push([
      isoDay(t.transactionDate),
      t.bankAccount?.accountName ?? "",
      t.description,
      t.reference ?? "",
      money(toCents(String(t.amount))),
      t.balance == null ? "" : money(toCents(String(t.balance))),
      t.isDuplicate ? "DUPLICATE" : t.reconciliationStatus,
      money(own.reduce((s, a) => s + toCents(String(a.amount)), 0)),
      own.map((a) => `${entryNumber.get(a.journalEntryId) ?? a.journalEntryId} ${money(toCents(String(a.amount)))}`).join("; "),
    ]);
  }

  const readme = [
    `Audit export for ${scheme.name}${scheme.planNumber ? ` (SP ${scheme.planNumber})` : ""}`,
    `Financial year ${start} to ${end}. Generated ${new Date().toISOString()} by StrataVerze.`,
    "",
    "general-ledger.csv     Posted lines by account, with the opening balance at the start of the year.",
    "trial-balance.csv      Balances at the end of the year.",
    "journal.csv            Every journal entry in the year with its source and a link to it in StrataVerze.",
    "bank-reconciliation.csv Bank transactions in the year, their status and what each is allocated to.",
    "audit-trail.csv        Who did what in the scheme during the year.",
  ].join("\r\n");

  const zip = zipSync({
    "README.txt": strToU8(readme),
    "general-ledger.csv": strToU8(csv(gl)),
    "trial-balance.csv": strToU8(csv(tb)),
    "journal.csv": strToU8(csv(journal)),
    "bank-reconciliation.csv": strToU8(csv(bank)),
    "audit-trail.csv": strToU8(formatAuditTrailCsv(trail, await schemeTimeZone(schemeId))),
  });
  const name = String(scheme.planNumber ? `SP${scheme.planNumber}` : scheme.name).replace(/[^A-Za-z0-9]+/g, "-");
  return { fileName: `audit-export-${name}-FY${financialYear}.zip`, zip };
}
