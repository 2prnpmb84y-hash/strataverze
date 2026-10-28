import { notFound } from "next/navigation";
import { getSchemeById } from "@/lib/queries/schemes";
import { getCurrentProfile } from "@/lib/queries/profiles";
import Link from "next/link";
import { getJournalEntryById } from "@/lib/queries/journal-entries";
import { getEntrySources } from "@/lib/finance/report-drill-down";
import { formatAud } from "@/lib/billing/money";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { JournalEntryActions } from "./journal-entry-actions";
import { LevyReceiptPanel } from "./levy-receipt-panel";
import { getLevyReceipt, receiptReversalProblem } from "@/lib/finance/levy-receipt-reversal";
import { toCents } from "@/lib/billing/money";
import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";
import { connection } from "next/server";
import { rulesForState } from "@/lib/jurisdiction/scheme-rules";
import { entryTypeLabel, packWordsFor } from "@/lib/jurisdiction/screen-words";

function formatCurrency(value: number | string | null): string {
  const num = Number(value ?? 0);
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(num);
}

function formatDate(date: string | Date | null): string {
  if (!date) return "—";
  return new Date(String(date)).toLocaleDateString("en-AU");
}

const statusStyles: Record<string, string> = {
  DRAFT: "bg-zinc-100 text-zinc-600",
  POSTED: "bg-green-100 text-green-700",
  REVERSED: "bg-red-100 text-red-700",
};

function DetailItem({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div>
      <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-ink">{value || "—"}</dd>
    </div>
  );
}

export default async function JournalEntryDetailPage({
  params,
}: {
  params: Promise<{ id: string; entryId: string }>;
}) {
  await connection();
  const { id, entryId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();

  const isAdviser = scheme.memberships.some(
    (m) => m.profileId === profile.id && m.role === "ADVISER",
  );
  if (!isAdviser) notFound();

  const entry = await getJournalEntryById(entryId);
  // An entry is only shown under its own scheme.
  if (!entry || entry.schemeId !== id) notFound();
  const { rules } = rulesForState(scheme.state);
  const words = packWordsFor(rules);
  const sources = (await getEntrySources(id, [{ id: entry.id, sourceType: entry.sourceType, sourceId: entry.sourceId }], rules.TERMINOLOGY)).get(entry.id);
  const base = `/adviser/schemes/${id}/finance`;
  const sourceHref = (() => {
    const s = sources?.source;
    if (!s) return null;
    switch (s.kind) {
      case "SUPPLIER_INVOICE":
        return `${base}/invoices/${s.id}`;
      case "LEVY_SCHEDULE":
        return `${base}/levies/${s.id}`;
      case "LEVY_NOTICE":
        return s.levyScheduleId ? `${base}/levies/${s.levyScheduleId}` : null;
      case "BANK_TRANSACTION":
      case "SUSPENSE_ITEM":
        return `${base}/reconciliation`;
      case "OWNER_CREDIT":
      case "OWNER_CREDIT_REFUND":
        return `${base}/owner-credits`;
      case "JOURNAL_ENTRY":
        return `${base}/journal/${s.id}`;
      default:
        return null;
    }
  })();

  const status = String(entry.status);
  // A levy receipt is reversed or moved with its notices (TC-003, TC-008).
  const receipt = entry.sourceType === "PAYMENT" ? await getLevyReceipt(id, entry.id) : null;
  const isLevyReceipt = !!receipt && receipt.payments.length > 0;
  const receiptPanel =
    receipt && isLevyReceipt && status === "POSTED" && !receipt.payments.some((p) => p.reversedAt)
      ? await (async () => {
          const [openNotices, expenseAccounts] = await Promise.all([
            db.orm.public.LevyNotice.where((n) => and(n.schemeId.eq(id), n.status.in(["ISSUED", "PARTIALLY_PAID", "OVERDUE", "PAID"]))).include("lot").orderBy((n) => n.dueDate.desc()).limit(2000).all(),
            db.orm.public.AccountCode.where((a) => and(a.schemeId.eq(id), a.accountType.eq("EXPENSE"), a.isActive.eq(true))).orderBy((a) => a.code.asc()).limit(500).all(),
          ]);
          const current = new Set(receipt.payments.map((p) => p.levyNoticeId));
          return {
            totalCents: receipt.payments.reduce((s2, p) => s2 + toCents(String(p.amount)), 0) + receipt.credits.reduce((s2, c) => s2 + c.amountCents, 0),
            payments: receipt.payments.map((p) => {
              const n = receipt.notices.find((x) => x.id === p.levyNoticeId);
              return { id: p.id, label: `Notice ${String(n?.noticeNumber ?? "?")}, Lot ${String(n?.lot?.lotNumber ?? "?")}`, amountCents: toCents(String(p.amount)) };
            }).concat(receipt.credits.map((c) => ({ id: `credit-${c.id}`, label: `Held as Lot ${c.lotNumber}'s credit`, amountCents: c.amountCents }))),
            problems: {
              WRONG_LOT: receiptReversalProblem(receipt, "WRONG_LOT", words.levy),
              DISHONOURED: receiptReversalProblem(receipt, "DISHONOURED", words.levy),
              ENTERED_IN_ERROR: receiptReversalProblem(receipt, "ENTERED_IN_ERROR", words.levy),
            },
            notices: openNotices
              .filter((n) => !current.has(n.id))
              .map((n) => ({ id: n.id, label: `Lot ${String(n.lot?.lotNumber ?? "?")}, notice ${String(n.noticeNumber)} (owing $${String(n.balanceOutstanding)})` })),
            expenseAccounts: expenseAccounts.map((a) => ({ id: a.id, label: `${String(a.code)} ${String(a.name)}` })),
          };
        })()
      : null;
  const lines = entry.lines ?? [];

  const totalDebits = lines.reduce(
    (sum, line) => sum + Number(line.debit ?? 0),
    0,
  );
  const totalCredits = lines.reduce(
    (sum, line) => sum + Number(line.credit ?? 0),
    0,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Journal Entry ${String(entry.entryNumber)}`}
        backHref={`/adviser/schemes/${id}/finance/journal`}
        backLabel="Journal Entries"
      />

      {/* Status and type badges */}
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
            statusStyles[status] ?? "bg-zinc-100 text-zinc-600"
          }`}
        >
          {status}
        </span>
        <span className="inline-flex items-center rounded-full bg-zinc-100 text-zinc-600 px-3 py-1 text-xs font-medium">
          {entryTypeLabel(String(entry.entryType), words)}
        </span>
      </div>

      {entry.description && (
        <p className="text-sm text-ink-muted">
          {String(entry.description)}
        </p>
      )}

      {/* Entry details */}
      <Card>
        <CardHeader title="Entry Details" />
        <dl className="grid grid-cols-1 gap-4 px-6 pb-6 sm:grid-cols-2 lg:grid-cols-3">
          <DetailItem
            label="Transaction Date"
            value={formatDate(entry.transactionDate)}
          />
          <DetailItem
            label="Entry Number"
            value={entry.entryNumber ? String(entry.entryNumber) : null}
          />
          <DetailItem label="Entry Type" value={entryTypeLabel(String(entry.entryType), words)} />
          <DetailItem
            label="Source Type"
            value={entry.sourceType ? entryTypeLabel(String(entry.sourceType), words) : null}
          />
          <DetailItem
            label="Description"
            value={entry.description ? String(entry.description) : null}
          />
          <DetailItem
            label="Created"
            value={formatDate(entry.createdAt)}
          />
        </dl>
      </Card>

      {/* Where the entry came from */}
      <Card>
        <CardHeader title="Source" description="The record this entry was posted from, its documents and the bank transactions it was matched to." />
        <div className="space-y-2 text-sm">
          {sources?.source ? (
            sourceHref ? (
              <Link href={sourceHref} className="text-turquoise underline">
                {sources.source.label}
              </Link>
            ) : (
              <p className="text-ink">{sources.source.label}</p>
            )
          ) : (
            <p className="text-ink-muted">No source record. This entry was made by hand or by data migration.</p>
          )}
          {sources?.documents.map((d) => (
            <a key={d.id} href={`${base}/documents/${d.id}`} className="block text-turquoise underline">
              {d.fileName}
            </a>
          ))}
          {sources?.bankTransactions.map((t) => (
            <p key={t.id} className="text-ink-muted">
              Bank transaction {formatDate(t.date)}: {t.description} ({formatAud(t.amountCents)}, {t.status.toLowerCase()})
            </p>
          ))}
        </div>
      </Card>

      {/* Journal lines */}
      <Card>
        <CardHeader
          title="Journal Lines"
          description={`${lines.length} line${lines.length !== 1 ? "s" : ""}`}
        />

        {lines.length > 0 && (
          <>
            {/* Table header */}
            <div className="hidden sm:grid sm:grid-cols-[1.5fr_1fr_1fr_100px_100px] gap-4 px-6 pb-2 text-xs font-medium text-ink-muted uppercase tracking-wide border-b border-line">
              <div>Account</div>
              <div>Fund</div>
              <div>Description</div>
              <div className="text-right">Debit</div>
              <div className="text-right">Credit</div>
            </div>

            <div className="divide-y divide-line">
              {lines.map((line, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-1 sm:grid-cols-[1.5fr_1fr_1fr_100px_100px] gap-2 sm:gap-4 px-6 py-3 items-center"
                >
                  <div className="min-w-0">
                    <span className="font-mono text-xs text-ink-muted">
                      {String(line.accountCode.code)}
                    </span>{" "}
                    <span className="text-sm text-ink">
                      {String(line.accountCode.name)}
                    </span>
                  </div>
                  <div className="text-sm text-ink-muted truncate">
                    {line.fund?.name ? String(line.fund.name) : "—"}
                  </div>
                  <div className="text-sm text-ink-muted truncate">
                    {line.description ? String(line.description) : "—"}
                  </div>
                  <div className="text-sm text-ink text-right tabular-nums font-medium">
                    {line.debit ? formatCurrency(line.debit) : "—"}
                  </div>
                  <div className="text-sm text-ink text-right tabular-nums font-medium">
                    {line.credit ? formatCurrency(line.credit) : "—"}
                  </div>
                </div>
              ))}

              {/* Totals row */}
              <div className="grid grid-cols-1 sm:grid-cols-[1.5fr_1fr_1fr_100px_100px] gap-2 sm:gap-4 px-6 py-3 items-center bg-muted/30">
                <div className="text-sm font-semibold text-ink sm:col-span-3">
                  Totals
                </div>
                <div className="text-sm text-ink text-right tabular-nums font-semibold">
                  {formatCurrency(totalDebits)}
                </div>
                <div className="text-sm text-ink text-right tabular-nums font-semibold">
                  {formatCurrency(totalCredits)}
                </div>
              </div>
            </div>
          </>
        )}
      </Card>

      {receiptPanel && (
        <Card>
          <CardHeader title={`${words.Levy} receipt`} description="Reverse or move this receipt. Its notices are put back too, and the owner's statement shows the reversal." />
          <LevyReceiptPanel schemeId={id} entryId={entryId} {...receiptPanel} />
        </Card>
      )}

      {/* Actions */}
      {(status === "DRAFT" || status === "POSTED") && (
        <Card>
          <CardHeader title="Actions" />
          <div className="px-6 pb-6">
            <JournalEntryActions
              schemeId={id}
              entryId={entryId}
              currentStatus={status}
              hideReverse={isLevyReceipt}
            />
          </div>
        </Card>
      )}
    </div>
  );
}
