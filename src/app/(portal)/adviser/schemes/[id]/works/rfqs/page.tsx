import Link from "next/link";
import { connection } from "next/server";
import { requirePageAccess } from "@/lib/auth/require-access";
import { getSchemeById } from "@/lib/queries/schemes";
import { timeZoneOf } from "@/lib/jurisdiction/scheme-time";
import { formatDateTimeIn } from "@/lib/jurisdiction/time-zone";
import { getWorksRfqsForScheme } from "@/lib/queries/works";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { StatusChip } from "@/components/ui/status-chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/** An instant's date and time in the building's time zone (`tz`). */
function formatDateTime(date: Date | string | null, tz: string): string {
  if (!date) return "—";
  return formatDateTimeIn(tz, String(date), { hour: "2-digit" });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function computeRfqMeta(rfqs: any[]) {
  const nowMs = Date.now();
  return rfqs.map((rfq) => {
    const closingMs = new Date(rfq.closingDate).getTime();
    return {
      ...rfq,
      isClosingSoon:
        rfq.status === "OPEN" &&
        closingMs > nowMs &&
        closingMs - nowMs < 3 * 24 * 60 * 60 * 1000,
    };
  });
}

const statusLabel: Record<string, string> = {
  DRAFT: "Draft",
  ISSUED: "Issued",
  OPEN: "Open",
  CLOSED: "Closed",
  EVALUATION: "Under Evaluation",
  AWARDED: "Awarded",
  CANCELLED: "Cancelled",
};

export default async function RfqsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  await connection();
  const { id } = await params;
  const { status } = await searchParams;

  // Role check on this scheme (SEC-004 / H5): a page is a privileged read.
  const access = await requirePageAccess(id, "works.read");
  if (!access) return null;

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();
  const tz = timeZoneOf(scheme);

  const rfqs = await getWorksRfqsForScheme(id, { status });
  const rfqsWithMeta = computeRfqMeta(rfqs);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Requests for Quotation"
        description="Manage RFQs and contractor bidding"
        backHref={`/adviser/schemes/${id}/works`}
        backLabel="Works"
        action={
          <Button href={`/adviser/schemes/${id}/works/rfqs/new`}>
            New RFQ
          </Button>
        }
      />

      {/* Filter bar */}
      <Card>
        <form className="flex flex-wrap items-end gap-3 p-4">
          <div>
            <label
              htmlFor="status"
              className="block text-xs font-medium text-ink-muted mb-1"
            >
              Status
            </label>
            <select
              id="status"
              name="status"
              defaultValue={status ?? ""}
              className="rounded-[var(--radius-card)] border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-turquoise w-48"
            >
              <option value="">All statuses</option>
              {Object.entries(statusLabel).map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" variant="secondary">
            Filter
          </Button>
        </form>
      </Card>

      {/* RFQs list */}
      {rfqsWithMeta.length === 0 ? (
        <EmptyState
          icon={
            <svg
              width="48"
              height="48"
              viewBox="0 0 48 48"
              fill="none"
              aria-hidden="true"
            >
              <rect
                x="8"
                y="8"
                width="32"
                height="32"
                rx="3"
                stroke="currentColor"
                strokeWidth="2"
              />
              <path
                d="M16 18h16M16 24h12M16 30h8"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <circle cx="36" cy="36" r="6" fill="var(--bg, white)" stroke="currentColor" strokeWidth="2" />
              <path d="M34 36h4M36 34v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          }
          title="No RFQs found"
          description="Create an RFQ to invite contractors to bid on approved works."
          actionLabel="New RFQ"
          actionHref={`/adviser/schemes/${id}/works/rfqs/new`}
        />
      ) : (
        <div className="flex flex-col gap-2">
          {rfqsWithMeta.map((rfq) => {
            const { isClosingSoon } = rfq;

            return (
              <Link
                key={rfq.id}
                href={`/adviser/schemes/${id}/works/rfqs/${rfq.id}`}
                className="flex items-center justify-between rounded-[var(--radius-card)] bg-white border border-line px-5 py-4 hover:border-turquoise/40 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono text-ink-muted">
                      {rfq.rfqNumber}
                    </span>
                    <StatusChip
                      status={statusLabel[rfq.status] ?? rfq.status}
                    />
                    {isClosingSoon && (
                      <span className="inline-flex items-center rounded-full h-[22px] px-2.5 text-[11px] font-medium bg-amber-100 text-amber-700">
                        Closing Soon
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-medium text-ink truncate">
                    {rfq.title}
                  </p>
                  <div className="flex items-center gap-4 text-xs text-ink-muted mt-1">
                    {rfq.issuedBy && (
                      <span>
                        Issued by: {rfq.issuedBy.firstName} {rfq.issuedBy.lastName}
                      </span>
                    )}
                    <span>Closes: {formatDateTime(rfq.closingDate, tz)}</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
