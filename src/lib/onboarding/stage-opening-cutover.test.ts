import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  createCutover: vi.fn(async (..._a: unknown[]) => "batch-1"),
  stageCutoverFile: vi.fn(async (..._a: unknown[]) => ({ headers: [], mapping: {}, missing: [] as string[], staged: true })),
  discardDraftCutover: vi.fn(async (..._a: unknown[]) => {}),
}));

vi.mock("@/lib/finance/migration-batches", async () => {
  class CutoverError extends Error {}
  return {
    CutoverError,
    ONBOARDING_SOURCE: { value: "onboarding", label: "StrataVerze onboarding" },
    createCutover: m.createCutover,
    stageCutoverFile: m.stageCutoverFile,
    discardDraftCutover: m.discardDraftCutover,
    loadCutoverLookups: async () => ({
      funds: [
        { id: "admin", name: "Administrative Fund", fundType: "ADMINISTRATIVE" },
        { id: "cw", name: "Capital Works Fund", fundType: "CAPITAL_WORKS" },
      ],
      accounts: [
        { id: "1", code: "1-1000", accountType: "ASSET", accountSubType: "BANK", fundId: "admin" },
        { id: "2", code: "1-1100", accountType: "ASSET", accountSubType: "ACCOUNTS_RECEIVABLE", fundId: "admin" },
        { id: "3", code: "1-2100", accountType: "ASSET", accountSubType: "ACCOUNTS_RECEIVABLE", fundId: "cw" },
        { id: "4", code: "2-1000", accountType: "LIABILITY", accountSubType: "ACCOUNTS_PAYABLE", fundId: "admin" },
        { id: "5", code: "2-1300", accountType: "LIABILITY", accountSubType: "LEVIES_IN_ADVANCE", fundId: "admin" },
        { id: "6", code: "3-1100", accountType: "EQUITY", accountSubType: "OPENING_BALANCE", fundId: "admin" },
        { id: "7", code: "3-2100", accountType: "EQUITY", accountSubType: "OPENING_BALANCE", fundId: "cw" },
      ],
      lots: [],
      suppliers: [],
      bankAccounts: [],
      lotEntitlement: new Map(),
    }),
  };
});

const { stageOnboardingCutover } = await import("./stage-opening-cutover");

const fund = (receivable: number, inAdvance: number, balance: number) => ({ cashAtBank: balance - receivable + inAdvance, leviesReceivable: receivable, leviesInAdvance: inAdvance, creditors: 0, fundBalance: balance });
const input = {
  schemeId: "scheme-1",
  actorId: "admin",
  takeoverDate: "2026-09-30",
  balances: { admin: fund(10000, 5000, 100000), capitalWorks: fund(0, 0, 50000) },
  lotBalances: [
    { lotNumber: "1", admin: 10000, capitalWorks: 0, interest: 0, unallocated: 0, interestAdmin: 0, interestCapitalWorks: 0 },
    { lotNumber: "2", admin: 0, capitalWorks: 0, interest: 0, unallocated: 5000, interestAdmin: 0, interestCapitalWorks: 0 },
  ],
};

beforeEach(() => {
  m.createCutover.mockClear();
  m.stageCutoverFile.mockReset();
  m.stageCutoverFile.mockResolvedValue({ headers: [], mapping: {}, missing: [], staged: true });
  m.discardDraftCutover.mockClear();
});

describe("stageOnboardingCutover", () => {
  it("creates an onboarding draft (internal source) and stages every file", async () => {
    await expect(stageOnboardingCutover(input)).resolves.toBe("batch-1");
    expect(m.createCutover).toHaveBeenCalledWith(expect.objectContaining({ sourceSystem: "onboarding", cutoverDate: "2026-09-30" }), { onboarding: true });
    expect(m.stageCutoverFile.mock.calls.map((c) => (c[0] as { dataType: string }).dataType)).toEqual(["opening_balances", "levy_arrears", "owner_credits"]);
    expect(m.discardDraftCutover).not.toHaveBeenCalled();
  });

  it("discards the draft if any file cannot be staged, so no half-filled draft is left", async () => {
    m.stageCutoverFile.mockResolvedValueOnce({ headers: [], mapping: {}, missing: [], staged: true }).mockRejectedValueOnce(new Error("timeout"));
    await expect(stageOnboardingCutover(input)).rejects.toThrow("timeout");
    expect(m.discardDraftCutover).toHaveBeenCalledWith("scheme-1", "batch-1");
  });

  it("creates nothing when every balance is zero", async () => {
    const zero = { cashAtBank: 0, leviesReceivable: 0, leviesInAdvance: 0, creditors: 0, fundBalance: 0 };
    await expect(stageOnboardingCutover({ ...input, balances: { admin: zero, capitalWorks: zero }, lotBalances: [] })).resolves.toBeNull();
    expect(m.createCutover).not.toHaveBeenCalled();
  });
});
