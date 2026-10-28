/**
 * The works pages and the admin security page show times in the right zone
 * (display time zone fix, 28 Oct 2026). Tests run with TZ=UTC, as the server
 * does, so each instant would show UTC's hour if a page formatted it in the
 * process's own zone. The works pages show the building's zone
 * (schemes.time_zone); the security page, which belongs to no building, shows
 * PLATFORM_TIME_ZONE (Sydney). Dates stored as calendar days (a due date, a
 * start date) are shown as they are stored, in every zone.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/** 2026-10-28T14:30:00Z: 29 Oct 2026, 1:30 am in Sydney (AEDT, +11) and 28 Oct 2026, 10:30 pm in Perth (+8). */
const AT = "2026-10-28T14:30:00.000Z";
/** A calendar day (a date column). */
const DAY = "2026-11-05";
const SHOWN = {
  "Australia/Sydney": { dateTime: "29 Oct 2026, 01:30 am", date: "29 Oct 2026" },
  "Australia/Perth": { dateTime: "28 Oct 2026, 10:30 pm", date: "28 Oct 2026" },
} as const;
type Zone = keyof typeof SHOWN;
const ZONES = Object.keys(SHOWN) as Zone[];

const fx = vi.hoisted(() => ({ timeZone: "Australia/Sydney", record: null as unknown, list: [] as unknown[], sessions: [] as unknown[], profiles: [] as unknown[] }));

vi.mock("next/server", () => ({ connection: async () => undefined }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("notFound");
  },
  redirect: () => {
    throw new Error("redirect");
  },
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/prisma/db", () => {
  const table = (name: string) => {
    const chain: Record<string, unknown> = {};
    Object.assign(chain, {
      where: () => chain,
      orderBy: () => chain,
      limit: () => chain,
      include: () => chain,
      first: async () => null,
      all: async () => (name === "AppSession" ? fx.sessions : name === "Profile" ? fx.profiles : []),
    });
    return chain;
  };
  return { db: { orm: { public: new Proxy({}, { get: (_t, name: string) => table(name) }) } } };
});
vi.mock("@/lib/auth/require-access", () => ({
  requirePageAccess: vi.fn(async () => ({ profile: { id: "p1" }, roles: ["ADVISER"] })),
  requirePlatformAdminPage: vi.fn(async () => ({ id: "admin-1" })),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ auth: { admin: { mfa: { listFactors: async () => ({ data: { factors: [] } }) } } } }),
}));
vi.mock("@/lib/queries/schemes", () => ({
  getSchemeById: vi.fn(async (id: string) => ({ id, name: "Harbour View", planNumber: "SP 1", state: "NSW", timeZone: fx.timeZone, memberships: [], lots: [] })),
}));
vi.mock("@/lib/queries/works", () => {
  const one = vi.fn(async () => fx.record);
  return {
    getWorksInvoiceById: one,
    getWorksRequestById: one,
    getWorksContractById: one,
    getVariationById: one,
    getWorksWorkOrderById: one,
    getWorksRfqById: one,
    getWorksAuditEvents: vi.fn(async () => fx.list),
    getWorksRfqsForScheme: vi.fn(async () => fx.list),
    getWorksRequestsForScheme: vi.fn(async () => fx.list),
    getWorksDashboardData: vi.fn(async () => ({
      requests: { total: 1, urgent: 0, overdue: 0 },
      contracts: { active: 0, totalValue: 0 },
      invoices: { pending: 0, outstanding: 0, totalClaimed: 0, totalPaid: 0 },
    })),
    getApprovalRoutes: vi.fn(async () => []),
    getPendingApprovals: vi.fn(async () => []),
    getDelegations: vi.fn(async () => fx.list),
    getComplianceRequirementById: one,
    getContractorBusinessById: one,
    isContractorVisibleToScheme: vi.fn(async () => true),
  };
});
vi.mock("@/lib/actions/works", () => new Proxy({}, { get: (_t, name) => (name === "then" ? undefined : vi.fn()) }));
vi.mock("@/lib/billing/capture", () => ({ previewUsageFee: vi.fn(async () => null) }));
vi.mock("@/lib/finance/control-view", () => ({ getInvoiceControlView: vi.fn(async () => null) }));
vi.mock("@/lib/works/view", () => ({ loadRequestView: vi.fn(async () => null) }));
vi.mock("@/lib/works/urgent-orders", () => ({ orderingState: vi.fn(async () => null) }));
vi.mock("@/lib/works/settings", () => ({ approvedContractors: vi.fn(async () => []) }));
vi.mock("@/lib/works/marketplace", () => ({ contractorsForDirectInvite: vi.fn(async () => []), rfqForCommittee: vi.fn(async () => null) }));
vi.mock("@/lib/works/completion", () => ({ closeOutForCommittee: vi.fn(async () => null) }));
vi.mock("@/app/(portal)/adviser/schemes/[id]/works/[requestId]/works-request-actions", () => ({ WorksRequestActions: () => null }));
vi.mock("@/components/billing/contractor-billing-note", () => ({ ContractorBillingNote: () => null }));
vi.mock("@/app/(portal)/admin/security/reset-mfa-form", () => ({ ResetMfaForm: () => null }));
vi.mock("@/app/(portal)/admin/security/sign-out-user-form", () => ({ SignOutUserForm: () => null }));

const { default: InvoicePage } = await import("@/app/(portal)/adviser/schemes/[id]/works/invoices/[invoiceId]/page");
const { default: AuditPage } = await import("@/app/(portal)/adviser/schemes/[id]/works/audit/page");
const { default: RequestPage } = await import("@/app/(portal)/adviser/schemes/[id]/works/[requestId]/page");
const { default: ContractPage } = await import("@/app/(portal)/adviser/schemes/[id]/works/contracts/[contractId]/page");
const { default: VariationPage } = await import("@/app/(portal)/adviser/schemes/[id]/works/contracts/[contractId]/variations/[variationId]/page");
const { default: WorkOrderPage } = await import("@/app/(portal)/adviser/schemes/[id]/works/work-orders/[workOrderId]/page");
const { default: RfqsPage } = await import("@/app/(portal)/adviser/schemes/[id]/works/rfqs/page");
const { default: RfqPage } = await import("@/app/(portal)/adviser/schemes/[id]/works/rfqs/[rfqId]/page");
const { default: SecurityPage } = await import("@/app/(portal)/admin/security/page");
const { default: WorksDashboardPage } = await import("@/app/(portal)/adviser/schemes/[id]/works/page");
const { default: ApprovalsPage } = await import("@/app/(portal)/adviser/schemes/[id]/works/approvals/page");
const { default: CompliancePage } = await import("@/app/(portal)/adviser/schemes/[id]/works/compliance/[requirementId]/page");
const { default: ContractorPage } = await import("@/app/(portal)/adviser/schemes/[id]/works/contractors/[contractorId]/page");

const person = { firstName: "Ann", lastName: "Lee" };
/** A page's props: the building's id and the record's (each page names its own). */
const params = (extra: Record<string, string> = {}) => ({ params: Promise.resolve({ id: "s1", ...extra }), searchParams: Promise.resolve({}) }) as never;

/** The page's text in `zone`. */
async function render(zone: Zone, page: () => Promise<unknown>): Promise<string> {
  fx.timeZone = zone;
  const html = renderToStaticMarkup((await page()) as React.ReactElement);
  return html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
}

const count = (text: string, s: string) => text.split(s).length - 1;

/**
 * Renders the page in Sydney and in Perth: every instant shows as a date and
 * time in that zone (`dateTimes` of them) or a date in that zone (`dates`),
 * never in the other zone, and `days` (calendar days) show the same in both.
 */
async function expectZoned(page: () => Promise<unknown>, want: { dateTimes: number; dates?: number; days?: number }) {
  for (const zone of ZONES) {
    const other = ZONES.find((z) => z !== zone)!;
    const text = await render(zone, page);
    expect(count(text, SHOWN[zone].dateTime), `${zone} date and time`).toBe(want.dateTimes);
    expect(text).not.toContain(SHOWN[other].dateTime);
    if (want.dates !== undefined) {
      // Each date and time also contains the date.
      expect(count(text, SHOWN[zone].date) - want.dateTimes, `${zone} dates`).toBe(want.dates);
      expect(text).not.toContain(SHOWN[other].date);
    }
    if (want.days) expect(count(text, "5 Nov 2026"), `${zone} calendar days`).toBe(want.days);
  }
}

beforeEach(() => {
  fx.record = null;
  fx.list = [];
  fx.sessions = [];
  fx.profiles = [];
});

describe("works pages show times in the building's time zone", () => {
  it("the invoice", async () => {
    fx.record = {
      id: "i1",
      schemeId: "s1",
      invoiceNumber: "INV-1",
      status: "SUBMITTED",
      contractorBusiness: { companyName: "Acme" },
      claimedAmount: "100",
      gstAmount: "10",
      paidAmount: "0",
      invoiceDate: DAY,
      dateReceived: DAY,
      dueDate: DAY,
      responseDeadline: AT,
      submittedBy: person,
      assessedBy: person,
      assessedAt: AT,
      contract: null,
      paymentAssessments: [{ id: "pa1", assessor: person, assessedAt: AT, assessedAmount: "100", comments: null }],
      paymentInstructions: [{ id: "pi1", beneficiary: "Acme", approvedAmount: "100", status: "AUTHORISED", authorisedAt: AT, authorisedBy: person, paymentRecords: [] }],
      documents: [{ id: "d1", fileName: "a.pdf", documentType: "INVOICE", createdAt: AT, uploadedBy: person }],
      lineItems: [],
    };
    await expectZoned(() => InvoicePage(params({ invoiceId: "i1" })), { dateTimes: 4, dates: 1, days: 3 });
  });

  it("the works audit log", async () => {
    fx.list = [{ id: "e1", action: "CREATED", entityType: "WorksRequest", createdAt: AT, actor: person, metadata: null }];
    await expectZoned(() => AuditPage(params()), { dateTimes: 1, dates: 0 });
  });

  it("the works request", async () => {
    fx.record = {
      id: "r1",
      schemeId: "s1",
      title: "Leak",
      requestNumber: "WR-1",
      status: "SUBMITTED",
      priority: "NORMAL",
      createdAt: AT,
      submittedAt: AT,
      closedAt: AT,
      raisedBy: person,
      raisedById: "p2",
      assignedTo: null,
      category: null,
      scopes: [],
      contracts: [],
      reviews: [{ id: "rv1", reviewedAt: AT, reviewer: person, decision: "APPROVED", comments: null }],
      versions: [{ id: "v1", versionNumber: 1, createdAt: AT, createdBy: person, changeReason: null }],
      documents: [{ id: "d1", fileName: "a.pdf", documentType: "PHOTO", createdAt: AT, uploadedBy: person }],
      invoices: [{ id: "i1", workOrderId: null, invoiceNumber: "INV-1", invoiceDate: DAY, claimedAmount: "100", status: "SUBMITTED" }],
    };
    await expectZoned(() => RequestPage(params({ requestId: "r1" })), { dateTimes: 5, dates: 1, days: 1 });
  });

  it("the contract", async () => {
    fx.record = {
      id: "c1",
      schemeId: "s1",
      title: "Roof",
      contractNumber: "C-1",
      status: "EXECUTED",
      contractorBusiness: { companyName: "Acme" },
      contractValue: "1000",
      gstAmount: "100",
      totalValue: "1100",
      revisedContractValue: "1000",
      approvedVariations: "0",
      retentionAmount: "0",
      retentionPercentage: "0",
      description: null,
      startDate: DAY,
      endDate: DAY,
      defectsLiabilityEnd: DAY,
      executedAt: AT,
      completedAt: AT,
      signedBy: person,
      request: null,
      variations: [],
      workOrders: [],
      invoices: [{ id: "i1", invoiceNumber: "INV-1", status: "SUBMITTED", claimedAmount: "100", dueDate: DAY }],
      documents: [{ id: "d1", fileName: "a.pdf", documentType: "CONTRACT", createdAt: AT, uploadedBy: person }],
    };
    await expectZoned(() => ContractPage(params({ contractId: "c1" })), { dateTimes: 2, dates: 1, days: 4 });
  });

  it("the variation", async () => {
    fx.record = {
      id: "v1",
      contractId: "c1",
      variationNumber: "V-1",
      title: "Extra",
      description: "More work",
      reason: "Found rot",
      status: "APPROVED",
      costImpact: "100",
      timeImpact: null,
      createdAt: AT,
      approvedAt: AT,
      approvedBy: person,
      requestedBy: person,
      contract: { id: "c1", schemeId: "s1", title: "Roof", contractNumber: "C-1", contractValue: "1000" },
    };
    await expectZoned(() => VariationPage(params({ contractId: "c1", variationId: "v1" })), { dateTimes: 2, dates: 0 });
  });

  it("the work order", async () => {
    fx.record = {
      id: "w1",
      schemeId: "s1",
      title: "Fix leak",
      workOrderNumber: "WO-1",
      status: "IN_PROGRESS",
      contract: { id: "c1", schemeId: "s1", title: "Roof", contractNumber: "C-1" },
      contractorBusiness: { companyName: "Acme" },
      scheduledStart: DAY,
      scheduledEnd: DAY,
      actualStart: DAY,
      actualEnd: DAY,
      authorisedAt: AT,
      authorisedBy: person,
      acknowledgedAt: AT,
      milestones: [{ id: "m1", title: "Stage 1", status: "COMPLETED", dueDate: DAY, completedAt: AT, amount: "100", certifiedBy: null }],
      siteVisits: [],
      progressReports: [],
      inspections: [],
      completionSubmissions: [{ id: "cs1", status: "ACCEPTED", submittedAt: AT, submittedBy: person, reviewedAt: AT, reviewedBy: person, notes: null }],
      complianceChecks: [],
    };
    await expectZoned(() => WorkOrderPage(params({ workOrderId: "w1" })), { dateTimes: 4, dates: 1, days: 5 });
  });

  it("the RFQ list", async () => {
    fx.list = [{ id: "q1", rfqNumber: "RFQ-1", title: "Roof", status: "OPEN", closingDate: AT, request: null, invitations: [], quotations: [] }];
    await expectZoned(() => RfqsPage(params()), { dateTimes: 1, dates: 0 });
  });

  it("the RFQ", async () => {
    fx.record = {
      id: "q1",
      schemeId: "s1",
      rfqNumber: "RFQ-1",
      title: "Roof",
      status: "CLOSED",
      closingDate: AT,
      closedAt: AT,
      issuedAt: AT,
      issuedBy: person,
      description: null,
      cancelledReason: null,
      scope: null,
      scopeVersionUsed: null,
      request: null,
      invitations: [{ id: "inv1", status: "ACCEPTED", invitedAt: AT, invitedBy: person, respondedAt: AT, declineReason: null, contractorBusiness: { id: "cb1", companyName: "Acme" } }],
      addenda: [{ id: "a1", addendumNumber: 1, title: "Change", description: "", issuedAt: AT, issuedBy: person }],
      clarifications: [{ id: "cl1", question: "When?", answer: "Soon", isPublic: true, askedAt: AT, askedBy: person, answeredAt: AT, answeredBy: person }],
      // validUntil is a calendar day stored at UTC midnight (marketplace.ts).
      quotations: [{ id: "qt1", quotationNumber: "QT-1", status: "SUBMITTED", submittedAt: AT, validUntil: `${DAY}T00:00:00.000Z`, subtotal: "90", totalAmount: "100", estimatedDuration: null, contractorBusiness: { companyName: "Acme" } }],
      evaluations: [{ id: "ev1", evaluatedAt: AT, evaluator: person, overallScore: 80, comments: null, criteria: [] }],
    };
    await expectZoned(() => RfqPage(params({ rfqId: "q1" })), { dateTimes: 10, dates: 0, days: 1 });
    // Every Australian zone is east of UTC, so the day would survive a zone
    // shift there; a zone west of UTC shows it is not shifted at all.
    expect(await render("America/Los_Angeles" as Zone, () => RfqPage(params({ rfqId: "q1" })))).toContain("Valid until: 5 Nov 2026");
  });

  it("the works dashboard (the day each request was raised)", async () => {
    fx.list = [{ id: "r1", requestNumber: "WR-1", title: "Leak", status: "SUBMITTED", priority: "NORMAL", isEmergency: false, estimatedCost: null, createdAt: AT, category: null, raisedBy: person, assignedTo: null }];
    await expectZoned(() => WorksDashboardPage(params()), { dateTimes: 0, dates: 1 });
  });

  it("the approvals page (a delegation's start and end, which are timestamps)", async () => {
    fx.list = [{ id: "d1", authorityType: "APPROVE", isActive: true, maxAmount: "1000", startDate: AT, endDate: AT, delegatedBy: person, delegatedTo: person }];
    await expectZoned(() => ApprovalsPage(params()), { dateTimes: 0, dates: 2 });
  });

  it("a compliance requirement (the day a check was verified; its expiry is a day at UTC midnight)", async () => {
    fx.record = {
      id: "cr1",
      schemeId: "s1",
      name: "Public liability",
      description: null,
      documentType: "INSURANCE",
      layer: "SCHEME",
      isActive: true,
      isMandatory: true,
      tradeCategories: [],
      validityPeriod: null,
      checks: [{ id: "ck1", status: "VERIFIED", documentName: "cert.pdf", contractorBusiness: { companyName: "Acme" }, verifiedAt: AT, verifiedBy: person, expiryDate: `${DAY}T00:00:00.000Z`, rejectionReason: null }],
    };
    await expectZoned(() => CompliancePage(params({ requirementId: "cr1" })), { dateTimes: 0, dates: 1, days: 1 });
  });

  it("a contractor (the day a compliance check was verified; licence and insurance expiries are calendar days)", async () => {
    fx.record = {
      id: "cb1",
      companyName: "Acme",
      tradingName: null,
      abn: "1",
      acn: null,
      email: "a@x",
      phone: null,
      website: null,
      registeredAddress: null,
      gstRegistered: true,
      status: "APPROVED",
      tradeCategories: [],
      notes: null,
      contacts: [],
      licences: [{ id: "l1", licenceType: "Builder", licenceNumber: "1", status: "VERIFIED", expiryDate: DAY }],
      insurances: [{ id: "i1", policyType: "Public liability", insurer: "X", policyNumber: "1", status: "VERIFIED", expiryDate: DAY }],
      complianceChecks: [{ id: "ck1", status: "VERIFIED", verifiedAt: AT, requirement: { schemeId: "s1", name: "Public liability" } }],
    };
    await expectZoned(() => ContractorPage(params({ contractorId: "cb1" })), { dateTimes: 0, dates: 1, days: 2 });
  });
});

describe("the admin security page shows the platform's time zone (Sydney)", () => {
  it("last active", async () => {
    fx.profiles = [{ id: "p2", authId: "a2", firstName: "Ann", lastName: "Lee", email: "a@x", isPlatformAdmin: false }];
    fx.sessions = [{ id: "s1", profileId: "p2", lastSeenAt: AT, revokedAt: null }];
    const text = await render("Australia/Perth", () => SecurityPage());
    expect(text).toContain("last active 29 Oct, 1:30 am");
  });
});
