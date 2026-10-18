import { db } from "@/prisma/db";
import type { TimestampString } from "@prisma/orm-postgres/target/codec-types";
import {
  normalisePagination,
  paginate,
  type PaginatedResult,
  type PaginationParams,
} from "@/lib/pagination";

function toTimestamp(value: string): TimestampString<3> {
  return value as unknown as TimestampString<3>;
}

export type ActivityAction =
  | "LEVY_CREATED"
  | "LEVY_ISSUED"
  | "LEVIES_GENERATED"
  | "INVITATION_SENT"
  | "INVITATION_ACCEPTED"
  | "INVITATION_DECLINED"
  | "INVITATION_REVOKED"
  | "MEMBER_JOINED"
  | "MEMBER_REMOVED"
  | "DOCUMENT_UPLOADED"
  | "WORK_ORDER_CREATED"
  | "WORK_ORDER_COMPLETED"
  | "MEETING_SCHEDULED"
  | "COMPLIANCE_UPDATED"
  | "SCHEME_UPDATED"
  | "FUND_CREATED"
  | "LOT_CREATED"
  | "LEVY_PAYMENT_RECORDED"
  | "ANNOUNCEMENT_PUBLISHED"
  | "BYLAW_CREATED"
  | "BYLAW_UPDATED"
  | "INSURANCE_CREATED"
  | "INSURANCE_UPDATED"
  | "CONTACT_CREATED"
  | "CONTACT_UPDATED"
  | "QUOTE_SUBMITTED"
  | "QUOTE_WITHDRAWN"
  | "INVOICE_SUBMITTED"
  | "WORK_ORDER_STATUS_UPDATED"
  // Financial module actions
  | "CHART_OF_ACCOUNTS_SEEDED"
  | "ACCOUNT_CODE_CREATED"
  | "ACCOUNT_CODE_DEACTIVATED"
  | "BANK_ACCOUNT_CREATED"
  | "BANK_ACCOUNT_DEACTIVATED"
  | "JOURNAL_ENTRY_CREATED"
  | "JOURNAL_ENTRY_POSTED"
  | "JOURNAL_ENTRY_REVERSED"
  | "BANK_TRANSACTIONS_IMPORTED"
  | "BANK_TRANSACTION_MATCHED"
  | "BANK_TRANSACTION_RECONCILED"
  | "BANK_TRANSACTION_EXCLUDED"
  | "BANK_TRANSACTION_UNMATCHED"
  | "LEVY_SCHEDULE_CREATED"
  | "LEVY_NOTICES_ISSUED"
  | "FINANCIAL_SUPPLIER_CREATED"
  | "SUPPLIER_INVOICE_CREATED"
  | "SUPPLIER_INVOICE_APPROVED"
  | "SUPPLIER_INVOICE_PAYMENT"
  | "SUPPLIER_INVOICE_CANCELLED"
  | "FINANCIAL_DOCUMENT_UPLOADED"
  | "FINANCIAL_DOCUMENT_REVIEWED"
  | "FINANCIAL_DOCUMENT_VERIFICATION_UPDATED"
  | "FINANCIAL_PERIODS_GENERATED"
  | "FINANCIAL_PERIOD_CLOSED"
  | "FINANCIAL_PERIOD_LOCKED"
  | "FINANCIAL_PERIOD_REOPENED"
  | "PAYMENT_CONFIRMATION_UPLOADED"
  | "BUDGET_LINE_CREATED"
  | "BUDGET_LINE_UPDATED"
  | "BUDGET_LINE_DELETED"
  | "INTEREST_CHARGED"
  | "MATCHING_RULE_CREATED"
  | "MATCHING_RULE_UPDATED"
  | "MATCHING_RULE_DELETED"
  | "AUTO_MATCH_RUN";

export type ActivityEntityType =
  | "Levy"
  | "Invitation"
  | "SchemeMembership"
  | "Document"
  | "WorkOrder"
  | "Meeting"
  | "ComplianceItem"
  | "Scheme"
  | "Fund"
  | "Lot"
  | "LevyItem"
  | "Announcement"
  | "ByLaw"
  | "InsurancePolicy"
  | "Contact"
  | "Quote"
  | "Invoice"
  // Financial module entity types
  | "AccountCode"
  | "SchemeBankAccount"
  | "JournalEntry"
  | "BankTransaction"
  | "LevySchedule"
  | "LevyNotice"
  | "Supplier"
  | "SupplierInvoice"
  | "FinancialDocument"
  | "FinancialPeriod"
  | "BudgetLine"
  | "MatchingRule";

type LogActivityData = {
  schemeId: string;
  actorId: string;
  action: ActivityAction;
  entityType: ActivityEntityType;
  entityId?: string;
  metadata?: Record<string, unknown>;
};

/**
 * Log an activity event for a scheme.
 */
export async function logActivity(data: LogActivityData) {
  return db.orm.public.ActivityLog.create({
    schemeId: data.schemeId,
    actorId: data.actorId,
    action: data.action,
    entityType: data.entityType,
    entityId: data.entityId ?? null,
    metadata: (data.metadata ?? null) as Parameters<typeof db.orm.public.ActivityLog.create>[0]["metadata"],
  });
}

/**
 * Log an activity event within an existing transaction.
 */
export async function logActivityTx(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  data: LogActivityData,
) {
  return tx.orm.public.ActivityLog.create({
    schemeId: data.schemeId,
    actorId: data.actorId,
    action: data.action,
    entityType: data.entityType,
    entityId: data.entityId ?? null,
    metadata: (data.metadata ?? null) as Parameters<typeof tx.orm.public.ActivityLog.create>[0]["metadata"],
  });
}

/**
 * Get recent activity for a scheme, newest first.
 */
export async function getActivityForScheme(
  schemeId: string,
  limit = 50,
) {
  return db.orm.public.ActivityLog
    .where((a) => a.schemeId.eq(schemeId))
    .include("actor")
    .orderBy((a) => a.createdAt.desc())
    .limit(limit)
    .all();
}

// ---------------------------------------------------------------------------
// Audit trail (filtered, paginated)
// ---------------------------------------------------------------------------

import {
  formatActionLabel,
  formatEntityTypeLabel,
  type AuditTrailFilters,
} from "./activity-log-utils";

export type { AuditTrailFilters } from "./activity-log-utils";
export { formatActionLabel, formatEntityTypeLabel } from "./activity-log-utils";

export type AuditTrailRow = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  createdAt: string;
  metadata: Record<string, unknown> | null;
  actorName: string;
  actorEmail: string;
};

/**
 * Fetch a paginated, filtered audit trail for a scheme.
 * Returns rows with actor display name pre-resolved.
 */
export async function getAuditTrail(
  schemeId: string,
  filters: AuditTrailFilters = {},
  pagination?: PaginationParams,
): Promise<PaginatedResult<AuditTrailRow>> {
  const { page, pageSize, limit } = normalisePagination(pagination);

  // Build the base query
  let query = db.orm.public.ActivityLog.where((a) => a.schemeId.eq(schemeId));

  // Apply filters
  if (filters.entityType) {
    query = query.where((a) => a.entityType.eq(filters.entityType!));
  }
  if (filters.action) {
    query = query.where((a) => a.action.eq(filters.action!));
  }
  if (filters.actorId) {
    query = query.where((a) => a.actorId.eq(filters.actorId!));
  }
  if (filters.startDate) {
    query = query.where((a) =>
      a.createdAt.gte(toTimestamp(`${filters.startDate!}T00:00:00.000Z`)),
    );
  }
  if (filters.endDate) {
    // End date is inclusive, so use start of next day
    const endPlusOne = new Date(filters.endDate!);
    endPlusOne.setDate(endPlusOne.getDate() + 1);
    query = query.where((a) =>
      a.createdAt.lt(toTimestamp(endPlusOne.toISOString())),
    );
  }

  const rows = await query
    .include("actor")
    .orderBy((a) => a.createdAt.desc())
    .offset((page - 1) * pageSize)
    .limit(limit)
    .all();

  const mapped: AuditTrailRow[] = rows.map((r) => ({
    id: r.id,
    action: r.action,
    entityType: r.entityType,
    entityId: r.entityId,
    createdAt: String(r.createdAt),
    metadata: r.metadata as Record<string, unknown> | null,
    actorName: r.actor
      ? `${String(r.actor.firstName)} ${String(r.actor.lastName)}`
      : "System",
    actorEmail: r.actor ? String(r.actor.email) : "",
  }));

  return paginate(mapped, page, pageSize);
}

/**
 * Fetch all audit trail rows (no pagination) for CSV export.
 * Limited to 10,000 rows to prevent memory issues.
 */
export async function getAuditTrailForExport(
  schemeId: string,
  filters: AuditTrailFilters = {},
): Promise<AuditTrailRow[]> {
  let query = db.orm.public.ActivityLog.where((a) => a.schemeId.eq(schemeId));

  if (filters.entityType) {
    query = query.where((a) => a.entityType.eq(filters.entityType!));
  }
  if (filters.action) {
    query = query.where((a) => a.action.eq(filters.action!));
  }
  if (filters.actorId) {
    query = query.where((a) => a.actorId.eq(filters.actorId!));
  }
  if (filters.startDate) {
    query = query.where((a) =>
      a.createdAt.gte(toTimestamp(`${filters.startDate!}T00:00:00.000Z`)),
    );
  }
  if (filters.endDate) {
    const endPlusOne = new Date(filters.endDate!);
    endPlusOne.setDate(endPlusOne.getDate() + 1);
    query = query.where((a) =>
      a.createdAt.lt(toTimestamp(endPlusOne.toISOString())),
    );
  }

  const rows = await query
    .include("actor")
    .orderBy((a) => a.createdAt.desc())
    .limit(10000)
    .all();

  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    entityType: r.entityType,
    entityId: r.entityId,
    createdAt: String(r.createdAt),
    metadata: r.metadata as Record<string, unknown> | null,
    actorName: r.actor
      ? `${String(r.actor.firstName)} ${String(r.actor.lastName)}`
      : "System",
    actorEmail: r.actor ? String(r.actor.email) : "",
  }));
}

/**
 * Generate CSV content from audit trail rows.
 */
export function formatAuditTrailCsv(rows: AuditTrailRow[]): string {
  const headers = [
    "Date/Time",
    "User",
    "Email",
    "Action",
    "Entity Type",
    "Entity ID",
    "Details",
  ];

  const escCsv = (val: string) => {
    if (val.includes(",") || val.includes('"') || val.includes("\n")) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
  };

  const lines = [headers.map(escCsv).join(",")];

  for (const row of rows) {
    const dateStr = new Date(row.createdAt).toLocaleString("en-AU", {
      timeZone: "Australia/Sydney",
    });
    const details = row.metadata
      ? Object.entries(row.metadata)
          .map(([k, v]) => `${k}: ${String(v)}`)
          .join("; ")
      : "";

    lines.push(
      [
        escCsv(dateStr),
        escCsv(row.actorName),
        escCsv(row.actorEmail),
        escCsv(formatActionLabel(row.action)),
        escCsv(formatEntityTypeLabel(row.entityType)),
        escCsv(row.entityId ?? ""),
        escCsv(details),
      ].join(","),
    );
  }

  return lines.join("\n");
}

/**
 * Get distinct actors who have activity in a scheme (for filter dropdown).
 */
export async function getAuditTrailActors(schemeId: string) {
  const rows = await db.orm.public.ActivityLog
    .where((a) => a.schemeId.eq(schemeId))
    .include("actor")
    .orderBy((a) => a.createdAt.desc())
    .limit(5000)
    .all();

  const seen = new Map<string, { id: string; name: string }>();
  for (const r of rows) {
    if (r.actor && !seen.has(r.actorId)) {
      seen.set(r.actorId, {
        id: r.actorId,
        name: `${String(r.actor.firstName)} ${String(r.actor.lastName)}`,
      });
    }
  }
  return Array.from(seen.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}


/**
 * Get recent activity across multiple schemes.
 */
export async function getActivityForSchemes(
  schemeIds: string[],
  limit = 50,
) {
  if (schemeIds.length === 0) return [];

  return db.orm.public.ActivityLog
    .where((a) => a.schemeId.in(schemeIds))
    .include("actor")
    .include("scheme")
    .orderBy((a) => a.createdAt.desc())
    .limit(limit)
    .all();
}
