import { db } from "@/prisma/db";
import { recordSecurityEventLater } from "@/lib/audit/security-audit";
import { and } from "@prisma/orm-postgres/orm-client";
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
  | "WORKS_REQUEST_SUBMITTED"
  | "WORKS_REQUEST_RESUBMITTED"
  | "WORKS_DECISION_PROPOSED"
  | "WORKS_DECISION_VOTED"
  | "WORKS_DECISION_MADE"
  | "WORKS_DECISION_NOT_AGREED"
  | "WORKS_DECISION_WITHDRAWN"
  | "WORKS_SETTINGS_UPDATED"
  | "WORKS_PREFERRED_CONTRACTOR_SET"
  | "WORKS_PREFERRED_CONTRACTOR_REMOVED"
  | "WORKS_ORDER_ISSUED"
  | "WORKS_ORDER_NO_CONTRACTOR"
  | "WORKS_ORDER_ACCEPTED"
  | "WORKS_ORDER_DECLINED"
  | "WORKS_ORDER_CANCELLED"
  | "WORKS_RFQ_OPENED"
  | "WORKS_COMPLETION_REPORTED"
  | "WORKS_COMPLETION_CONFIRMED"
  | "WORKS_COMPLETION_SENT_BACK"
  | "WORKS_INVOICE_SUBMITTED"
  | "WORKS_INVOICE_RETURNED"
  | "WORKS_INVOICE_SENT_TO_FINANCE"
  | "WORKS_CONTRACTORS_INVITED"
  | "WORKS_RFQ_DEADLINE_CHANGED"
  | "WORKS_QUOTE_SUBMITTED"
  | "WORKS_RFQ_CANCELLED"
  | "WORK_ORDER_COMPLETED"
  | "MEETING_SCHEDULED"
  | "COMPLIANCE_UPDATED"
  | "SCHEME_UPDATED"
  | "FUND_CREATED"
  | "LOT_CREATED"
  | "STRATA_ROLL_UPDATED"
  | "OWNER_CHANGED"
  | "ONBOARDING_INCOME_BUDGET_SAVED"
  | "LEVY_PAYMENT_RECORDED"
  | "ANNOUNCEMENT_PUBLISHED"
  | "BYLAW_CREATED"
  | "BYLAW_UPDATED"
  | "INSURANCE_CREATED"
  | "INSURANCE_UPDATED"
  | "INSURANCE_DELETED"
  | "INSURANCE_DOCUMENT_UPLOADED"
  | "INSURANCE_DOCUMENT_DELETED"
  | "INSURANCE_CLAIM_CREATED"
  | "INSURANCE_CLAIM_UPDATED"
  | "INSURANCE_CLAIM_LODGED"
  | "INSURANCE_CLAIM_STATUS_CHANGED"
  | "INSURANCE_RENEWAL_STARTED"
  | "INSURANCE_RENEWAL_UPDATED"
  | "INSURANCE_RENEWAL_STAGE_CHANGED"
  | "INSURANCE_RENEWAL_COMPLETED"
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
  | "LEVY_SCHEDULE_APPROVED"
  | "SPECIAL_LEVY_CREATED"
  | "YEAR_END_PACK_GENERATED"
  | "LEVY_NOTICES_ISSUED"
  | "LEVY_NOTICES_PLANNED"
  | "LEVY_NOTICES_HELD"
  | "LEVY_NOTICES_STOPPED"
  | "LEVIES_RAISED"
  | "FINANCIAL_SUPPLIER_CREATED"
  | "SUPPLIER_INVOICE_CREATED"
  | "SUPPLIER_INVOICE_EXTRACTION_REVIEWED"
  | "LEVY_RECEIPT_REVERSED"
  | "LEVY_RECEIPT_REALLOCATED"
  | "PAYMENT_CONFIRMATION_POSSIBLE_DUPLICATE"
  | "FINANCIAL_DOCUMENT_ACCESS_DENIED"
  | "DATA_MIGRATION_SIGNED_OFF"
  | "DATA_MIGRATION_EXECUTED"
  | "SUPPLIER_INVOICE_APPROVED"
  | "SUPPLIER_INVOICE_PAYMENT"
  | "SUPPLIER_INVOICE_CANCELLED"
  | "SUPPLIER_INVOICE_AUTHORISED"
  | "PAYMENT_CONTROL_EXCEPTION"
  | "PAYMENT_POLICY_UPDATED"
  | "TREASURER_SET"
  | "SUPPLIER_BANK_DETAILS_CHANGED"
  | "SUPPLIER_BANK_DETAILS_VERIFIED"
  | "SUPPLIER_BANK_DETAILS_REJECTED"
  | "WORKS_INVOICE_AUTHORISED"
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
  | "AUTO_MATCH_RUN"
  // Works compliance and approval actions
  | "COMPLIANCE_REQUIREMENT_CREATED"
  | "COMPLIANCE_REQUIREMENT_UPDATED"
  | "COMPLIANCE_REQUIREMENT_DEACTIVATED"
  | "COMPLIANCE_CHECK_SUBMITTED"
  | "COMPLIANCE_CHECK_VERIFIED"
  | "COMPLIANCE_CHECK_REJECTED"
  | "APPROVAL_ROUTE_CREATED"
  | "APPROVAL_ROUTE_UPDATED"
  | "DELEGATION_CREATED"
  | "DELEGATION_REVOKED"
  | "APPROVAL_APPROVED"
  | "APPROVAL_REJECTED"
  | "APPROVAL_DEFERRED"
  // Works variation actions
  | "VARIATION_CREATED"
  | "VARIATION_SUBMITTED"
  | "VARIATION_APPROVED"
  | "VARIATION_REJECTED"
  // Owner credits and statutory interest
  | "OWNER_CREDIT_RECEIVED"
  | "OWNER_CREDIT_APPLIED"
  | "OWNER_CREDIT_REFUND_REQUESTED"
  | "OWNER_CREDIT_REFUND_AUTHORISED"
  | "OWNER_CREDIT_REFUND_PAID"
  | "OWNER_CREDIT_REFUND_CANCELLED"
  | "OWNER_CREDIT_SETTING_CHANGED"
  // Reconciliation
  | "SUSPENSE_POSTED"
  | "SUSPENSE_CLEARED"
  | "BANK_CSV_MAPPING_SAVED"
  // Statutory reporting
  | "BUDGET_PROPOSED"
  | "BUDGET_ADOPTED"
  | "BUDGET_REVISION_STARTED"
  | "CAPITAL_WORKS_PLAN_CREATED"
  | "CAPITAL_WORKS_PLAN_UPDATED"
  | "CAPITAL_WORKS_PLAN_ADOPTED"
  | "CAPITAL_WORKS_LEVY_GENERATED"
  | "FUND_ACCOUNTING_BASIS_CHANGED"
  | "STATUTORY_PACK_ADOPTED"
  | "AUDIT_EXPORT_DOWNLOADED"
  | "INTEREST_SETTING_CHANGED"
  | "LEVY_NOTICES_EMAILED";

export type ActivityEntityType =
  | "MigrationBatch"
  | "Levy"
  | "Invitation"
  | "SchemeMembership"
  | "Document"
  | "WorkOrder"
  | "WorksRequest"
  | "Meeting"
  | "ComplianceItem"
  | "Scheme"
  | "Fund"
  | "Lot"
  | "LevyItem"
  | "Announcement"
  | "ByLaw"
  | "InsurancePolicy"
  | "InsuranceClaim"
  | "InsuranceRenewal"
  | "InsuranceDocument"
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
  | "MatchingRule"
  | "SchemePaymentPolicy"
  | "WorksInvoice"
  | "OwnerCreditRefund"
  | "Budget"
  | "CapitalWorksPlan"
  | "StatutoryPack"
  // Works compliance and approval entity types
  | "ComplianceRequirement"
  | "ComplianceCheck"
  | "ApprovalRoute"
  | "Delegation"
  | "ApprovalWorkflow"
  | "WorksVariation";

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
/**
 * Every activity log entry is also a security audit event (security stage
 * S6). The activity log is the building's own history and can be removed
 * with the building; the security audit log cannot be changed or deleted.
 * This gives the audit log every Adviser, committee and admin write that is
 * already logged as activity.
 */
/**
 * Metadata keys copied from an activity entry: ids, statuses, codes, counts,
 * amounts and dates only. Titles, names, descriptions, patterns and the
 * like stay in the building's activity log, which can be corrected.
 */
const MIRRORED_METADATA_KEYS: ReadonlySet<string> = new Set([
  "module", "kind", "amount", "totalAmount", "total", "count", "rows", "receipts", "removed",
  "status", "from", "to", "toStatus", "toStage", "stage", "verificationStatus",
  "version", "versionId", "sequence", "financialYear", "year", "category", "priority", "method",
  "meetingType", "matchType", "lotType", "fundType", "accountType", "dataType", "sourceSystem", "slot",
  "required", "complete", "control", "isTreasurer", "asPlatformAdmin", "privileged", "inTransaction",
  "id", "journalEntryId", "meetingId", "motionId", "contractId", "variationId", "requirementId", "quoteRequestId",
  "levyNoticeId", "lotId", "workOrderId", "checkId", "profileId", "routeId", "rfqId", "suspenseItemId",
  "successorPolicyId", "reversalId", "paymentDate", "paidOn", "reviewDue",
]);

async function mirrorToSecurityAudit(data: LogActivityData, inTransaction: boolean) {
  // After the response, so the user's request is not held up, and (for
  // logActivityTx) not while the transaction holds its connection.
  await recordSecurityEventLater({
    action: `activity.${String(data.action).toLowerCase()}`,
    outcome: /_DENIED$/.test(String(data.action)) ? "denied" : "allowed",
    actorProfileId: data.actorId,
    schemeId: data.schemeId,
    resourceType: String(data.entityType),
    resourceId: data.entityId ?? null,
    metadata: { ...(data.metadata ?? {}), inTransaction },
    metadataKeys: MIRRORED_METADATA_KEYS,
  });
}

export async function logActivity(data: LogActivityData) {
  const row = await db.orm.public.ActivityLog.create({
    schemeId: data.schemeId,
    actorId: data.actorId,
    action: data.action,
    entityType: data.entityType,
    entityId: data.entityId ?? null,
    metadata: (data.metadata ?? null) as Parameters<typeof db.orm.public.ActivityLog.create>[0]["metadata"],
  });
  await mirrorToSecurityAudit(data, false);
  return row;
}

/**
 * Log an activity event within an existing transaction.
 */
export async function logActivityTx(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  data: LogActivityData,
) {
  const row = await tx.orm.public.ActivityLog.create({
    schemeId: data.schemeId,
    actorId: data.actorId,
    action: data.action,
    entityType: data.entityType,
    entityId: data.entityId ?? null,
    metadata: (data.metadata ?? null) as Parameters<typeof tx.orm.public.ActivityLog.create>[0]["metadata"],
  });
  // Written after the response, outside the transaction (the audit chain
  // must not be held by it). If the transaction then fails, the event
  // remains, marked inTransaction.
  await mirrorToSecurityAudit(data, true);
  return row;
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
/** `timeZone`: the building's, for the date and time of each row. */
export function formatAuditTrailCsv(rows: AuditTrailRow[], timeZone: string): string {
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
    const dateStr = new Date(row.createdAt).toLocaleString("en-AU", { timeZone });
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
 * Get recent activity across multiple schemes. Pass `actions` to return only
 * those action types (an empty list returns nothing). Pages that show
 * activity to owners must pass an allow-list (see
 * src/lib/owner/notification-feed.ts) and filter per viewer.
 */
export async function getActivityForSchemes(
  schemeIds: string[],
  limit = 50,
  actions?: readonly string[],
) {
  if (schemeIds.length === 0) return [];
  if (actions && actions.length === 0) return [];

  return db.orm.public.ActivityLog
    .where((a) =>
      actions
        ? and(a.schemeId.in(schemeIds), a.action.in([...actions]))
        : a.schemeId.in(schemeIds),
    )
    .include("actor")
    .include("scheme")
    .orderBy((a) => a.createdAt.desc())
    .limit(limit)
    .all();
}
