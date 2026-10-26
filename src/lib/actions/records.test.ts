import { beforeEach, describe, expect, it, vi } from "vitest";

const SCHEME = "aaaaaaaa-0000-0000-0000-000000000001";
const membership = vi.fn();
vi.mock("@/lib/auth/require-membership", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/require-membership")>("@/lib/auth/require-membership");
  return { ...actual, requireSchemeMembership: (...a: unknown[]) => membership(...a) };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const store = {
  createCertificate: vi.fn(async () => ({ id: "c1" })),
  saveCertificateDraft: vi.fn(),
  issueCertificate: vi.fn(async () => ({ cents: 10_900, repeat: false })),
  cancelCertificateDraft: vi.fn(),
  recordFeePaid: vi.fn(),
  createInspection: vi.fn(),
  scheduleInspection: vi.fn(),
  completeInspection: vi.fn(async () => 3_100),
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
