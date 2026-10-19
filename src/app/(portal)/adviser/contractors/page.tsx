import Link from "next/link";
import { connection } from "next/server";
import { getCurrentProfile } from "@/lib/queries/profiles";
import {
  getAllContractorBusinesses,
  getReviewQueueCounts,
  getExpiringDocuments,
} from "@/lib/queries/contractor";
import { Card, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { PageHeader } from "@/components/ui/page-header";

const STATUS_BADGE: Record<string, { label: string; colour: string }> = {
  DRAFT: { label: "Draft", colour: "bg-gray-100 text-gray-700" },
  SUBMITTED: { label: "Submitted", colour: "bg-amber-50 text-amber-700" },
  UNDER_REVIEW: { label: "Under Review", colour: "bg-blue-50 text-blue-700" },
  APPROVED: { label: "Approved", colour: "bg-emerald-50 text-emerald-700" },
  REJECTED: { label: "Rejected", colour: "bg-red-50 text-red-700" },
  SUSPENDED: { label: "Suspended", colour: "bg-red-50 text-red-700" },
  ACTIVE: { label: "Active", colour: "bg-emerald-50 text-emerald-700" },
  INACTIVE: { label: "Inactive", colour: "bg-gray-100 text-gray-600" },
};

function StatusBadge({ status }: { status: string }) {
  const info = STATUS_BADGE[status] ?? STATUS_BADGE.DRAFT;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${info.colour}`}
    >
      {info.label}
    </span>
  );
}

interface SearchParams {
  status?: string;
  search?: string;
  page?: string;
}

export default async function ContractorReviewPage(props: {
  searchParams: Promise<SearchParams>;
}) {
  await connection();
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const searchParams = await props.searchParams;
  const statusFilter = searchParams.status ?? "";
  const searchQuery = searchParams.search ?? "";
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10));
  const pageSize = 20;

  const [{ items: businesses, total }, queueCounts, expiringDocs] =
    await Promise.all([
      getAllContractorBusinesses({
        status: statusFilter || undefined,
        search: searchQuery || undefined,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      }),
      getReviewQueueCounts(),
      getExpiringDocuments(30),
    ]);

  const totalPending = Object.values(queueCounts).reduce(
    (sum, n) => sum + n,
    0,
  );
  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Contractor Management"
        description="Review contractor applications, compliance documents and manage registrations."
      />

      {/* Summary stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Pending Reviews"
          value={totalPending}
          accent={totalPending > 0 ? "bg-amber-500" : "bg-adviser"}
        />
        <StatCard
          label="New Applications"
          value={queueCounts["NEW_APPLICATION"] ?? 0}
          accent="bg-adviser"
        />
        <StatCard
          label="Expiring Documents"
          value={expiringDocs.length}
          accent={expiringDocs.length > 0 ? "bg-warning" : "bg-adviser"}
        />
        <StatCard
          label="Total Contractors"
          value={total}
          accent="bg-adviser"
        />
      </div>

      {/* Review queue shortcuts */}
      {totalPending > 0 && (
        <Card className="mb-6">
          <CardHeader title="Review Queue" />
          <div className="flex flex-wrap gap-2">
            {Object.entries(queueCounts)
              .sort(([, a], [, b]) => b - a)
              .map(([queueType, count]) => (
                <span
                  key={queueType}
                  className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200 px-3 py-1 text-xs font-medium text-amber-800"
                >
                  {queueType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                  <span className="rounded-full bg-amber-200 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">
                    {count}
                  </span>
                </span>
              ))}
          </div>
        </Card>
      )}

      {/* Expiring documents alert */}
      {expiringDocs.length > 0 && (
        <div className="rounded-[var(--radius-card)] bg-amber-50 border border-amber-200 px-4 py-3 mb-6">
          <p className="text-sm font-medium text-amber-800">
            {expiringDocs.length} document{expiringDocs.length !== 1 ? "s" : ""} expiring within 30 days
          </p>
          <div className="mt-2 space-y-1">
            {expiringDocs.slice(0, 5).map((doc) => (
              <p key={doc.id} className="text-xs text-amber-700">
                {doc.name} ({doc.type}) &mdash; {doc.daysUntilExpiry} day{doc.daysUntilExpiry !== 1 ? "s" : ""} remaining
              </p>
            ))}
            {expiringDocs.length > 5 && (
              <p className="text-xs text-amber-600 font-medium">
                +{expiringDocs.length - 5} more
              </p>
            )}
          </div>
        </div>
      )}

      {/* Filters */}
      <Card className="mb-6">
        <form method="get" className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">
              Status
            </label>
            <select
              name="status"
              defaultValue={statusFilter}
              className="rounded-[var(--radius-card)] border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-adviser focus:border-adviser"
            >
              <option value="">All statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="SUBMITTED">Submitted</option>
              <option value="UNDER_REVIEW">Under Review</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
              <option value="SUSPENDED">Suspended</option>
              <option value="ACTIVE">Active</option>
            </select>
          </div>

          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-ink-muted mb-1">
              Search
            </label>
            <input
              type="text"
              name="search"
              defaultValue={searchQuery}
              placeholder="Company or trading name..."
              className="w-full rounded-[var(--radius-card)] border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-adviser focus:border-adviser"
            />
          </div>

          <button
            type="submit"
            className="bg-adviser text-white rounded-[var(--radius-card)] px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Filter
          </button>
        </form>
      </Card>

      {/* Contractor list */}
      <Card>
        <CardHeader title={`Contractors (${String(total)})`} />

        {businesses.length === 0 ? (
          <p className="text-sm text-ink-muted">
            No contractors match the current filters.
          </p>
        ) : (
          <div className="space-y-2">
            {businesses.map((biz) => (
              <Link
                key={biz.id}
                href={`/adviser/contractors/${biz.id}`}
                className="flex items-center justify-between rounded-[var(--radius-card)] bg-muted px-4 py-3 hover:bg-muted/70 transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink truncate">
                    {String(biz.companyName ?? biz.tradingName ?? "Unnamed")}
                  </p>
                  <p className="text-xs text-ink-muted mt-0.5">
                    {biz.abn ? `ABN ${String(biz.abn)}` : "No ABN"}
                    {biz.tradingName && biz.companyName
                      ? ` · Trading as ${String(biz.tradingName)}`
                      : ""}
                  </p>
                </div>
                <StatusBadge status={String(biz.status ?? "DRAFT")} />
              </Link>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-line">
            <p className="text-xs text-ink-muted">
              Page {page} of {totalPages} ({total} total)
            </p>
            <div className="flex gap-2">
              {page > 1 && (
                <Link
                  href={`/adviser/contractors?status=${statusFilter}&search=${searchQuery}&page=${page - 1}`}
                  className="border border-line text-ink rounded-[var(--radius-card)] px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
                >
                  Previous
                </Link>
              )}
              {page < totalPages && (
                <Link
                  href={`/adviser/contractors?status=${statusFilter}&search=${searchQuery}&page=${page + 1}`}
                  className="border border-line text-ink rounded-[var(--radius-card)] px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
                >
                  Next
                </Link>
              )}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
