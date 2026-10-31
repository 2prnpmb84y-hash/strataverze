import { beforeEach, describe, expect, it, vi } from "vitest";

const SCHEME = "aaaaaaaa-0000-0000-0000-000000000001";
const membership = vi.fn();
vi.mock("@/lib/auth/require-membership", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/require-membership")>("@/lib/auth/require-membership");
  return { ...actual, requireSchemeMembership: (...a: unknown[]) => membership(...a) };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// The building's rule pack has the workflows (the NSW switches) unless a test says otherwise.
const ON = { strataInformationCertificate: true, recordsInspections: true };
const features = vi.fn(async (_schemeId: string): Promise<Record<string, boolean | undefined>> => ON);
vi.mock("@/lib/jurisdiction/scheme-rules", async () => {
  const actual = await vi.importActual<typeof import("@/lib/jurisdiction/scheme-rules")>("@/lib/jurisdiction/scheme-rules");
  return { ...actual, rulesForScheme: async (schemeId: string) => ({ rules: { FEATURES: await features(schemeId) }, label: "AU-TEST" }) };
});
const store = {
  createCertificate: vi.fn(async () => ({ id: "c1" })),
  saveCertificateDraft: vi.fn(),
  issueCertificate: vi.fn(async () => ({ cents: 10_900, repeat: false })),
  cancelCertificateDraft: vi.fn(),
  recordFeePaid: vi.fn(),
  createInspection: vi.fn(),
  scheduleInspection: vi.fn(),
  completeInspection: vi.fn(async () => ({ cents: 3_100, gstIncluded: true })),
  refreshCertificateFigures: vi.fn(),
  cancelInspection: vi.fn(),
};
vi.mock("@/lib/records/records-store", async () => {
  const actual = await vi.importActual<typeof import("@/lib/records/records-store")>("@/lib/records/records-store");
  return { RecordsError: actual.RecordsError, ...store };
});
const actions = await import("./records");
const { AuthorisationError } = await import("@/lib/auth/require-membership");
const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
beforeEach(() => vi.clearAllMocks());

describe("certificate and inspection actions", () => {
  it("need the adviser role", async () => {
    membership.mockRejectedValue(new AuthorisationError("You do not have permission to perform this action."));
    const calls = [
      () => actions.createCertificateAction(SCHEME, "lot-1", {}, form({})),
      () => actions.saveCertificateAction(SCHEME, "lot-1", "c1", {}, form({})),
      () => actions.issueCertificateAction(SCHEME, "lot-1", "c1", {}, form({ checkedAll: "on" })),
      () => actions.cancelCertificateAction(SCHEME, "lot-1", "c1"),
      () => actions.recordFeePaidAction(SCHEME, "certificate", "c1", {}, form({})),
      () => actions.createInspectionAction(SCHEME, {}, form({})),
      () => actions.completeInspectionAction(SCHEME, "i1", {}, form({ minutes: "60" })),
    ];
    for (const c of calls) expect((await c()).error).toMatch(/permission/);
    for (const c of membership.mock.calls) expect(c[1]).toEqual(["ADVISER"]);
    expect(store.issueCertificate).not.toHaveBeenCalled();
  });

  it("pass each item's text from the form", async () => {
    membership.mockResolvedValue({ profile: { id: "a1" }, membership: {}, roles: ["ADVISER"] });
    await actions.saveCertificateAction(SCHEME, "lot-1", "c1", {}, form({ requesterName: "Jo", item_1: "Nil", item_12A: "None" }));
    expect(store.saveCertificateDraft).toHaveBeenCalledWith(expect.objectContaining({ certificateId: "c1", itemTexts: { "1": "Nil", "12A": "None" } }));
  });

  it("save what is on the screen, then issue, in one step", async () => {
    membership.mockResolvedValue({ profile: { id: "a1" }, membership: {}, roles: ["ADVISER"] });
    const order: string[] = [];
    store.saveCertificateDraft.mockImplementationOnce(async () => void order.push("save"));
    store.issueCertificate.mockImplementationOnce(async () => (order.push("issue"), { cents: 9_400, repeat: true }));
    const r = await actions.saveCertificateAction(SCHEME, "lot-1", "c1", {}, form({ intent: "issue", checkedAll: "on", item_1: "Nil" }));
    expect(order).toEqual(["save", "issue"]);
    expect(r.success).toMatch(/\$94\.00/);
  });

  it("issue only with every item confirmed as checked", async () => {
    membership.mockResolvedValue({ profile: { id: "a1" }, membership: {}, roles: ["ADVISER"] });
    await actions.issueCertificateAction(SCHEME, "lot-1", "c1", {}, form({}));
    expect(store.issueCertificate).toHaveBeenCalledWith(expect.objectContaining({ checkedAll: false }));
  });
});

describe("a building whose rule pack does not have the workflow", () => {
  it("refuses to start a certificate or record an inspection, writing nothing", async () => {
    membership.mockResolvedValue({ profile: { id: "a1" }, membership: {}, roles: ["ADVISER"] });
    // Stage 2, step 9: a certificate needs either the NSW s 184 certificate or the Queensland body corporate certificate.
    // PR 10a: the gates are certificateOffered and accessOffered (src/lib/records/offered.ts), read from the building's pack.
    const off = [
      { strataInformationCertificate: false, recordsInspections: false },
      { strataInformationCertificate: false, bodyCorporateCertificate: false, recordsInspections: false },
      { strataInformationCertificate: false, bodyCorporateCertificate: false, certificateKinds: false, recordsInspections: false, recordsAccess: false },
    ];
    try {
      for (const f of off) {
        features.mockResolvedValue(f);
        expect((await actions.createCertificateAction(SCHEME, "lot-1", {}, form({}))).error).toBe("This is not available for this building.");
        expect((await actions.createInspectionAction(SCHEME, {}, form({}))).error).toBe("This is not available for this building.");
      }
      expect(features.mock.calls.every((c) => c[0] === SCHEME)).toBe(true);
      expect(store.createCertificate).not.toHaveBeenCalled();
      expect(store.createInspection).not.toHaveBeenCalled();
    } finally {
      features.mockResolvedValue(ON);
    }
  });

  it("starts a certificate for either certificate switch, and records an inspection for the inspections switch", async () => {
    membership.mockResolvedValue({ profile: { id: "a1" }, membership: {}, roles: ["ADVISER"] });
    try {
      features.mockResolvedValue({ strataInformationCertificate: false, bodyCorporateCertificate: true, recordsInspections: true });
      expect((await actions.createCertificateAction(SCHEME, "lot-1", {}, form({}))).success).toBeDefined();
      expect((await actions.createInspectionAction(SCHEME, {}, form({}))).success).toBeDefined();
      expect(store.createCertificate).toHaveBeenCalledTimes(1);
      expect(store.createInspection).toHaveBeenCalledTimes(1);
    } finally {
      features.mockResolvedValue(ON);
    }
  });
});
