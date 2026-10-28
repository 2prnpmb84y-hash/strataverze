"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader } from "@/components/ui/card";
import { SelectField } from "@/components/ui/form-field";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { exportAuditTrailAction } from "../../actions";
import {
  formatActionLabel,
  formatEntityTypeLabel,
  type AuditTrailFilters,
} from "@/lib/queries/activity-log-utils";
import type { PackWords } from "@/lib/jurisdiction/screen-words";

const inputClasses =
  "w-full rounded-[var(--radius-card)] border border-line bg-white px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-turquoise focus:border-turquoise transition-colors";

interface AuditTrailRow {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  createdAt: string;
  metadata: Record<string, unknown> | null;
  actorName: string;
  actorEmail: string;
}

// Entity type options for filter
const ENTITY_TYPES: string[] = [
  "AccountCode",
  "Announcement",
  "BankTransaction",
  "BudgetLine",
  "ByLaw",
  "ComplianceItem",
  "Contact",
  "Document",
  "FinancialDocument",
  "FinancialPeriod",
  "Fund",
  "InsurancePolicy",
  "Invitation",
  "Invoice",
  "JournalEntry",
  "Levy",
  "LevyItem",
  "LevyNotice",
  "LevySchedule",
  "Lot",
  "MatchingRule",
  "Meeting",
  "Quote",
  "Scheme",
  "SchemeBankAccount",
  "SchemeMembership",
  "Supplier",
  "SupplierInvoice",
  "WorkOrder",
];

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString("en-AU", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

export function AuditTrailClient({
  schemeId,
  rows,
  page,
  hasMore,
  actors,
  filters,
  basePath,
  readOnly,
  words,
}: {
  schemeId: string;
  rows: AuditTrailRow[];
  page: number;
  hasMore: boolean;
  actors: { id: string; name: string }[];
  filters: AuditTrailFilters;
  /** The building's words (packWordsFor), for the action and entity labels. */
  words: Pick<PackWords, "Levy" | "Levies" | "LateCharge">;
  basePath?: string;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isExporting, setIsExporting] = useState(false);
  const resolvedBasePath = basePath ?? `/adviser/schemes/${schemeId}/finance/reports/audit-trail`;

  function updateFilters(updates: Partial<AuditTrailFilters & { page: number }>) {
    const merged = { ...filters, ...updates };
    const params = new URLSearchParams();
    if (merged.startDate) params.set("startDate", merged.startDate);
    if (merged.endDate) params.set("endDate", merged.endDate);
    if (merged.entityType) params.set("entityType", merged.entityType);
    if (merged.action) params.set("action", merged.action);
    if (merged.actorId) params.set("actorId", merged.actorId);
    const pg = updates.page ?? 1;
    if (pg > 1) params.set("page", String(pg));
    const qs = params.toString();
    startTransition(() => {
      router.push(
        `${resolvedBasePath}${qs ? `?${qs}` : ""}`,
      );
    });
  }

  async function handleExport() {
    setIsExporting(true);
    try {
      const result = await exportAuditTrailAction(schemeId, filters);
      if (result.data) {
        const blob = new Blob([result.data.csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = result.data.filename;
        a.click();
        URL.revokeObjectURL(url);
      }
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card>
        <CardHeader
          title="Filters"
          description="Narrow the audit trail by date range, entity type, or user."
        />
        <div className="px-6 pb-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label
              htmlFor="startDate"
              className="block text-sm font-medium text-ink mb-1.5"
            >
              From Date
            </label>
            <input
              id="startDate"
              type="date"
              className={inputClasses}
              value={filters.startDate ?? ""}
              onChange={(e) => updateFilters({ startDate: e.target.value || undefined })}
            />
          </div>
          <div>
            <label
              htmlFor="endDate"
              className="block text-sm font-medium text-ink mb-1.5"
            >
              To Date
            </label>
            <input
              id="endDate"
              type="date"
              className={inputClasses}
              value={filters.endDate ?? ""}
              onChange={(e) => updateFilters({ endDate: e.target.value || undefined })}
            />
          </div>
          <SelectField
            label="Entity Type"
            name="entityType"
            value={filters.entityType ?? ""}
            onChange={(e) => updateFilters({ entityType: e.target.value || undefined })}
            options={[
              { value: "", label: "All entity types" },
              ...ENTITY_TYPES.map((et) => ({
                value: et,
                label: formatEntityTypeLabel(et, words),
              })),
            ]}
          />
          <SelectField
            label="User"
            name="actorId"
            value={filters.actorId ?? ""}
            onChange={(e) => updateFilters({ actorId: e.target.value || undefined })}
            options={[
              { value: "", label: "All users" },
              ...actors.map((a) => ({
                value: a.id,
                label: a.name,
              })),
            ]}
          />
          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-2">
            <Button
              onClick={() =>
                updateFilters({
                  startDate: undefined,
                  endDate: undefined,
                  entityType: undefined,
                  action: undefined,
                  actorId: undefined,
                })
              }
              className="text-sm px-3 py-1.5"
            >
              Clear Filters
            </Button>
            {!readOnly && (
              <Button
                onClick={handleExport}
                className="text-sm px-3 py-1.5"
                disabled={isExporting}
              >
                {isExporting ? "Exporting..." : "Export CSV"}
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Results */}
      {rows.length === 0 ? (
        <EmptyState
          title="No activity found"
          description="Adjust the filters above or check back later."
        />
      ) : (
        <Card>
          <CardHeader
            title="Activity Log"
            description={`Showing page ${page}${hasMore ? " (more available)" : ""}`}
          />

          {/* Table header (desktop) */}
          <div className="hidden lg:grid lg:grid-cols-[140px_1fr_140px_120px_1fr] gap-4 px-6 pb-2 text-xs font-medium text-ink-muted uppercase tracking-wide border-b border-line">
            <div>Date/Time</div>
            <div>Action</div>
            <div>Entity Type</div>
            <div>User</div>
            <div>Details</div>
          </div>

          <div className="divide-y divide-line">
            {rows.map((row) => (
              <div
                key={row.id}
                className="grid grid-cols-1 lg:grid-cols-[140px_1fr_140px_120px_1fr] gap-2 lg:gap-4 px-6 py-3 items-start"
              >
                <div className="text-sm text-ink-muted">
                  <div>{formatDate(row.createdAt)}</div>
                  <div className="text-xs">{formatTime(row.createdAt)}</div>
                </div>
                <div className="text-sm text-ink font-medium">
                  {formatActionLabel(row.action, words)}
                </div>
                <div className="text-sm text-ink-muted">
                  {formatEntityTypeLabel(row.entityType, words)}
                </div>
                <div className="text-sm text-ink truncate" title={row.actorEmail}>
                  {row.actorName}
                </div>
                <div className="text-sm text-ink-muted">
                  {row.metadata ? (
                    <MetadataDisplay metadata={row.metadata} />
                  ) : (
                    <span className="text-ink-muted/50">{"—"}</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-line">
            <Button
              onClick={() => updateFilters({ page: page - 1 })}
              disabled={page <= 1 || isPending}
              className="text-sm px-3 py-1.5"
            >
              Previous
            </Button>
            <span className="text-sm text-ink-muted">Page {page}</span>
            <Button
              onClick={() => updateFilters({ page: page + 1 })}
              disabled={!hasMore || isPending}
              className="text-sm px-3 py-1.5"
            >
              Next
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

/** Render metadata as key-value pairs. */
function MetadataDisplay({ metadata }: { metadata: Record<string, unknown> }) {
  const entries = Object.entries(metadata).filter(
    ([, v]) => v !== null && v !== undefined && v !== "",
  );
  if (entries.length === 0) return <span className="text-ink-muted/50">{"—"}</span>;

  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1">
      {entries.slice(0, 4).map(([key, value]) => (
        <span key={key} className="inline-flex gap-1">
          <span className="text-ink-muted">{formatMetaKey(key)}:</span>
          <span className="text-ink">{String(value)}</span>
        </span>
      ))}
      {entries.length > 4 && (
        <span className="text-ink-muted/50">
          +{entries.length - 4} more
        </span>
      )}
    </div>
  );
}

function formatMetaKey(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
