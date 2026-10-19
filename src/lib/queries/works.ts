import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";

// ─── Works Requests ────────────────────────────────────────────

/**
 * Fetch works requests for a scheme with optional filters.
 */
export async function getWorksRequestsForScheme(
  schemeId: string,
  options: {
    status?: string;
    priority?: string;
    search?: string;
    limit?: number;
  } = {},
) {
  const { status, priority, limit = 200 } = options;

  let query = db.orm.public.WorksRequest
    .where((wr) => {
      let cond = and(wr.schemeId.eq(schemeId), wr.deletedAt.eq(null));
      if (status) cond = and(cond, wr.status.eq(status));
      if (priority) cond = and(cond, wr.priority.eq(priority));
      return cond;
    })
    .include("raisedBy")
    .include("assignedTo")
    .include("category")
    .orderBy((wr) => wr.createdAt.desc())
    .limit(limit);

  const results = await query.all();

  // Client-side search filter (title/description/requestNumber)
  if (options.search) {
    const term = options.search.toLowerCase();
    return results.filter(
      (r) =>
        r.title.toLowerCase().includes(term) ||
        r.description.toLowerCase().includes(term) ||
        r.requestNumber.toLowerCase().includes(term),
    );
  }

  return results;
}

/**
 * Fetch a single works request by ID with all related data.
 */
export async function getWorksRequestById(id: string) {
  return db.orm.public.WorksRequest
    .where((wr) => and(wr.id.eq(id), wr.deletedAt.eq(null)))
    .include("raisedBy")
    .include("assignedTo")
    .include("category")
    .include("versions", (v) => v.include("createdBy").orderBy((vr) => vr.versionNumber.desc()))
    .include("reviews", (r) => r.include("reviewer").orderBy((rv) => rv.createdAt.desc()))
    .include("scopes")
    .include("documents", (d) => d.include("uploadedBy").orderBy((dc) => dc.createdAt.desc()))
    .include("contracts")
    .include("invoices")
    .first();
}

/**
 * Count works requests by status for dashboard KPIs.
 */
export async function getWorksRequestStats(schemeId: string) {
  const requests = await db.orm.public.WorksRequest
    .where((wr) => and(wr.schemeId.eq(schemeId), wr.deletedAt.eq(null)))
    .all();

  const stats: Record<string, number> = {};
  for (const r of requests) {
    stats[r.status] = (stats[r.status] ?? 0) + 1;
  }

  return {
    total: requests.length,
    byStatus: stats,
    urgent: requests.filter((r) => r.isUrgent).length,
    overdue: requests.filter((r) => r.isOverdue).length,
    emergency: requests.filter((r) => r.isEmergency).length,
    withComplianceIssue: requests.filter((r) => r.hasComplianceIssue).length,
    withDispute: requests.filter((r) => r.hasDispute).length,
  };
}

// ─── Contractor Businesses ─────────────────────────────────────

/**
 * Fetch contractor businesses with optional filters.
 */
export async function getContractorBusinesses(
  options: {
    status?: string;
    search?: string;
    limit?: number;
  } = {},
) {
  const { status, limit = 200 } = options;

  const results = await db.orm.public.ContractorBusiness
    .where((cb) => {
      let cond = cb.deletedAt.eq(null);
      if (status) return and(cond, cb.status.eq(status));
      return cond;
    })
    .include("contacts")
    .orderBy((cb) => cb.companyName.asc())
    .limit(limit)
    .all();

  if (options.search) {
    const term = options.search.toLowerCase();
    return results.filter(
      (cb) =>
        cb.companyName.toLowerCase().includes(term) ||
        (cb.tradingName && cb.tradingName.toLowerCase().includes(term)) ||
        (cb.abn && cb.abn.includes(term)),
    );
  }

  return results;
}

/**
 * Fetch a single contractor business by ID with full compliance details.
 */
export async function getContractorBusinessById(id: string) {
  return db.orm.public.ContractorBusiness
    .where((cb) => and(cb.id.eq(id), cb.deletedAt.eq(null)))
    .include("contacts")
    .include("licences")
    .include("insurances")
    .include("complianceChecks", (cc) => cc.include("requirement"))
    .first();
}

// ─── RFQs ──────────────────────────────────────────────────────

/**
 * Fetch RFQs for a scheme with optional status filter.
 */
export async function getWorksRfqsForScheme(
  schemeId: string,
  options: { status?: string; limit?: number } = {},
) {
  const { status, limit = 200 } = options;

  return db.orm.public.WorksRfq
    .where((rfq) => {
      let cond = rfq.schemeId.eq(schemeId);
      if (status) return and(cond, rfq.status.eq(status));
      return cond;
    })
    .include("scope")
    .include("issuedBy")
    .orderBy((rfq) => rfq.createdAt.desc())
    .limit(limit)
    .all();
}

/**
 * Fetch a single RFQ by ID with full related data.
 */
export async function getWorksRfqById(id: string) {
  return db.orm.public.WorksRfq
    .where((rfq) => rfq.id.eq(id))
    .include("scope")
    .include("issuedBy")
    .include("invitations", (inv) => inv.include("contractorBusiness").include("invitedBy"))
    .include("clarifications", (cl) => cl.include("askedBy").include("answeredBy").orderBy((c) => c.askedAt.asc()))
    .include("addenda", (ad) => ad.include("issuedBy").orderBy((a) => a.addendumNumber.asc()))
    .include("quotations", (q) => q.include("contractorBusiness").orderBy((qt) => qt.createdAt.desc()))
    .include("evaluations", (ev) => ev.include("evaluator").include("criteria"))
    .first();
}

// ─── Contracts ─────────────────────────────────────────────────

/**
 * Fetch contracts for a scheme with optional status filter.
 */
export async function getWorksContractsForScheme(
  schemeId: string,
  options: { status?: string; limit?: number } = {},
) {
  const { status, limit = 200 } = options;

  return db.orm.public.WorksContract
    .where((c) => {
      let cond = and(c.schemeId.eq(schemeId), c.deletedAt.eq(null));
      if (status) return and(cond, c.status.eq(status));
      return cond;
    })
    .include("contractorBusiness")
    .include("request")
    .include("signedBy")
    .orderBy((c) => c.createdAt.desc())
    .limit(limit)
    .all();
}

/**
 * Fetch a single contract by ID with work orders, variations and invoices.
 */
export async function getWorksContractById(id: string) {
  return db.orm.public.WorksContract
    .where((c) => and(c.id.eq(id), c.deletedAt.eq(null)))
    .include("request")
    .include("contractorBusiness")
    .include("quotation")
    .include("signedBy")
    .include("workOrders", (wo) => wo.orderBy((w) => w.createdAt.desc()))
    .include("variations", (v) => v.include("requestedBy").include("approvedBy").orderBy((vr) => vr.variationNumber.asc()))
    .include("invoices", (inv) => inv.orderBy((i) => i.createdAt.desc()))
    .include("documents", (d) => d.include("uploadedBy").orderBy((dc) => dc.createdAt.desc()))
    .first();
}

// ─── Work Orders ───────────────────────────────────────────────

/**
 * Fetch a single works work order by ID with delivery tracking data.
 */
export async function getWorksWorkOrderById(id: string) {
  return db.orm.public.WorksWorkOrder
    .where((wo) => wo.id.eq(id))
    .include("contract")
    .include("contractorBusiness")
    .include("authorisedBy")
    .include("milestones", (m) => m.include("certifiedBy").orderBy((ms) => ms.sortOrder.asc()))
    .include("siteVisits", (sv) => sv.include("conductedBy").orderBy((s) => s.visitDate.desc()))
    .include("progressReports", (pr) => pr.include("submittedBy").orderBy((p) => p.reportDate.desc()))
    .include("inspections", (ins) => ins.include("inspector").include("defects").orderBy((i) => i.inspectionDate.desc()))
    .include("completionSubmissions", (cs) => cs.include("submittedBy").include("reviewedBy").orderBy((c) => c.submittedAt.desc()))
    .include("complianceChecks", (cc) => cc.include("requirement"))
    .first();
}

/**
 * Fetch all works work orders for a scheme.
 */
export async function getWorksWorkOrdersForScheme(
  schemeId: string,
  options: { status?: string; limit?: number } = {},
) {
  const { status, limit = 200 } = options;

  return db.orm.public.WorksWorkOrder
    .where((wo) => {
      let cond = wo.schemeId.eq(schemeId);
      if (status) return and(cond, wo.status.eq(status));
      return cond;
    })
    .include("contract")
    .include("contractorBusiness")
    .orderBy((wo) => wo.createdAt.desc())
    .limit(limit)
    .all();
}

// ─── Invoices ──────────────────────────────────────────────────

/**
 * Fetch invoices for a scheme with optional status filter.
 */
export async function getWorksInvoicesForScheme(
  schemeId: string,
  options: { status?: string; limit?: number } = {},
) {
  const { status, limit = 200 } = options;

  return db.orm.public.WorksInvoice
    .where((inv) => {
      let cond = inv.schemeId.eq(schemeId);
      if (status) return and(cond, inv.status.eq(status));
      return cond;
    })
    .include("contractorBusiness")
    .include("submittedBy")
    .include("contract")
    .orderBy((inv) => inv.createdAt.desc())
    .limit(limit)
    .all();
}

/**
 * Fetch a single invoice by ID with assessments, payment instructions and records.
 */
export async function getWorksInvoiceById(id: string) {
  return db.orm.public.WorksInvoice
    .where((inv) => inv.id.eq(id))
    .include("request")
    .include("contract")
    .include("milestone")
    .include("contractorBusiness")
    .include("submittedBy")
    .include("assessedBy")
    .include("paymentAssessments", (pa) => pa.include("assessor").orderBy((p) => p.assessedAt.desc()))
    .include("paymentInstructions", (pi) =>
      pi.include("authorisedBy")
        .include("bankDetailVersion")
        .include("paymentRecords", (pr) => pr.include("recordedBy"))
        .orderBy((p) => p.createdAt.desc()),
    )
    .include("documents", (d) => d.include("uploadedBy").orderBy((dc) => dc.createdAt.desc()))
    .first();
}

// ─── Dashboard Aggregation ─────────────────────────────────────

/**
 * Fetch aggregated dashboard data for a scheme's Works module.
 */
export async function getWorksDashboardData(schemeId: string) {
  const [requests, contracts, invoices, complianceChecks] = await Promise.all([
    db.orm.public.WorksRequest
      .where((wr) => and(wr.schemeId.eq(schemeId), wr.deletedAt.eq(null)))
      .all(),
    db.orm.public.WorksContract
      .where((c) => and(c.schemeId.eq(schemeId), c.deletedAt.eq(null)))
      .all(),
    db.orm.public.WorksInvoice
      .where((inv) => inv.schemeId.eq(schemeId))
      .all(),
    db.orm.public.WorksComplianceCheck
      .where((cc) => cc.status.eq("EXPIRED"))
      .all(),
  ]);

  // Request counts by status
  const requestsByStatus: Record<string, number> = {};
  for (const r of requests) {
    requestsByStatus[r.status] = (requestsByStatus[r.status] ?? 0) + 1;
  }

  // Contract counts by status
  const contractsByStatus: Record<string, number> = {};
  for (const c of contracts) {
    contractsByStatus[c.status] = (contractsByStatus[c.status] ?? 0) + 1;
  }

  // Invoice totals
  const pendingInvoices = invoices.filter((inv) =>
    ["SUBMITTED", "UNDER_ASSESSMENT", "FURTHER_INFORMATION", "APPROVED"].includes(inv.status),
  );
  const pendingInvoicesTotal = pendingInvoices.reduce(
    (sum, inv) => sum + Number(inv.claimedAmount),
    0,
  );

  const overdueInvoices = invoices.filter((inv) => {
    if (["PAID", "RECONCILED"].includes(inv.status)) return false;
    return new Date(inv.dueDate) < new Date();
  });

  return {
    requests: {
      total: requests.length,
      byStatus: requestsByStatus,
      urgent: requests.filter((r) => r.isUrgent).length,
      overdue: requests.filter((r) => r.isOverdue).length,
      emergency: requests.filter((r) => r.isEmergency).length,
    },
    contracts: {
      total: contracts.length,
      byStatus: contractsByStatus,
      active: contracts.filter((c) => ["EXECUTED", "ACTIVE"].includes(c.status)).length,
    },
    invoices: {
      total: invoices.length,
      pending: pendingInvoices.length,
      pendingTotal: pendingInvoicesTotal,
      overdue: overdueInvoices.length,
      overdueTotal: overdueInvoices.reduce(
        (sum, inv) => sum + Number(inv.claimedAmount),
        0,
      ),
    },
    compliance: {
      expired: complianceChecks.length,
    },
  };
}

// ─── Audit Events ──────────────────────────────────────────────

/**
 * Fetch audit events for a scheme, newest first.
 */
export async function getWorksAuditEvents(
  schemeId: string,
  options: { entityType?: string; entityId?: string; limit?: number } = {},
) {
  const { entityType, entityId, limit = 100 } = options;

  return db.orm.public.WorksAuditEvent
    .where((ae) => {
      let cond = ae.schemeId.eq(schemeId);
      if (entityType && entityId) return and(cond, ae.entityType.eq(entityType), ae.entityId.eq(entityId));
      if (entityType) return and(cond, ae.entityType.eq(entityType));
      if (entityId) return and(cond, ae.entityId.eq(entityId));
      return cond;
    })
    .include("actor")
    .orderBy((ae) => ae.createdAt.desc())
    .limit(limit)
    .all();
}

// ─── Notifications ─────────────────────────────────────────────

/**
 * Fetch unread works notifications for a user in a scheme.
 */
export async function getWorksNotifications(
  schemeId: string,
  recipientId: string,
  options: { unreadOnly?: boolean; limit?: number } = {},
) {
  const { unreadOnly = true, limit = 50 } = options;

  return db.orm.public.WorksNotification
    .where((n) => {
      const base = and(n.schemeId.eq(schemeId), n.recipientId.eq(recipientId));
      if (unreadOnly) return and(base, n.isRead.eq(false));
      return base;
    })
    .orderBy((n) => n.createdAt.desc())
    .limit(limit)
    .all();
}

// ─── Approvals ─────────────────────────────────────────────────

/**
 * Fetch pending approval workflows for a scheme.
 */
export async function getPendingApprovals(
  schemeId: string,
  options: { entityType?: string; limit?: number } = {},
) {
  const { entityType, limit = 100 } = options;

  return db.orm.public.WorksApprovalWorkflow
    .where((aw) => {
      const base = and(aw.schemeId.eq(schemeId), aw.status.eq("PENDING"));
      if (entityType) return and(base, aw.entityType.eq(entityType));
      return base;
    })
    .include("approvalRoute")
    .include("records", (r) => r.include("approver"))
    .orderBy((aw) => aw.createdAt.desc())
    .limit(limit)
    .all();
}

// ─── Compliance Requirements ──────────────────────────────────

/**
 * List compliance requirements for a scheme, with optional layer and active filters.
 */
export async function getComplianceRequirements(
  schemeId: string,
  options: { layer?: string; isActive?: boolean } = {},
) {
  const { layer, isActive } = options;

  return db.orm.public.WorksComplianceRequirement
    .where((cr) => {
      let cond = cr.schemeId.eq(schemeId);
      if (layer) cond = and(cond, cr.layer.eq(layer));
      if (isActive !== undefined) cond = and(cond, cr.isActive.eq(isActive));
      return cond;
    })
    .orderBy((cr) => cr.name.asc())
    .all();
}

/**
 * Fetch a single compliance requirement by ID, with its checks.
 */
export async function getComplianceRequirementById(id: string) {
  return db.orm.public.WorksComplianceRequirement
    .where((cr) => cr.id.eq(id))
    .include("checks", (ch) =>
      ch
        .include("contractorBusiness")
        .include("verifiedBy")
        .orderBy((c) => c.createdAt.desc()),
    )
    .first();
}

// ─── Compliance Checks ────────────────────────────────────────

/**
 * Fetch compliance checks for a specific contractor, optionally filtered by status.
 */
export async function getComplianceChecksForContractor(
  contractorBusinessId: string,
  options: { status?: string } = {},
) {
  const { status } = options;

  return db.orm.public.WorksComplianceCheck
    .where((cc) => {
      const base = cc.contractorBusinessId.eq(contractorBusinessId);
      if (status) return and(base, cc.status.eq(status));
      return base;
    })
    .include("requirement")
    .include("verifiedBy")
    .orderBy((cc) => cc.createdAt.desc())
    .all();
}

/**
 * Fetch all compliance checks across a scheme, filtered by status and/or layer.
 * Uses two queries because Prisma 8 .in() does not support subqueries.
 */
export async function getComplianceChecksForScheme(
  schemeId: string,
  options: { status?: string; layer?: string } = {},
) {
  const { status, layer } = options;

  // First get requirement IDs for this scheme (optionally filtered by layer)
  const requirements = await db.orm.public.WorksComplianceRequirement
    .where((cr) => {
      const base = cr.schemeId.eq(schemeId);
      if (layer) return and(base, cr.layer.eq(layer));
      return base;
    })
    .select("id")
    .all();

  const requirementIds = requirements.map((r) => r.id);
  if (requirementIds.length === 0) return [];

  return db.orm.public.WorksComplianceCheck
    .where((cc) => {
      const base = cc.requirementId.in(requirementIds);
      if (status) return and(base, cc.status.eq(status));
      return base;
    })
    .include("requirement")
    .include("contractorBusiness")
    .include("verifiedBy")
    .orderBy((cc) => cc.createdAt.desc())
    .all();
}

// ─── Approval Routes ──────────────────────────────────────────

/**
 * List approval routes for a scheme, ordered by sortOrder.
 */
export async function getApprovalRoutes(schemeId: string) {
  return db.orm.public.WorksApprovalRoute
    .where((ar) => ar.schemeId.eq(schemeId))
    .orderBy((ar) => ar.sortOrder.asc())
    .all();
}

/**
 * Fetch a single approval route by ID, with its workflows.
 */
export async function getApprovalRouteById(id: string) {
  return db.orm.public.WorksApprovalRoute
    .where((ar) => ar.id.eq(id))
    .include("workflows", (w) =>
      w
        .include("records", (r) => r.include("approver"))
        .orderBy((wf) => wf.createdAt.desc()),
    )
    .first();
}

// ─── Approval Workflows ──────────────────────────────────────

/**
 * Fetch a single approval workflow by ID with route and records.
 */
export async function getApprovalWorkflowById(id: string) {
  return db.orm.public.WorksApprovalWorkflow
    .where((aw) => aw.id.eq(id))
    .include("approvalRoute")
    .include("quotation")
    .include("records", (r) =>
      r
        .include("approver")
        .orderBy((rec) => rec.decidedAt.desc()),
    )
    .first();
}

// ─── Delegations ──────────────────────────────────────────────

/**
 * List delegations for a scheme, optionally filtered by active status.
 */
export async function getDelegations(
  schemeId: string,
  options: { isActive?: boolean } = {},
) {
  const { isActive } = options;

  return db.orm.public.WorksDelegation
    .where((d) => {
      const base = d.schemeId.eq(schemeId);
      if (isActive !== undefined) return and(base, d.isActive.eq(isActive));
      return base;
    })
    .include("delegatedBy")
    .include("delegatedTo")
    .orderBy((d) => d.createdAt.desc())
    .all();
}

/**
 * Fetch a single delegation by ID.
 */
export async function getDelegationById(id: string) {
  return db.orm.public.WorksDelegation
    .where((d) => d.id.eq(id))
    .include("delegatedBy")
    .include("delegatedTo")
    .first();
}

// ─── Variations ───────────────────────────────────────────────

/**
 * Fetch variations for a contract with optional status filter.
 */
export async function getVariationsForContract(
  contractId: string,
  options: { status?: string } = {},
) {
  const { status } = options;
  const results = await db.orm.public.WorksVariation
    .where((v) => {
      if (status) return and(v.contractId.eq(contractId), v.status.eq(status));
      return v.contractId.eq(contractId);
    })
    .include("requestedBy")
    .include("approvedBy")
    .orderBy((v) => v.variationNumber.asc())
    .all();
  return results;
}

/**
 * Fetch a single variation by ID with related data.
 */
export async function getVariationById(id: string) {
  return db.orm.public.WorksVariation
    .where((v) => v.id.eq(id))
    .include("requestedBy")
    .include("approvedBy")
    .include("contract")
    .first();
}
