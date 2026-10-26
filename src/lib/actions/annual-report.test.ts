import { beforeEach, describe, expect, it, vi } from "vitest";

const SCHEME = "aaaaaaaa-0000-0000-0000-000000000001";
const membership = vi.fn();
vi.mock("@/lib/auth/require-membership", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/require-membership")>("@/lib/auth/require-membership");
  return { ...actual, requireSchemeMembership: (...a: unknown[]) => membership(...a) };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/jurisdiction/scheme-time", () => ({ schemeToday: vi.fn(async () => "2026-10-26") }));
const store = { recordAgmHeld: vi.fn(), recordReported: vi.fn() };
vi.mock("@/lib/compliance/annual-report-store", async () => {
  const actual = await vi.importActual<typeof import("@/lib/compliance/annual-report-store")>("@/lib/compliance/annual-report-store");
  return { AnnualReportError: actual.AnnualReportError, ...store };
});
const actions = await import("./annual-report");
const { AuthorisationError } = await import("@/lib/auth/require-membership");
const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
beforeEach(() => vi.clearAllMocks());

describe("Strata Hub actions", () => {
  it("need the adviser role", async () => {
    membership.mockRejectedValue(new AuthorisationError("You do not have permission to perform this action."));
    expect((await actions.recordReportedAction(SCHEME, {}, form({ agmOn: "2026-09-15", reportedOn: "2026-10-01" }))).error).toMatch(/permission/);
    expect((await actions.recordAgmHeldAction(SCHEME, {}, form({ agmOn: "2026-09-15" }))).error).toMatch(/permission/);
    for (const c of membership.mock.calls) expect(c[1]).toEqual(["ADVISER"]);
    expect(store.recordReported).not.toHaveBeenCalled();
  });

  it("record the report with the building's today, and keep the values after an error", async () => {
    membership.mockResolvedValue({ profile: { id: "adviser-1" }, membership: {}, roles: ["ADVISER"] });
    await actions.recordReportedAction(SCHEME, {}, form({ agmOn: "2026-09-15", reportedOn: "2026-10-01", reference: "SH-1" }));
    expect(store.recordReported).toHaveBeenCalledWith(expect.objectContaining({ schemeId: SCHEME, agmOn: "2026-09-15", reportedOn: "2026-10-01", reference: "SH-1", actorId: "adviser-1", today: "2026-10-26" }));
    const { AnnualReportError } = await import("@/lib/compliance/annual-report-store");
    store.recordReported.mockRejectedValueOnce(new AnnualReportError("Check the report details.", { reportedOn: "x" }));
    const r = await actions.recordReportedAction(SCHEME, {}, form({ agmOn: "2026-09-15", reportedOn: "2027-01-01", reference: "kept" }));
    expect(r.values?.reference).toBe("kept");
  });
});
