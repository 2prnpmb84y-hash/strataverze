import { notFound } from "next/navigation";
import { connection } from "next/server";
import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";
import { getSchemeById } from "@/lib/queries/schemes";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getBankAccountsForScheme } from "@/lib/queries/bank-accounts";
import { getBankTransactionsForAccount } from "@/lib/queries/bank-transactions";
import { getAccountCodesForScheme } from "@/lib/queries/account-codes";
import { getAllocationCandidates, getSuspenseItems } from "@/lib/finance/bank-allocations";
import { transactionFeeTable } from "@/lib/billing/capture";
import { feeWordingFor } from "@/lib/billing/disclosure";
import { rulesForState } from "@/lib/jurisdiction/scheme-rules";
import { toCents } from "@/lib/billing/money";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/ui/stat-card";
import { PageHeader } from "@/components/ui/page-header";
import { AccountPicker } from "./account-picker";
import { AllocationWorkbench, type NoticeRow, type TxnRow } from "./allocation-workbench";

const isoDay = (v: unknown) => String(v ?? "").slice(0, 10);

export default async function ReconciliationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ account?: string }>;
}) {
  await connection();
  const { id } = await params;
  const { account } = await searchParams;
  const profile = await getCurrentProfile();
  if (!profile) return null;
  const scheme = await getSchemeById(id);
  if (!scheme) notFound();
  if (!scheme.memberships.some((m) => m.profileId === profile.id && m.role === "ADVISER")) notFound();

  const bankAccounts = await getBankAccountsForScheme(id);
  const header = (
    <PageHeader
      title="Bank Reconciliation"
      description="Allocate each bank transaction to what it paid for. One deposit can cover several levy notices, and one entry can take several payments."
    />
  );
  if (bankAccounts.length === 0) {
    return (
      <div className="space-y-6">
        {header}
        <EmptyState
          title="No bank accounts"
          description="Add a bank account and import transactions before reconciling."
          actionLabel="Add Bank Account"
          actionHref={`/adviser/schemes/${id}/finance/bank-accounts/new`}
        />
      </div>
    );
  }
  const selected = bankAccounts.find((b) => b.id === account) ?? null;
  const picker = (
    <AccountPicker
      schemeId={id}
      selectedId={selected?.id ?? ""}
      accounts={bankAccounts.map((b) => ({ id: b.id, label: `${b.accountName} (BSB ${b.bsb}, ${b.accountNumber})` }))}
    />
  );
  if (!selected) {
    return (
      <div className="space-y-6">
        {header}
        {picker}
      </div>
    );
  }

  const [txns, candidates, suspense, accountCodes, feeTable, openNotices] = await Promise.all([
    getBankTransactionsForAccount(selected.id),
    getAllocationCandidates(id),
    getSuspenseItems(id, "OPEN"),
    getAccountCodesForScheme(id),
    transactionFeeTable(feeWordingFor(rulesForState(scheme.state).rules)),
    db.orm.public.LevyNotice
      .where((n) => and(n.schemeId.eq(id), n.status.in(["ISSUED", "PARTIALLY_PAID", "OVERDUE"])))
      .include("lot")
      .include("fund")
      .orderBy((n) => n.dueDate.asc())
      .limit(3000)
      .all(),
  ]);

  const visible = txns.filter((t) => !t.isDuplicate);
  const allocations = visible.length
    ? await db.orm.public.BankTransactionAllocation.where((a) => a.bankTransactionId.in(visible.map((t) => t.id))).limit(20000).all()
    : [];
  const entryNumbers = new Map(
    (allocations.length
      ? await db.orm.public.JournalEntry.where((j) => j.id.in([...new Set(allocations.map((a) => a.journalEntryId))])).limit(20000).all()
      : []
    ).map((j) => [j.id, String(j.entryNumber)]),
  );
  const suspenseTxns = new Set(
    (await getSuspenseItems(id, "ALL")).map((s) => s.bankTransactionId),
  );
  const owners = new Map(
    (
      await db.orm.public.Profile.where((p) =>
        p.id.in([...new Set(openNotices.map((n) => n.ownerId).filter((x): x is string => !!x))].concat(["00000000-0000-0000-0000-000000000000"])),
      )
        .limit(5000)
        .all()
    ).map((p) => [p.id, `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim() || p.email]),
  );

  const toRow = (t: (typeof visible)[number]): TxnRow => {
    const own = allocations.filter((a) => a.bankTransactionId === t.id);
    return {
      id: t.id,
      date: isoDay(t.transactionDate),
      amountCents: toCents(String(t.amount)),
      description: String(t.description),
      reference: t.reference ? String(t.reference) : null,
      allocatedCents: own.reduce((s, a) => s + toCents(String(a.amount)), 0),
      status: t.reconciliationStatus,
      hasSuspense: suspenseTxns.has(t.id),
      allocations: own.map((a) => ({ label: entryNumbers.get(a.journalEntryId) ?? "Entry", amountCents: toCents(String(a.amount)) })),
    };
  };
  const unmatched = visible.filter((t) => t.reconciliationStatus === "UNMATCHED").map(toRow).sort((a, b) => a.date.localeCompare(b.date));
  const matched = visible.filter((t) => t.reconciliationStatus === "MATCHED").map(toRow);
  const count = (s: string) => visible.filter((t) => t.reconciliationStatus === s).length;

  const notices: NoticeRow[] = openNotices
    .map((n) => ({
      id: n.id,
      noticeNumber: String(n.noticeNumber),
      lotNumber: String(n.lot?.lotNumber ?? "?"),
      ownerName: n.ownerId ? (owners.get(n.ownerId) ?? "Owner") : "No owner recorded",
      fundName: String(n.fund?.name ?? "Fund"),
      dueDate: isoDay(n.dueDate),
      owingCents: toCents(String(n.balanceOutstanding)),
    }))
    .filter((n) => n.owingCents > 0);

  return (
    <div className="space-y-6">
      {header}
      {picker}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="To match" value={String(unmatched.length)} accent="bg-amber-500" />
        <StatCard label="Matched" value={String(matched.length)} accent="bg-blue-500" />
        <StatCard label="Reconciled" value={String(count("RECONCILED"))} accent="bg-green-500" />
        <StatCard label="In suspense" value={String(suspense.length)} accent="bg-red-500" />
      </div>
      <AllocationWorkbench
        schemeId={id}
        unmatched={unmatched}
        matched={matched}
        candidates={candidates.map((c) => ({
          id: c.id,
          entryNumber: c.entryNumber,
          date: c.date,
          description: c.description,
          bankSideCents: c.bankSideCents,
          remainingCents: c.remainingCents,
        }))}
        notices={notices}
        suspense={suspense.map((s) => ({ id: s.id, date: s.transactionDate, amountCents: s.amountCents, description: s.description }))}
        accounts={accountCodes
          .filter((a) => a.accountSubType !== "BANK" && a.accountSubType !== "SUSPENSE")
          .map((a) => ({ id: a.id, label: `${a.code} ${a.name}${a.fund ? ` (${a.fund.name})` : ""}` }))}
        feeTable={feeTable}
      />
    </div>
  );
}
