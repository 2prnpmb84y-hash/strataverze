import { notFound } from "next/navigation";
import { getSchemeById } from "@/lib/queries/schemes";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getJournalEntryById } from "@/lib/queries/journal-entries";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { JournalEntryActions } from "./journal-entry-actions";

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

const statusLabels: Record<string, string> = {
  DRAFT: "Draft",
  POSTED: "Posted",
  REVERSED: "Reversed",
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
      <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-foreground">
        {value ? String(value) : "—"}
      </dd>
    </div>
  );
}

export default async function JournalEntryDetailPage({
  params,
}: {
  params: Promise<{ id: string; entryId: string }>;
}) {
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

  const lines = entry.lines ?? [];
  const totalDebits = lines.reduce(
    (sum, line) => sum + Number(line.debit ?? 0),
    0,
  );
  const totalCredits = lines.reduce(
    (sum, line) => sum + Number(line.credit ?? 0),
    0,
  );

  const status = String(entry.status);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Journal Entry ${String(entry.entryNumber)}`}
        backHref={`/adviser/schemes/${id}/finance/journal`}
        backLabel="Journal"
      />

      {/* Entry Details */}
      <Card>
        <CardHeader
          title="Entry Details"
          action={
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                statusStyles[status] ?? "bg-zinc-100 text-zinc-600"
              }`}
            >
              {statusLabels[status] ?? status}
            </span>
          }
        />
        <dl className="grid grid-cols-1 gap-4 px-6 pb-6 sm:grid-cols-2 lg:grid-cols-3">
          <DetailItem
            label="Entry Number"
            value={String(entry.entryNumber)}
          />
          <DetailItem
            label="Transaction Date"
            value={formatDate(entry.transactionDate)}
          />
          <DetailItem label="Entry Type" value={String(entry.entryType)} />
          <DetailItem
            label="Source Type"
            value={String(entry.sourceType)}
          />
          <DetailItem
            label="Description"
            value={String(entry.description)}
          />
          {entry.postedAt && (
            <DetailItem
              label="Posted At"
              value={formatDate(entry.postedAt)}
            />
          )}
        </dl>
      </Card>

      {/* Journal Lines */}
      <Card>
        <CardHeader
          title="Journal Lines"
          description={`${lines.length} line${lines.length !== 1 ? "s" : ""}`}
        />

        {/* Table header */}
        <div className="hidden sm:grid sm:grid-cols-[1fr_120px_120px_120px_100px] gap-4 px-6 pb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide border-b border-border">
          <div>Account</div>
          <div>Fund</div>
          <div className="text-right">Debit</div>
          <div className="text-right">Credit</div>
          <div className="text-right">GST</div>
        </div>

        <div className="divide-y divide-border">
          {lines.map((line, idx) => (
            <div
              key={String(line.id ?? idx)}
              className="grid grid-cols-1 sm:grid-cols-[1fr_120px_120px_120px_100px] gap-2 sm:gap-4 px-6 py-3 items-center"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {line.accountCode
                    ? `${String(line.accountCode.code)} — ${String(line.accountCode.name)}`
                    : "—"}
                </p>
                {line.description && (
                  <p className="text-xs text-muted-foreground truncate">
                    {String(line.description)}
                  </p>
                )}
                {(line.lot || line.supplier) && (
                  <p className="text-xs text-muted-foreground">
                    {line.lot && <span>Lot {String(line.lot.lotNumber ?? line.lot.id)}</span>}
                    {line.lot && line.supplier && <span> · </span>}
                    {line.supplier && <span>{String(line.supplier.companyName)}</span>}
                  </p>
                )}
              </div>
              <div className="text-sm text-muted-foreground truncate">
                {line.fund ? String(line.fund.name) : "—"}
              </div>
              <div className="text-sm text-foreground text-right font-medium">
                {Number(line.debit ?? 0) > 0
                  ? formatCurrency(line.debit)
                  : "—"}
              </div>
              <div className="text-sm text-foreground text-right font-medium">
                {Number(line.credit ?? 0) > 0
                  ? formatCurrency(line.credit)
                  : "—"}
              </div>
              <div className="text-sm text-muted-foreground text-right">
                {Number(line.gstAmount ?? 0) > 0
                  ? formatCurrency(line.gstAmount)
                  : "—"}
              </div>
            </div>
          ))}
        </div>

        {/* Totals row */}
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px_120px_120px_100px] gap-2 sm:gap-4 px-6 py-3 border-t-2 border-border bg-muted/30">
          <div className="text-sm font-semibold text-foreground">Totals</div>
          <div />
          <div className="text-sm font-semibold text-foreground text-right">
            {formatCurrency(totalDebits)}
          </div>
          <div className="text-sm font-semibold text-foreground text-right">
            {formatCurrency(totalCredits)}
          </div>
          <div />
        </div>
      </Card>

      {/* Actions */}
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
    </div>
  );
}
