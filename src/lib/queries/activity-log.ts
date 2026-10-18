import { db } from "@/prisma/db";

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
  | "BUDGET_LINE_DELETED";

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
  | "BudgetLine";

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
