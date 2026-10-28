/**
 * The helpers that give a page or message its words never throw (QLD finance
 * wording review, 28 Oct 2026). A building in a state with no live pack
 * (Victoria, while its pack is a draft, or none recorded) is left out of a
 * list's words, or given the default state's, so it never fails a page.
 * Queensland stood for such a state until its pack was switched on
 * (28 Oct 2026): it now gets its own words.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));

const { sharedFake } = await import("@/test/fake-orm");
const { messageTermsFor, rulesForListedStates, rulesForWords } = await import("./scheme-rules");
const { statutoryRulesFor, RULE_PACKS } = await import("@/config/statutory");
const NSW = statutoryRulesFor("NSW");
const QLD = statutoryRulesFor("QLD");

beforeEach(() => {
  sharedFake.reset({
    Scheme: [
      { id: "v1", state: "VIC", name: "Docklands" },
      { id: "q1", state: "QLD", name: "Surfers" },
      { id: "n1", state: "NSW", name: "Harbour View" },
      { id: "x1", state: null, name: "No state" },
    ],
  });
});

describe("words for buildings with no live pack", () => {
  it("Victoria has no live pack, so these tests stand for any state without one", () => {
    expect(RULE_PACKS.VIC).toBeUndefined();
  });

  it("rulesForListedStates leaves out the states with no pack and keeps each pack once", () => {
    expect(() => rulesForListedStates(["VIC", "WA", null, "NSW"])).not.toThrow();
    expect(rulesForListedStates(["VIC", "WA", null, "NSW", "nsw"])).toEqual([NSW]);
    expect(rulesForListedStates(["VIC", "WA", null, undefined])).toEqual([]);
  });

  it("messageTermsFor falls back to the NSW words for a building it cannot read", async () => {
    await expect(messageTermsFor("missing")).resolves.toEqual(NSW.TERMINOLOGY);
    await expect(messageTermsFor("v1")).resolves.toEqual(NSW.TERMINOLOGY);
    await expect(messageTermsFor("x1")).resolves.toEqual(NSW.TERMINOLOGY);
    await expect(messageTermsFor("n1")).resolves.toEqual(NSW.TERMINOLOGY);
  });

  it("rulesForWords gives each building its pack, or the NSW one", () => {
    for (const state of ["VIC", "WA", null, undefined, ""]) expect(rulesForWords(state)).toBe(NSW);
    expect(rulesForWords("NSW")).toBe(NSW);
  });
});

describe("words for a Queensland building, now its pack is live", () => {
  it("are Queensland's own, never the NSW ones", async () => {
    expect(rulesForListedStates(["QLD", "VIC", "NSW", "qld"])).toEqual([QLD, NSW]);
    await expect(messageTermsFor("q1")).resolves.toEqual(QLD.TERMINOLOGY);
    expect(rulesForWords("QLD")).toBe(QLD);
    expect(QLD.TERMINOLOGY).not.toEqual(NSW.TERMINOLOGY);
  });
});
