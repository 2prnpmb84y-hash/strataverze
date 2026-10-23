import Link from "next/link";
import { connection } from "next/server";
import { requirePageAccess } from "@/lib/auth/require-access";
import { getSchemeById } from "@/lib/queries/schemes";
import { getContractorBusinesses } from "@/lib/queries/works";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { StatusChip } from "@/components/ui/status-chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const statusLabel: Record<string, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  SUSPENDED: "Suspended",
  BLACKLISTED: "Blacklisted",
};

export default async function ContractorsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string; search?: string }>;
}) {
  await connection();
  const { id } = await params;
  const { status, search } = await searchParams;

  // Role check on this scheme (SEC-004 / H5): a page is a privileged read.
  const access = await requirePageAccess(id, "works.read");
  if (!access) return null;

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();

  // Only approved contractors and those linked to this scheme.
  const contractors = await getContractorBusinesses({ status, search, visibleToSchemeId: id });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contractor Registry"
        description="Manage contractors, compliance, and prequalification"
        backHref={`/adviser/schemes/${id}/works`}
        backLabel="Works"
        action={
          <Button href={`/adviser/schemes/${id}/works/contractors/new`}>
            Add Contractor
          </Button>
        }
      />

      {/* Filter bar */}
      <Card>
        <form className="flex flex-wrap items-end gap-3 p-4">
          <div>
            <label
              htmlFor="search"
              className="block text-xs font-medium text-ink-muted mb-1"
            >
              Search
            </label>
            <input
              id="search"
              name="search"
              type="text"
              defaultValue={search}
              placeholder="Company name, ABN..."
              className="rounded-[var(--radius-card)] border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-turquoise focus:border-turquoise w-56"
            />
          </div>
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
              className="rounded-[var(--radius-card)] border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-turquoise w-40"
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

      {/* Contractors list */}
      {contractors.length === 0 ? (
        <EmptyState
          icon={
            <svg
              width="48"
              height="48"
              viewBox="0 0 48 48"
              fill="none"
              aria-hidden="true"
            >
              <circle
                cx="24"
                cy="16"
                r="8"
                stroke="currentColor"
                strokeWidth="2"
              />
              <path
                d="M8 40c0-8.837 7.163-16 16-16s16 7.163 16 16"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          }
          title="No contractors registered"
          description="Add contractors to begin managing their compliance and prequalification for works procurement."
          actionLabel="Add Contractor"
          actionHref={`/adviser/schemes/${id}/works/contractors/new`}
        />
      ) : (
        <div className="flex flex-col gap-2">
          {contractors.map((contractor) => (
            <Link
              key={contractor.id}
              href={`/adviser/schemes/${id}/works/contractors/${contractor.id}`}
              className="flex items-center justify-between rounded-[var(--radius-card)] bg-white border border-line px-5 py-4 hover:border-turquoise/40 transition-colors"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-sm font-medium text-ink">
                    {contractor.companyName}
                  </p>
                  <StatusChip
                    status={
                      statusLabel[contractor.status] ?? contractor.status
                    }
                  />
                </div>
                <div className="flex items-center gap-4 text-xs text-ink-muted">
                  {contractor.tradingName && (
                    <span>Trading as: {contractor.tradingName}</span>
                  )}
                  {contractor.abn && <span>ABN: {contractor.abn}</span>}
                  {contractor.tradeCategories &&
                    contractor.tradeCategories.length > 0 && (
                      <span>
                        {(contractor.tradeCategories as string[]).join(", ")}
                      </span>
                    )}
                </div>
              </div>
              <div className="shrink-0 ml-4 text-right text-xs text-ink-muted">
                {contractor.contacts.length > 0 && (
                  <span>
                    {contractor.contacts.length} contact
                    {contractor.contacts.length === 1 ? "" : "s"}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
