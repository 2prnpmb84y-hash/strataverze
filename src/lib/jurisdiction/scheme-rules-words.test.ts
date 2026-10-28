/**
 * The helpers that give a page or message its words never throw (QLD finance
 * wording review, 28 Oct 2026). A building in a state with no live pack
 * (Queensland while its pack is pending, Victoria, none recorded) is left out
 * of a list's words, or given the default state's, so it never fails a page.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));

const { sharedFake } = await import("@/test/fake-orm");
const { messageTermsFor, rulesForListedStates, rulesForWords } = await import("./scheme-rules");
const { statutoryRulesFor, RULE_PACKS } = await import("@/config/statutory");
const NSW = statutoryRulesFor("NSW");

beforeEach(() => {
  sharedFake.reset({ Scheme: [{ id: "q1", state: "QLD", name: "Surfers" }, { id: "n1", state: "NSW", name: "Harbour View" }, { id: "x1", state: null, name: "No state" }] });
});

describe("words for buildings with no live pack", () => {
  it("Queensland is still pending here, so these tests stand for any state without a live pack", () => {
    expect(RULE_PACKS.QLD).toBeUndefined();
  });

  it("rulesForListedStates leaves out the states with no pack and keeps NSW once", () => {
    expect(() => rulesForListedStates(["QLD", "VIC", null, "NSW"])).not.toThrow();
    expect(rulesForListedStates(["QLD", "VIC", null, "NSW", "nsw"])).toEqual([NSW]);
    expect(rulesForListedStates(["QLD", "VIC", null, undefined])).toEqual([]);
  });

  it("messageTermsFor falls back to the NSW words for a building it cannot read", async () => {
    await expect(messageTermsFor("missing")).resolves.toEqual(NSW.TERMINOLOGY);
    await expect(messageTermsFor("q1")).resolves.toEqual(NSW.TERMINOLOGY);
    await expect(messageTermsFor("x1")).resolves.toEqual(NSW.TERMINOLOGY);
    await expect(messageTermsFor("n1")).resolves.toEqual(NSW.TERMINOLOGY);
  });

  it("rulesForWords gives each building its pack, or the NSW one", () => {
    for (const state of ["QLD", "VIC", null, undefined, ""]) expect(rulesForWords(state)).toBe(NSW);
    expect(rulesForWords("NSW")).toBe(NSW);
  });
});
