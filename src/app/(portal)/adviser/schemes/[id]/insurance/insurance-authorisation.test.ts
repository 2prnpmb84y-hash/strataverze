import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Cross-scheme tests for the insurance server actions (security findings
 * SEC-004 and L1). The caller is a genuine member of scheme A, calling each
 * action directly with ids from scheme B. The database is an in-memory fake
 * that evaluates the where clauses, so the query helpers' scoping is tested.
 */

const SCHEME_A = "aaaaaaaa-0000-0000-0000-000000000001";
const SCHEME_B = "bbbbbbbb-0000-0000-0000-000000000002";

const membership = vi.fn();
vi.mock("@/lib/auth/require-membership", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/require-membership")>(
    "@/lib/auth/require-membership",
  );
  return { ...actual, requireSchemeMembership: (...a: unknown[]) => membership(...a) };
});
vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));
vi.mock("@/lib/queries/activity-log", () => ({ logActivity: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
const sign = vi.fn(async (path: string) => `https://signed.example/${path}?token=t`);
vi.mock("@/lib/storage/signed-url", async () => {
  const actual = await vi.importActual<typeof import("@/lib/storage/signed-url")>("@/lib/storage/signed-url");
  return { ...actual, getSignedDocumentUrl: (path: string) => sign(path) };
});

const { sharedFake } = await import("@/test/fake-orm");
const policyActions = await import("./actions");
const documentActions = await import("./[policyId]/document-actions");
const claimActions = await import("./claims/actions");
const ownerActions = await import("@/app/(portal)/owner/(scheme)/insurance/actions");
const { AuthorisationError } = await import("@/lib/auth/require-membership");

function policyForm(fields: Record<string, string> = {}) {
  const fd = new FormData();
  const all = {
    policyNumber: "P-1",
    policyType: "BUILDING",
    insurer: "Insurer",
    coverageAmount: "1000000",
    premium: "5000",
    startDate: "2026-01-01",
    endDate: "2027-01-01",
    status: "ACTIVE",
    coverageItemsJson: JSON.stringify([{ category: "BUILDING", sumInsured: 1 }]),
    ...fields,
  };
  for (const [k, v] of Object.entries(all)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  membership.mockResolvedValue({ profile: { id: "adviser-of-a" }, membership: { role: "ADVISER" }, roles: ["ADVISER"] });
  sharedFake.reset({
    InsurancePolicy: [
      { id: "pol-a", schemeId: SCHEME_A, policyNumber: "A-1", deletedAt: null },
      { id: "pol-b", schemeId: SCHEME_B, policyNumber: "B-1", deletedAt: null },
    ],
    InsuranceCoverageItem: [{ id: "cov-b", policyId: "pol-b", category: "BUILDING" }],
    InsuranceClaim: [{ id: "claim-a", schemeId: SCHEME_A, deletedAt: null }],
    InsuranceDocument: [
      { id: "doc-a", schemeId: SCHEME_A, policyId: "pol-a", claimId: null, renewalId: null, isCurrent: true, deletedAt: null, fileUrl: "schemes/" + SCHEME_A + "/insurance/pol-a/schedule.pdf" },
      { id: "doc-b", schemeId: SCHEME_B, policyId: "pol-b", claimId: null, renewalId: null, isCurrent: true, deletedAt: null, fileUrl: "schemes/" + SCHEME_B + "/insurance/pol-b/schedule.pdf" },
      { id: "evidence-a", schemeId: SCHEME_A, policyId: null, claimId: "claim-a", renewalId: null, isCurrent: true, deletedAt: null, fileUrl: "schemes/" + SCHEME_A + "/insurance/claims/claim-a/photo.jpg" },
      { id: "doc-a-external", schemeId: SCHEME_A, policyId: "pol-a", claimId: null, renewalId: null, isCurrent: true, deletedAt: null, fileUrl: "https://evil.example/phish" },
    ],
  });
});

describe("updateInsuranceAction", () => {
  it("refuses to edit another scheme's policy and leaves its items alone", async () => {
    const r = await policyActions.updateInsuranceAction(SCHEME_A, "pol-b", {}, policyForm({ policyNumber: "HIJACKED" }));
    expect(r.error).toBe("Insurance policy not found.");
    expect(sharedFake.table("InsurancePolicy").find((p) => p.id === "pol-b")?.policyNumber).toBe("B-1");
    expect(sharedFake.table("InsuranceCoverageItem").map((c) => c.id)).toEqual(["cov-b"]);
  });

  it("refuses to delete another scheme's policy", async () => {
    const r = await policyActions.deleteInsuranceAction(SCHEME_A, "pol-b");
    expect(r?.error).toBe("Insurance policy not found.");
    expect(sharedFake.table("InsurancePolicy").find((p) => p.id === "pol-b")?.deletedAt).toBeNull();
  });

  it("updates the scheme's own policy", async () => {
    const r = await policyActions.updateInsuranceAction(SCHEME_A, "pol-a", {}, policyForm({ policyNumber: "A-2" }));
    expect(r).toEqual({});
    expect(sharedFake.table("InsurancePolicy").find((p) => p.id === "pol-a")?.policyNumber).toBe("A-2");
  });
});

describe("deleteInsuranceDocumentAction", () => {
  it("refuses another scheme's document even when the policy id matches it", async () => {
    const r = await documentActions.deleteInsuranceDocumentAction(SCHEME_A, "pol-b", "doc-b");
    expect(r.error).toBe("Document not found.");
    expect(sharedFake.table("InsuranceDocument").find((d) => d.id === "doc-b")?.deletedAt).toBeNull();
  });
});

describe("signed URL actions take a document id and sign only the record's own path", () => {
  it("owner: refuses another scheme's document", async () => {
    membership.mockResolvedValue({ profile: { id: "owner-of-a" }, membership: { role: "OWNER" }, roles: ["OWNER"] });
    const r = await ownerActions.getOwnerInsuranceDocumentUrlAction(SCHEME_A, "doc-b");
    expect(r.error).toBe("Document not found.");
    expect(sign).not.toHaveBeenCalled();
  });

  it("owner: refuses claim evidence, which the owner page does not list", async () => {
    membership.mockResolvedValue({ profile: { id: "owner-of-a" }, membership: { role: "OWNER" }, roles: ["OWNER"] });
    const r = await ownerActions.getOwnerInsuranceDocumentUrlAction(SCHEME_A, "evidence-a");
    expect(r.error).toBe("Document not found.");
    expect(sign).not.toHaveBeenCalled();
  });

  it("owner: signs the stored path of a current policy document of the scheme", async () => {
    membership.mockResolvedValue({ profile: { id: "owner-of-a" }, membership: { role: "OWNER" }, roles: ["OWNER"] });
    const r = await ownerActions.getOwnerInsuranceDocumentUrlAction(SCHEME_A, "doc-a");
    expect(r.url).toMatch(/^https:\/\/signed\.example\//);
    expect(sign).toHaveBeenCalledWith(`schemes/${SCHEME_A}/insurance/pol-a/schedule.pdf`);
  });

  it("never hands back a stored web address unsigned", async () => {
    const r = await documentActions.getInsuranceDocumentUrlAction(SCHEME_A, "doc-a-external");
    expect(r.url).toBeUndefined();
    expect(r.error).toBeDefined();
    expect(sign).not.toHaveBeenCalled();
  });

  it("claim evidence: advisers only", async () => {
    membership.mockImplementation(async (_schemeId: string, roles: string[]) => {
      if (!roles.includes("OWNER")) throw new AuthorisationError("You do not have permission to perform this action.");
      return { profile: { id: "owner-of-a" }, membership: { role: "OWNER" }, roles: ["OWNER"] };
    });
    const r = await claimActions.getClaimDocumentUrlAction(SCHEME_A, "evidence-a");
    expect(r.error).toMatch(/permission/);
    expect(sign).not.toHaveBeenCalled();
  });

  it("claim evidence: an adviser cannot sign another scheme's document", async () => {
    const r = await claimActions.getClaimDocumentUrlAction(SCHEME_A, "doc-b");
    expect(r.error).toBe("Document not found.");
    expect(sign).not.toHaveBeenCalled();
  });
});

describe("addClaimNoteAction", () => {
  it("refuses a claim of another scheme", async () => {
    sharedFake.table("InsuranceClaim").push({ id: "claim-b", schemeId: SCHEME_B, deletedAt: null });
    const r = await claimActions.addClaimNoteAction(SCHEME_A, "claim-b", "planted note");
    expect(r.error).toBe("Claim not found.");
    expect(sharedFake.table("InsuranceClaimEvent")).toHaveLength(0);
  });
});
