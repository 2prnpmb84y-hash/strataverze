/**
 * Voting by an owner whose lot owes money (stage 2, step 7): enforced only
 * for a pack that records the rule (Queensland SM s 102(2)); NSW records none,
 * so nothing is checked or read for an NSW building.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const schemeFirst = vi.fn();
const noticesAll = vi.fn();
const noticeWhere = vi.fn();
vi.mock("@/prisma/db", () => {
  const chain = (terminal: Record<string, unknown>) => {
    const c: Record<string, unknown> = { ...terminal };
    for (const m of ["limit", "orderBy", "include"]) c[m] = () => c;
    c.where = (fn: unknown) => {
      noticeWhere(fn);
      return c;
    };
    return c;
  };
  return {
    db: {
      orm: {
        public: {
          Scheme: chain({ first: () => schemeFirst() }),
          LevyNotice: chain({ all: () => noticesAll() }),
        },
      },
    },
  };
});
vi.mock("@prisma/orm-postgres/orm-client", () => ({ and: (...c: unknown[]) => c }));
// Queensland is not active yet: give it the pending pack, as it will be once it is.
vi.mock("@/config/statutory", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/config/statutory")>();
  return {
    ...actual,
    rulePackFor: (state: string) =>
      state === "QLD" ? { ...actual.PENDING_RULE_PACKS.QLD, rules: actual.PENDING_RULE_PACKS.QLD.rules } : actual.rulePackFor(state),
  };
});

import { MEETING_RULES as NSW_RULE_SET, PENDING_RULE_PACKS } from "@/config/statutory";
import { checksDebtorVotes, debtorVoteRefusal } from "./debtor-voting";
import { debtorVoteProblem } from "./debtor-voting-repo";

const QLD = PENDING_RULE_PACKS.QLD.rules.MEETING_RULES;
const overdue = { lotId: "lot-1", status: "ISSUED", dueDate: "2020-01-01", balanceOutstanding: "120.00" };
const paid = { lotId: "lot-2", status: "PAID", dueDate: "2020-01-01", balanceOutstanding: "0" };

describe("debtorVoteRefusal (pure)", () => {
  it("never refuses under the NSW rules, which record no such rule", () => {
    expect(checksDebtorVotes(NSW_RULE_SET)).toBe(false);
    for (const c of ["ORDINARY", "SPECIAL", "UNANIMOUS", null]) expect(debtorVoteRefusal(NSW_RULE_SET, c, true, "owners corporation")).toBeNull();
  });

  it("lets a Queensland lot owing money vote only on a resolution without dissent", () => {
    expect(checksDebtorVotes(QLD)).toBe(true);
    expect(debtorVoteRefusal(QLD, "WITHOUT_DISSENT", true, "body corporate")).toBeNull();
    const refusal = debtorVoteRefusal(QLD, "ORDINARY", true, "body corporate");
    expect(refusal).toBe(
      "Your lot has an overdue amount owing to the body corporate, so it cannot vote on this motion. Until it is paid, the lot can vote only on a resolution without dissent.",
    );
    expect(refusal).not.toMatch(/[;–—]/);
    expect(debtorVoteRefusal(QLD, "SPECIAL", true, "body corporate")).not.toBeNull();
  });

  it("never refuses an item with no category (the committee election, SM s 102(2))", () => {
    for (const c of [null, undefined, "", "  "]) expect(debtorVoteRefusal(QLD, c, true, "body corporate")).toBeNull();
  });

  it("lets a lot that owes nothing vote on anything", () => {
    expect(debtorVoteRefusal(QLD, "ORDINARY", false, "body corporate")).toBeNull();
  });
});

describe("debtorVoteProblem (reads the building)", () => {
  beforeEach(() => {
    schemeFirst.mockReset();
    noticesAll.mockReset();
    noticeWhere.mockReset();
  });

  it("reads no levy notices for an NSW building", async () => {
    schemeFirst.mockResolvedValue({ id: "s", state: "NSW", timeZone: "Australia/Sydney" });
    expect(await debtorVoteProblem({ schemeId: "s", lotIds: ["lot-1"], category: "ORDINARY" })).toBeNull();
    expect(noticesAll).not.toHaveBeenCalled();
  });

  it("goes ahead when the building is not found (the action's own checks decide)", async () => {
    schemeFirst.mockResolvedValue(null);
    expect(await debtorVoteProblem({ schemeId: "s", lotIds: ["lot-1"], category: "ORDINARY" })).toBeNull();
  });

  it("refuses a Queensland lot with an overdue notice on an ordinary resolution", async () => {
    schemeFirst.mockResolvedValue({ id: "s", state: "QLD", timeZone: "Australia/Brisbane" });
    noticesAll.mockResolvedValue([overdue]);
    const problem = await debtorVoteProblem({ schemeId: "s", lotIds: ["lot-1"], category: "ORDINARY" });
    expect(problem).toContain("cannot vote on this motion");
  });

  it("reads only issued, unpaid notices due before the building's today, for the caller's lots, without a row limit", async () => {
    schemeFirst.mockResolvedValue({ id: "s", state: "QLD", timeZone: "Australia/Brisbane" });
    noticesAll.mockResolvedValue([]);
    expect(await debtorVoteProblem({ schemeId: "s", lotIds: ["lot-1", "lot-1", "lot-2"], category: "ORDINARY" })).toBeNull();
    // The last where is the notice read; record what it filters on.
    const fn = noticeWhere.mock.calls[noticeWhere.mock.calls.length - 1][0] as (n: unknown) => unknown;
    const seen: Record<string, unknown> = {};
    const field = (name: string) => ({
      eq: (v: unknown) => (seen[`${name}.eq`] = v),
      in: (v: unknown) => (seen[`${name}.in`] = v),
      lt: (v: unknown) => (seen[`${name}.lt`] = v),
    });
    fn({ schemeId: field("schemeId"), lotId: field("lotId"), status: field("status"), dueDate: field("dueDate") });
    expect(seen["schemeId.eq"]).toBe("s");
    expect(seen["lotId.in"]).toEqual(["lot-1", "lot-2"]);
    expect(seen["status.in"]).toEqual(["ISSUED", "PARTIALLY_PAID", "OVERDUE"]);
    expect(String(seen["dueDate.lt"])).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("refuses a committee election item never, and reads nothing for it", async () => {
    schemeFirst.mockResolvedValue({ id: "s", state: "QLD", timeZone: "Australia/Brisbane" });
    expect(await debtorVoteProblem({ schemeId: "s", lotIds: ["lot-1"], category: null })).toBeNull();
    expect(noticesAll).not.toHaveBeenCalled();
  });

  it("does not read notices for a resolution without dissent", async () => {
    schemeFirst.mockResolvedValue({ id: "s", state: "QLD", timeZone: "Australia/Brisbane" });
    expect(await debtorVoteProblem({ schemeId: "s", lotIds: ["lot-1"], category: "WITHOUT_DISSENT" })).toBeNull();
    expect(noticesAll).not.toHaveBeenCalled();
  });

  it("lets the vote count when one of the caller's lots owes nothing", async () => {
    schemeFirst.mockResolvedValue({ id: "s", state: "QLD", timeZone: "Australia/Brisbane" });
    noticesAll.mockResolvedValue([overdue, paid]);
    expect(await debtorVoteProblem({ schemeId: "s", lotIds: ["lot-1", "lot-2"], category: "ORDINARY" })).toBeNull();
  });
});
