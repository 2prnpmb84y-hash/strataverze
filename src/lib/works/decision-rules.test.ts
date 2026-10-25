import { describe, expect, it } from "vitest";
import { requestStatusLabel, tally, votesRequired, votesSentence } from "./decision-rules";

describe("votes needed under the building's rule", () => {
  it("one member, two members, or a majority", () => {
    expect(votesRequired("ONE", 5)).toEqual({ rule: "ONE", required: 1 });
    expect(votesRequired("TWO", 5)).toEqual({ rule: "TWO", required: 2 });
    expect(votesRequired("MAJORITY", 5)).toEqual({ rule: "MAJORITY", required: 3 });
    expect(votesRequired("MAJORITY", 4)).toEqual({ rule: "MAJORITY", required: 3 });
    expect(votesRequired("MAJORITY", 1)).toEqual({ rule: "MAJORITY", required: 1 });
  });

  it("two members on a committee of one needs that one", () => {
    expect(votesRequired("TWO", 1)).toEqual({ rule: "TWO", required: 1 });
  });

  it("urgent works can be decided by any one member", () => {
    expect(votesRequired("MAJORITY", 7, { urgent: true })).toEqual({ rule: "URGENT", required: 1 });
  });

  it("no committee, no vote", () => {
    expect(votesRequired("TWO", 0)).toBeNull();
  });
});

describe("where a decision stands", () => {
  const v = (...xs: string[]) => xs.map((vote) => ({ vote }));

  it("is made once enough vote for it", () => {
    expect(tally(2, 5, v("FOR"))).toMatchObject({ status: "OPEN", votesFor: 1 });
    expect(tally(2, 5, v("FOR", "AGAINST", "FOR"))).toMatchObject({ status: "DECIDED", votesFor: 2, votesAgainst: 1 });
  });

  it("fails once the rest could no longer reach it", () => {
    // Majority of 5 needs 3: two against leaves 3 who could, three against leaves 2.
    expect(tally(3, 5, v("AGAINST", "AGAINST")).status).toBe("OPEN");
    expect(tally(3, 5, v("AGAINST", "AGAINST", "AGAINST")).status).toBe("NOT_AGREED");
    expect(tally(1, 1, v("AGAINST")).status).toBe("NOT_AGREED");
  });

  it("says where it stands in plain words", () => {
    expect(votesSentence(tally(2, 5, v("FOR")), 2)).toBe("1 of 2 votes needed so far; 1 more to agree.");
    expect(votesSentence(tally(2, 5, v("FOR", "FOR")), 2)).toBe("Agreed (2 for).");
  });
});

describe("status for owners", () => {
  it("in plain words", () => {
    expect(requestStatusLabel({ status: "SUBMITTED" })).toBe("Waiting for the committee");
    expect(requestStatusLabel({ status: "DRAFT", returnReason: "Which unit?" })).toBe("Returned for more detail");
    expect(requestStatusLabel({ status: "PROCUREMENT", isEmergency: true })).toBe("Urgent: contractor being arranged");
    expect(requestStatusLabel({ status: "PROCUREMENT", isEmergency: false })).toBe("Getting quotes");
  });
});
