import { notFound } from "next/navigation";
import { getSchemeById } from "@/lib/queries/schemes";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getJournalEntryById } from "@/lib/queries/journal-entries";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { JournalEntryActions } from "./journal-entry-actions";
import { connection } from "next/server";

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
  if (!entry) notFound();

  const status = String(entry.status);
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
          {String(entry.entryType)}
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
          <DetailItem label="Entry Type" value={String(entry.entryType)} />
          <DetailItem
            label="Source Type"
            value={entry.sourceType ? String(entry.sourceType) : null}
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

      {/* Actions */}
      {(status === "DRAFT" || status === "POSTED") && (
        <Card>
          <CardHeader title="Actions" />
          <div className="px-6 pb-6">
            <JournalEntryActions
              schemeId={id}
              entryId={entryId}
              currentStatus={status}
            />
          </div>
        </Card>
      )}
    </div>
  );
}
