/**
 * Charging a late charge passes the interest helpers' own messages through
 * only in the building's words (QLD finance wording review, 28 Oct 2026):
 * "Levy notice not found." for an NSW building, "Contribution notice not
 * found." for a Queensland one, and a word of several parts as it is. Any
 * other word is an unexpected error, so its message is never shown.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/mfa-enforcement", () => ({
  requireRecentMfa: vi.fn(async () => {}),
  getMfaStatus: vi.fn(async () => null),
  enforceMfa: vi.fn(async () => {}),
  enforceMfaFor: vi.fn(async () => {}),
  StepUpRequiredError: class extends Error {},
}));
vi.mock("@/lib/auth/require-membership", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/require-membership")>("@/lib/auth/require-membership");
  return { ...actual, requireSchemeMembership: vi.fn(async () => ({ profile: { id: "adv-1" }, roles: ["ADVISER"] })) };
});
vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/log", async (orig) => ({ ...(await orig()), logError: vi.fn() }));
const thrown = vi.hoisted(() => ({ message: "" }));
const terms = vi.hoisted(() => ({ levy: "levy", lateCharge: "interest" }));
vi.mock("@/lib/queries/interest", async (orig) => ({
  ...(await orig()),
  chargeInterest: vi.fn(async () => {
    throw new Error(thrown.message);
  }),
  chargeInterestBatch: vi.fn(async () => {
    throw new Error(thrown.message);
  }),
}));
vi.mock("@/lib/jurisdiction/scheme-rules", async (orig) => ({
  ...(await orig()),
  messageTermsFor: vi.fn(async () => {
    const { statutoryRulesFor } = await import("@/config/statutory");
    return { ...statutoryRulesFor("NSW").TERMINOLOGY, ...terms };
  }),
}));

const { chargeInterestAction, chargeInterestBatchAction } = await import("./actions");

async function shown(message: string, words: { levy: string; lateCharge: string }) {
  thrown.message = message;
  Object.assign(terms, words);
  const one = (await chargeInterestAction("s1", "n1", 5)).error;
  const batch = (await chargeInterestBatchAction("s1")).error;
  expect(batch).toBe(one);
  return one;
}

const NSW = { levy: "levy", lateCharge: "interest" };
const QLD = { levy: "contribution", lateCharge: "penalty" };

describe("charging a late charge: which messages are shown", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("an NSW building's messages are shown as they always were", async () => {
    expect(await shown("Levy notice not found.", NSW)).toBe("Levy notice not found.");
    expect(await shown("Interest amount must be greater than zero.", NSW)).toBe("Interest amount must be greater than zero.");
  });

  it("a Queensland building's messages are shown in its words", async () => {
    expect(await shown("Contribution notice not found.", QLD)).toBe("Contribution notice not found.");
    expect(await shown("Penalty amount must be greater than zero.", QLD)).toBe("Penalty amount must be greater than zero.");
  });

  it("another building's word, or any other word, is not shown", async () => {
    expect(await shown("Contribution notice not found.", NSW)).toBe("Failed to charge interest.");
    expect(await shown("Levy notice not found.", QLD)).toBe("Failed to charge penalty.");
    expect(await shown("Secret notice not found.", NSW)).toBe("Failed to charge interest.");
  });

  it("a word of several parts matches as it is, and only as it is", async () => {
    const words = { levy: "strata levy", lateCharge: "late payment charge" };
    expect(await shown("Strata levy notice not found.", words)).toBe("Strata levy notice not found.");
    expect(await shown("Late payment charge amount must be greater than zero.", words)).toBe("Late payment charge amount must be greater than zero.");
    expect(await shown("Strata notice not found.", words)).toBe("Failed to charge late payment charge.");
  });

  it("a word with pattern characters matches only literally", async () => {
    const words = { levy: "levy (a.b)", lateCharge: "interest" };
    expect(await shown("Levy (a.b) notice not found.", words)).toBe("Levy (a.b) notice not found.");
    expect(await shown("Levy aXb notice not found.", words)).toBe("Failed to charge interest.");
  });
});
