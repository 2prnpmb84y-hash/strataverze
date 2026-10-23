import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

// MFA step-up (stage S4) is tested in src/lib/auth/mfa-enforcement.test.ts.
// Here the caller has verified recently unless a test says otherwise.
const stepUp = vi.hoisted(() => ({ requireRecentMfa: vi.fn(async () => {}) }));
vi.mock("@/lib/auth/mfa-enforcement", () => ({
  requireRecentMfa: stepUp.requireRecentMfa,
  getMfaStatus: vi.fn(async () => null),
  enforceMfa: vi.fn(async () => {}),
  StepUpRequiredError: class extends Error {},
}));

/**
 * Cross-scheme, role and payment control tests for the works server actions
 * (security findings SEC-004 H4/M1/M2 and SEC-007). The actions are called
 * directly, as an attacker would call them, bypassing the UI.
 */

const SCHEME_A = "aaaaaaaa-0000-0000-0000-000000000001";
const SCHEME_B = "bbbbbbbb-0000-0000-0000-000000000002";

const membership = vi.fn();
vi.mock("@/lib/auth/require-membership", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/require-membership")>(
    "@/lib/auth/require-membership",
  );
  return {
    ...actual,
    requireSchemeMembership: (...a: unknown[]) => membership(...a),
    requirePlatformAdmin: vi.fn(),
  };
});
vi.mock("@/lib/queries/profiles", () => ({ getCurrentProfile: vi.fn(async () => ({ id: "adviser-profile" })) }));
const contractorContact = vi.fn();
vi.mock("@/lib/auth/require-contractor", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/require-contractor")>(
    "@/lib/auth/require-contractor",
  );
  return { ...actual, requireActiveContractorContact: (...a: unknown[]) => contractorContact(...a) };
});

/**
 * A stand-in for the Prisma 8 client. Every model has `first`, `all`,
 * `update`, `create` and `count` mocks; the query builder methods (where,
 * include, orderBy, limit, select) return the same chain. The where clause is
 * not evaluated, so these tests prove the actions check a loaded record's
 * scheme themselves, not just that they filter by it.
 */
type Fn = (...args: unknown[]) => Promise<unknown>;
type ModelMock = Record<"first" | "all" | "update" | "create" | "count" | "delete", Mock<Fn>>;
const models: Record<string, ModelMock> = {};
function model(name: string): ModelMock {
  if (!models[name]) {
    models[name] = {
      first: vi.fn<Fn>(async () => null),
      all: vi.fn<Fn>(async () => []),
      update: vi.fn<Fn>(async () => ({})),
      create: vi.fn<Fn>(async (data) => ({ id: `${name}-new`, ...(data as object) })),
      count: vi.fn<Fn>(async () => 0),
      delete: vi.fn<Fn>(async () => ({})),
    };
  }
  return models[name];
}
const orm = {
  public: new Proxy(
    {},
    {
      get: (_t, name: string) => {
        const m = model(name);
        const chain: Record<string, unknown> = {};
        for (const k of ["where", "include", "orderBy", "limit", "select"]) chain[k] = () => chain;
        for (const k of ["first", "all", "update", "count", "delete"] as const) {
          chain[k] = (...a: unknown[]) => m[k](...a);
        }
        chain.create = (...a: unknown[]) => m.create(...a);
        return chain;
      },
    },
  ),
};
vi.mock("@/prisma/db", () => ({
  db: { orm, transaction: async (cb: (tx: { orm: typeof orm }) => unknown) => cb({ orm }) },
}));
vi.mock("@prisma/orm-postgres/orm-client", () => ({ and: (...c: unknown[]) => c }));

const invoiceControls = vi.fn();
const invoiceControl = vi.fn();
vi.mock("@/lib/finance/invoice-approval", () => ({
  PaymentControlError: class extends Error {},
  authoriseWorksInvoice: vi.fn(),
  worksInvoiceControls: (...a: unknown[]) => invoiceControls(...a),
  checkInvoiceControl: (...a: unknown[]) => invoiceControl(...a),
}));
vi.mock("@/lib/queries/activity-log", () => ({ logActivity: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Map()) }));
vi.mock("next/navigation", () => ({ notFound: vi.fn(), redirect: vi.fn() }));
vi.mock("@/lib/billing/capture", () => ({ captureUsageFee: vi.fn() }));
vi.mock("@/lib/billing/disclosure", () => ({ feeErrorMessage: () => null }));

const actions = await import("./works");
const { AuthorisationError } = await import("@/lib/auth/require-membership");

const adviser = { id: "adviser-profile" };

function form(values: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(values)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(models)) delete models[k];
  membership.mockResolvedValue({ profile: adviser, membership: {}, roles: ["ADVISER"] });
  contractorContact.mockResolvedValue({ profile: adviser, contact: {} });
  invoiceControl.mockResolvedValue({ result: "allowed" });
});

// ─── submitApprovalDecision ─────────────────────────────────────

describe("submitApprovalDecision", () => {
  const decide = (schemeId = SCHEME_A) =>
    actions.submitApprovalDecision(form({ workflowId: "wf-1", schemeId, decision: "APPROVED" }));

  it("rejects a workflow from another scheme", async () => {
    // Authorised as a committee member of scheme A, sending scheme B's workflow.
    model("WorksApprovalWorkflow").first.mockResolvedValue({
      id: "wf-1",
      schemeId: SCHEME_B,
      status: "PENDING",
      approvalRoute: { approverRoles: [], requiredApprovers: 1 },
      records: [],
    });
    const r = await decide();
    expect(r.error).toBe("Approval workflow not found.");
    expect(model("WorksApprovalRecord").create).not.toHaveBeenCalled();
    expect(model("WorksApprovalWorkflow").update).not.toHaveBeenCalled();
  });

  it("rejects a caller whose role is not one of the route's approver roles", async () => {
    model("WorksApprovalWorkflow").first.mockResolvedValue({
      id: "wf-1",
      schemeId: SCHEME_A,
      status: "PENDING",
      approvalRoute: { approverRoles: ["COMMITTEE"], requiredApprovers: 1 },
      records: [],
    });
    const r = await decide();
    expect(r.error).toMatch(/cannot approve on this approval route/);
    expect(model("WorksApprovalRecord").create).not.toHaveBeenCalled();
  });

  it("rejects a second decision by the same approver", async () => {
    membership.mockResolvedValue({ profile: { id: "c1" }, membership: {}, roles: ["COMMITTEE"] });
    model("WorksApprovalWorkflow").first.mockResolvedValue({
      id: "wf-1",
      schemeId: SCHEME_A,
      status: "PENDING",
      approvalRoute: { approverRoles: ["COMMITTEE"], requiredApprovers: 2 },
      records: [{ approverId: "c1", decision: "APPROVED" }],
    });
    const r = await decide();
    expect(r.error).toMatch(/already submitted/);
    expect(model("WorksApprovalRecord").create).not.toHaveBeenCalled();
  });

  it("only lets the works.approve roles in", async () => {
    membership.mockRejectedValue(new AuthorisationError("You do not have permission to perform this action."));
    const r = await decide();
    expect(r.error).toMatch(/permission/);
    expect(membership).toHaveBeenCalledWith(SCHEME_A, ["COMMITTEE", "ADVISER"]);
  });

  it("records the decision of an approver the route names", async () => {
    membership.mockResolvedValue({ profile: { id: "c1" }, membership: {}, roles: ["OWNER", "COMMITTEE"] });
    model("WorksApprovalWorkflow").first.mockResolvedValue({
      id: "wf-1",
      schemeId: SCHEME_A,
      status: "PENDING",
      approvalRoute: { approverRoles: ["COMMITTEE"], requiredApprovers: 1 },
      records: [],
    });
    const r = await decide();
    expect(r.error).toBeNull();
    expect(model("WorksApprovalRecord").create).toHaveBeenCalledWith(
      expect.objectContaining({ workflowId: "wf-1", approverId: "c1", decision: "APPROVED" }),
    );
  });
});

// ─── recordWorksPayment ─────────────────────────────────────────

describe("recordWorksPayment", () => {
  const record = (amount = "100") =>
    actions.recordWorksPayment(
      form({ paymentInstructionId: "pi-1", schemeId: SCHEME_A, amount, paymentDate: "2026-10-23", paymentMethod: "EFT" }),
    );

  it("rejects a payment instruction for another scheme's invoice", async () => {
    model("WorksPaymentInstruction").first.mockResolvedValue({
      id: "pi-1",
      invoiceId: "inv-b",
      status: "PENDING",
      approvedAmount: "1000",
    });
    model("WorksInvoice").first.mockResolvedValue({ id: "inv-b", schemeId: SCHEME_B, paidAmount: "0", approvedAmount: "1000" });
    const r = await record();
    expect(r.error).toBe("Payment instruction not found.");
    expect(model("WorksPaymentRecord").create).not.toHaveBeenCalled();
    expect(model("WorksInvoice").update).not.toHaveBeenCalled();
  });

  it("is limited to works.payments (the accountant is read only)", async () => {
    await record();
    expect(membership).toHaveBeenCalledWith(SCHEME_A, ["ADVISER"]);
  });

  it("rejects a payment above the amount instructed", async () => {
    model("WorksPaymentInstruction").first.mockResolvedValue({ id: "pi-1", invoiceId: "inv-a", status: "PENDING", approvedAmount: "500" });
    model("WorksInvoice").first.mockResolvedValue({ id: "inv-a", schemeId: SCHEME_A, paidAmount: "0", approvedAmount: "500" });
    model("WorksPaymentRecord").all.mockResolvedValue([{ amount: "450" }]);
    const r = await record("100");
    expect(r.error).toMatch(/more than the amount instructed/);
    expect(model("WorksPaymentRecord").create).not.toHaveBeenCalled();
  });
});

// ─── authoriseWorksPayment (SEC-007) ────────────────────────────

describe("authoriseWorksPayment", () => {
  const invoice = {
    id: "inv-a",
    schemeId: SCHEME_A,
    contractorBusinessId: "cb-1",
    assessedAmount: "1000",
    approvedAmount: null,
    claimedAmount: "1200",
    status: "APPROVED",
  };
  const verified = { id: "bank-2", contractorBusinessId: "cb-1", versionNumber: 2, status: "VERIFIED", accountName: "Acme Plumbing Pty Ltd" };

  beforeEach(() => {
    invoiceControls.mockResolvedValue({ invoice, auths: [], forControls: {} });
    model("WorksBankDetailVersion").first.mockResolvedValue(verified);
    model("WorksBankDetailVersion").all.mockResolvedValue([verified]);
    model("ContractorBusiness").first.mockResolvedValue({ id: "cb-1", companyName: "Acme Plumbing" });
  });

  const authorise = (values: Record<string, string>) =>
    actions.authoriseWorksPayment(form({ invoiceId: "inv-a", schemeId: SCHEME_A, ...values }));

  it("requires a bank detail version: leaving it out no longer skips the check", async () => {
    const r = await authorise({ approvedAmount: "1000", beneficiary: "Acme" });
    expect(r.error).toMatch(/verified bank details are required/);
    expect(model("WorksPaymentInstruction").create).not.toHaveBeenCalled();
  });

  it("rejects bank details that are not verified", async () => {
    model("WorksBankDetailVersion").first.mockResolvedValue({ ...verified, status: "SUBMITTED_UNVERIFIED" });
    const r = await authorise({ approvedAmount: "1000", bankDetailVersionId: "bank-2" });
    expect(r.error).toMatch(/not been verified/);
    expect(model("WorksPaymentInstruction").create).not.toHaveBeenCalled();
  });

  it("rejects another contractor's bank details", async () => {
    model("WorksBankDetailVersion").first.mockResolvedValue({ ...verified, contractorBusinessId: "cb-attacker" });
    const r = await authorise({ approvedAmount: "1000", bankDetailVersionId: "bank-2" });
    expect(r.error).toMatch(/do not belong to this contractor/);
    expect(model("WorksPaymentInstruction").create).not.toHaveBeenCalled();
  });

  it("rejects an older verified version when a newer change is waiting", async () => {
    model("WorksBankDetailVersion").all.mockResolvedValue([
      verified,
      { id: "bank-3", contractorBusinessId: "cb-1", versionNumber: 3, status: "SUBMITTED_UNVERIFIED" },
    ]);
    const r = await authorise({ approvedAmount: "1000", bankDetailVersionId: "bank-2" });
    expect(r.error).toMatch(/have changed/);
    expect(model("WorksPaymentInstruction").create).not.toHaveBeenCalled();
  });

  it("rejects an amount above the approved amount", async () => {
    const r = await authorise({ approvedAmount: "1000.01", bankDetailVersionId: "bank-2" });
    expect(r.error).toMatch(/more than the approved amount/);
    expect(model("WorksPaymentInstruction").create).not.toHaveBeenCalled();
  });

  it("counts what is already instructed against the approved amount", async () => {
    model("WorksPaymentInstruction").all.mockResolvedValue([
      { approvedAmount: "400", status: "PENDING" },
      { approvedAmount: "900", status: "INVALIDATED" },
    ]);
    const over = await authorise({ approvedAmount: "700", bankDetailVersionId: "bank-2" });
    expect(over.error).toMatch(/\$600\.00/);
    expect(model("WorksPaymentInstruction").create).not.toHaveBeenCalled();

    const ok = await authorise({ approvedAmount: "600", bankDetailVersionId: "bank-2" });
    expect(ok.error).toBeNull();
  });

  it("pays the verified account name, not a beneficiary typed into the form", async () => {
    const r = await authorise({ approvedAmount: "1000", bankDetailVersionId: "bank-2", beneficiary: "Mallory" });
    expect(r.error).toBeNull();
    expect(model("WorksPaymentInstruction").create).toHaveBeenCalledWith(
      expect.objectContaining({ beneficiary: "Acme Plumbing Pty Ltd", bankDetailVersionId: "bank-2", approvedAmount: "1000" }),
    );
    // The invoice keeps the signed-off amount, not this instruction's.
    expect(model("WorksInvoice").update).toHaveBeenCalledWith(expect.objectContaining({ approvedAmount: "1000" }));
  });

  it("rejects an invoice from another scheme", async () => {
    invoiceControls.mockResolvedValue({ invoice: { ...invoice, schemeId: SCHEME_B }, auths: [], forControls: {} });
    const r = await authorise({ approvedAmount: "1", bankDetailVersionId: "bank-2" });
    expect(r.error).toBe("Invoice not found.");
    expect(model("WorksPaymentInstruction").create).not.toHaveBeenCalled();
  });
});

// ─── updateWorksInvoice ─────────────────────────────────────────

describe("updateWorksInvoice", () => {
  const update = () =>
    actions.updateWorksInvoice(
      form({
        invoiceId: "inv-a",
        schemeId: SCHEME_A,
        contractorBusinessId: "cb-attacker",
        invoiceNumber: "INV-1",
        invoiceDate: "2026-10-01",
        dueDate: "2026-10-30",
        claimedAmount: "99999",
      }),
    );

  it("refuses edits once the invoice is awaiting authorisation", async () => {
    model("WorksInvoice").first.mockResolvedValue({ id: "inv-a", schemeId: SCHEME_A, status: "AWAITING_AUTHORISATION", contractorBusinessId: "cb-1" });
    const r = await update();
    expect(r.error).toMatch(/can no longer be edited/);
    expect(model("WorksInvoice").update).not.toHaveBeenCalled();
  });

  it("refuses edits once anyone has approved it", async () => {
    model("WorksInvoice").first.mockResolvedValue({ id: "inv-a", schemeId: SCHEME_A, status: "SUBMITTED", contractorBusinessId: "cb-1" });
    model("PaymentAuthorisation").first.mockResolvedValue({ id: "auth-1" });
    const r = await update();
    expect(r.error).toMatch(/can no longer be edited/);
    expect(model("WorksInvoice").update).not.toHaveBeenCalled();
  });

  it("rejects an invoice from another scheme", async () => {
    model("WorksInvoice").first.mockResolvedValue({ id: "inv-b", schemeId: SCHEME_B, status: "SUBMITTED", contractorBusinessId: "cb-1" });
    const r = await update();
    expect(r.error).toBe("Invoice not found.");
    expect(model("WorksInvoice").update).not.toHaveBeenCalled();
  });

  it("does not let the payee be switched without a contract for that payee", async () => {
    model("WorksInvoice").first.mockResolvedValue({ id: "inv-a", schemeId: SCHEME_A, status: "SUBMITTED", contractorBusinessId: "cb-1" });
    const r = await update();
    expect(r.error).toMatch(/different contractor/);
    expect(model("WorksInvoice").update).not.toHaveBeenCalled();
  });
});

// ─── submitWorksInvoice (M2) ────────────────────────────────────

describe("submitWorksInvoice", () => {
  const submit = (values: Record<string, string> = {}) =>
    actions.submitWorksInvoice(
      form({
        schemeId: SCHEME_A,
        contractorBusinessId: "cb-1",
        invoiceNumber: "INV-1",
        invoiceDate: "2026-10-01",
        dueDate: "2026-10-30",
        claimedAmount: "100",
        ...values,
      }),
    );

  it("does not let the accountant submit invoices", async () => {
    await submit();
    expect(membership).toHaveBeenCalledWith(SCHEME_A, ["ADVISER", "SUPPLIER"]);
  });

  it("makes a supplier prove it is a contact of the business it invoices for", async () => {
    membership.mockResolvedValue({ profile: { id: "s1" }, membership: {}, roles: ["SUPPLIER"] });
    contractorContact.mockRejectedValue(new AuthorisationError("You do not have access to this contractor business."));
    const r = await submit({ contractId: "con-1" });
    expect(r.error).toMatch(/do not have access/);
    expect(model("WorksInvoice").create).not.toHaveBeenCalled();
  });

  it("rejects a supplier invoicing on a contract awarded to someone else", async () => {
    membership.mockResolvedValue({ profile: { id: "s1" }, membership: {}, roles: ["SUPPLIER"] });
    model("WorksContract").first.mockResolvedValue({ id: "con-1", schemeId: SCHEME_A, contractorBusinessId: "cb-other" });
    const r = await submit({ contractId: "con-1" });
    expect(r.error).toMatch(/awarded to/);
    expect(model("WorksInvoice").create).not.toHaveBeenCalled();
  });

  it("rejects a contract from another scheme", async () => {
    model("WorksContract").first.mockResolvedValue({ id: "con-b", schemeId: SCHEME_B, contractorBusinessId: "cb-1" });
    const r = await submit({ contractId: "con-b" });
    expect(r.error).toBe("Contract not found.");
    expect(model("WorksInvoice").create).not.toHaveBeenCalled();
  });
});

// ─── Compliance checks ──────────────────────────────────────────

describe("verifyComplianceCheck", () => {
  it("rejects a check against another scheme's requirement", async () => {
    model("WorksComplianceCheck").first.mockResolvedValue({ id: "chk-b", requirementId: "req-b", status: "SUBMITTED" });
    model("WorksComplianceRequirement").first.mockResolvedValue({ id: "req-b", schemeId: SCHEME_B });
    const r = await actions.verifyComplianceCheck("chk-b", SCHEME_A);
    expect(r.error).toBe("Compliance check not found.");
    expect(model("WorksComplianceCheck").update).not.toHaveBeenCalled();
    expect(model("WorksVerificationEvent").create).not.toHaveBeenCalled();
  });

  it("verifies a check on this scheme", async () => {
    model("WorksComplianceCheck").first.mockResolvedValue({ id: "chk-a", requirementId: "req-a", status: "SUBMITTED" });
    model("WorksComplianceRequirement").first.mockResolvedValue({ id: "req-a", schemeId: SCHEME_A });
    const r = await actions.verifyComplianceCheck("chk-a", SCHEME_A);
    expect(r.error).toBeNull();
    expect(model("WorksComplianceCheck").update).toHaveBeenCalledWith(expect.objectContaining({ status: "VERIFIED" }));
  });
});

describe("rejectComplianceCheck", () => {
  it("rejects a check against another scheme's requirement", async () => {
    model("WorksComplianceCheck").first.mockResolvedValue({ id: "chk-b", requirementId: "req-b", status: "VERIFIED" });
    model("WorksComplianceRequirement").first.mockResolvedValue({ id: "req-b", schemeId: SCHEME_B });
    const r = await actions.rejectComplianceCheck(form({ checkId: "chk-b", schemeId: SCHEME_A, rejectionReason: "x" }));
    expect(r.error).toBe("Compliance check not found.");
    expect(model("WorksComplianceCheck").update).not.toHaveBeenCalled();
  });
});

// ─── Other record-to-scheme checks ──────────────────────────────

describe("cross-scheme record ids", () => {
  it("assignWorksRequest rejects an assignee who is not on the scheme", async () => {
    model("WorksRequest").first.mockResolvedValue({ id: "wr-a", schemeId: SCHEME_A });
    const r = await actions.assignWorksRequest(form({ requestId: "wr-a", schemeId: SCHEME_A, assignedToId: "stranger" }));
    expect(r.error).toMatch(/active member/);
    expect(model("WorksRequest").update).not.toHaveBeenCalled();
  });

  it("updateWorksRequest rejects another scheme's request", async () => {
    model("WorksRequest").first.mockResolvedValue({ id: "wr-b", schemeId: SCHEME_B, currentVersion: 1 });
    const r = await actions.updateWorksRequest(
      form({ requestId: "wr-b", schemeId: SCHEME_A, title: "t", description: "d" }),
    );
    expect(r.error).toBe("Request not found.");
    expect(model("WorksRequest").update).not.toHaveBeenCalled();
  });

  it("revokeDelegation rejects another scheme's delegation", async () => {
    model("WorksDelegation").first.mockResolvedValue({ id: "d-b", schemeId: SCHEME_B });
    const r = await actions.revokeDelegation("d-b", SCHEME_A);
    expect(r.error).toBe("Delegation not found.");
    expect(model("WorksDelegation").update).not.toHaveBeenCalled();
  });

  it("rejectWorksVariation rejects a variation on another scheme's contract", async () => {
    model("WorksVariation").first.mockResolvedValue({ id: "v-b", contractId: "con-b", status: "SUBMITTED" });
    model("WorksContract").first.mockResolvedValue({ id: "con-b", schemeId: SCHEME_B });
    const r = await actions.rejectWorksVariation("v-b", SCHEME_A);
    expect(r.error).toBe("Variation not found.");
    expect(model("WorksVariation").update).not.toHaveBeenCalled();
  });

  it("createWorksContract rejects a quotation from another scheme's RFQ", async () => {
    model("WorksRequest").first.mockResolvedValue({ id: "wr-a", schemeId: SCHEME_A });
    model("WorksQuotation").first.mockResolvedValue({ id: "q-b", rfqId: "rfq-b", contractorBusinessId: "cb-1" });
    model("WorksRfq").first.mockResolvedValue({ id: "rfq-b", schemeId: SCHEME_B });
    const r = await actions.createWorksContract(
      form({
        requestId: "wr-a",
        schemeId: SCHEME_A,
        quotationId: "q-b",
        contractorBusinessId: "cb-1",
        title: "t",
        contractValue: "100",
        totalValue: "110",
      }),
    );
    expect(r.error).toBe("Quotation not found.");
    expect(model("WorksContract").create).not.toHaveBeenCalled();
  });

  it("updateWorksContract refuses to change the value of an executed contract", async () => {
    model("WorksContract").first.mockResolvedValue({
      id: "con-a",
      schemeId: SCHEME_A,
      status: "EXECUTED",
      contractValue: "100",
      gstAmount: "10",
      totalValue: "110",
      retentionPercentage: null,
    });
    const r = await actions.updateWorksContract(
      form({ contractId: "con-a", schemeId: SCHEME_A, title: "t", contractValue: "200", gstAmount: "10", totalValue: "210" }),
    );
    expect(r.error).toMatch(/executed/);
    expect(model("WorksContract").update).not.toHaveBeenCalled();
  });
});

// ─── Role and status rules from the independent review ──────────

describe("works role and status rules", () => {
  it("lets only advisers manage works records (committee refused)", async () => {
    // The caller is a committee member only: any check that does not admit
    // COMMITTEE refuses them.
    membership.mockImplementation(async (_s: string, roles: string[]) => {
      if (!roles.includes("COMMITTEE")) {
        throw new AuthorisationError("You do not have permission to perform this action.");
      }
      return { profile: { id: "committee" }, membership: {}, roles: ["COMMITTEE"] };
    });
    const r = await actions.updateWorksRequest(
      form({ requestId: "req-1", schemeId: SCHEME_A, title: "Roof", description: "Leak", category: "REPAIR" }),
    );
    expect(r.error).toMatch(/permission/);
    expect(model("WorksRequest").update).not.toHaveBeenCalled();
  });

  it("reviews only a request awaiting review", async () => {
    model("WorksRequest").first.mockResolvedValue({ id: "req-1", schemeId: SCHEME_A, status: "CLOSED" });
    const r = await actions.reviewWorksRequest(
      form({ requestId: "req-1", schemeId: SCHEME_A, outcome: "EMERGENCY_APPROVED" }),
    );
    expect(r.error).toMatch(/not awaiting review/);
    expect(model("WorksRequest").update).not.toHaveBeenCalled();
  });

  it("lets an owner submit only a request they raised", async () => {
    membership.mockResolvedValue({ profile: { id: "owner" }, membership: {}, roles: ["OWNER"] });
    model("WorksRequest").first.mockResolvedValue({ id: "req-1", schemeId: SCHEME_A, status: "DRAFT", raisedById: "adviser-profile" });
    const r = await actions.submitWorksRequest("req-1", SCHEME_A);
    expect(r.error).toBe("Request not found.");
    expect(model("WorksRequest").update).not.toHaveBeenCalled();
  });

  it("approves only a submitted variation, and not the requester's own", async () => {
    model("WorksContract").first.mockResolvedValue({ id: "c-1", schemeId: SCHEME_A });
    model("WorksVariation").first.mockResolvedValue({ id: "v-1", contractId: "c-1", status: "DRAFT", requestedById: "x" });
    expect((await actions.approveWorksVariation("v-1", SCHEME_A)).error).toMatch(/submitted variation/);
    model("WorksVariation").first.mockResolvedValue({
      id: "v-1",
      contractId: "c-1",
      status: "SUBMITTED",
      requestedById: "adviser-profile",
    });
    expect((await actions.approveWorksVariation("v-1", SCHEME_A)).error).toMatch(/requested it/);
    expect(model("WorksVariation").update).not.toHaveBeenCalled();
  });
});

describe("MFA step-up on payments", () => {
  it("refuses to authorise a payment without a recent authenticator check", async () => {
    stepUp.requireRecentMfa.mockRejectedValueOnce(new AuthorisationError("For your security, confirm it is you first."));
    const r = await actions.recordWorksPayment(
      form({ paymentInstructionId: "pi-1", schemeId: SCHEME_A, amount: "10", paymentDate: "2026-10-23", paymentMethod: "EFT" }),
    );
    expect(r.error).toMatch(/confirm it is you/);
    expect(model("WorksPaymentRecord").create).not.toHaveBeenCalled();
    expect(model("WorksInvoice").update).not.toHaveBeenCalled();
  });
});
