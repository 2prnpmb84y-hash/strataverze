import { beforeEach, describe, expect, it, vi } from "vitest";

/** Who may record committee training (the actions called directly, bypassing the UI). */
const SCHEME = "aaaaaaaa-0000-0000-0000-000000000001";
const membership = vi.fn();
vi.mock("@/lib/auth/require-membership", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/require-membership")>("@/lib/auth/require-membership");
  return { ...actual, requireSchemeMembership: (...a: unknown[]) => membership(...a) };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/jurisdiction/scheme-time", () => ({ schemeToday: vi.fn(async () => "2026-10-26"), schemeTimeZone: vi.fn(async () => "Australia/Sydney") }));
const store = { saveCommitteeTraining: vi.fn(), recordOwnCompletion: vi.fn() };
vi.mock("@/lib/governance/committee-training-store", async () => {
  const actual = await vi.importActual<typeof import("@/lib/governance/committee-training-store")>("@/lib/governance/committee-training-store");
  return { TrainingError: actual.TrainingError, ...store };
});

const actions = await import("./committee-training");
const { AuthorisationError } = await import("@/lib/auth/require-membership");
const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

beforeEach(() => vi.clearAllMocks());

describe("committee training actions", () => {
  it("only an adviser records another member's training", async () => {
    membership.mockRejectedValue(new AuthorisationError("You do not have permission to perform this action."));
    const r = await actions.saveCommitteeTrainingAction(SCHEME, "member-1", {}, form({ appointedOn: "2026-10-01" }));
    expect(r.error).toMatch(/permission/);
    expect(membership).toHaveBeenCalledWith(SCHEME, ["ADVISER"]);
    expect(store.saveCommitteeTraining).not.toHaveBeenCalled();
  });

  it("a member records only their own completion, from their own membership", async () => {
    membership.mockResolvedValue({ profile: { id: "member-1" }, membership: { startDate: "2026-10-05T01:00:00Z" }, roles: ["COMMITTEE"] });
    const r = await actions.recordMyTrainingAction(SCHEME, {}, form({ completedOn: "2026-10-20", profileId: "someone-else" }));
    expect(r.success).toBeDefined();
    expect(membership).toHaveBeenCalledWith(SCHEME, ["COMMITTEE"]);
    expect(store.recordOwnCompletion).toHaveBeenCalledWith(expect.objectContaining({ schemeId: SCHEME, profileId: "member-1", completedOn: "2026-10-20", defaultAppointedOn: "2026-10-05" }));
  });
});
