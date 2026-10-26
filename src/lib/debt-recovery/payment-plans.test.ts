import { describe, expect, it } from "vitest";
import { PAYMENT_PLANS } from "@/config/statutory";
import {
  daysToReply,
  decisionProblems,
  instalmentSchedule,
  replyDueOn,
  requestProblems,
  stepPausedByPlan,
  termsProblems,
} from "./payment-plans";

const rules = PAYMENT_PLANS;

describe("payment plan reply period", () => {
  it("is 28 days from the complete request", () => {
    expect(replyDueOn("2026-10-26", rules)).toBe("2026-11-23");
    expect(daysToReply("2026-11-23", "2026-11-20")).toBe(3);
    expect(daysToReply("2026-11-23", "2026-11-25")).toBe(-2);
  });
});

describe("instalment schedule", () => {
  it("adds up to the total, with the remainder on the last instalment", () => {
    const s = instalmentSchedule({ totalCents: 100_000, numberOfInstalments: 3, startOn: "2026-11-01", frequency: "MONTHLY" });
    expect(s.map((i) => i.amountCents)).toEqual([33_333, 33_333, 33_334]);
    expect(s.map((i) => i.dueOn)).toEqual(["2026-11-01", "2026-12-01", "2027-01-01"]);
  });

  it("keeps monthly instalments on the same day, clamped to the month end", () => {
    const s = instalmentSchedule({ totalCents: 3_000, numberOfInstalments: 3, startOn: "2027-01-31", frequency: "MONTHLY" });
    expect(s.map((i) => i.dueOn)).toEqual(["2027-01-31", "2027-02-28", "2027-03-31"]);
  });

  it("spaces weekly and fortnightly instalments by 7 and 14 days", () => {
    expect(instalmentSchedule({ totalCents: 300, numberOfInstalments: 2, startOn: "2026-11-02", frequency: "WEEKLY" })[1].dueOn).toBe("2026-11-09");
    expect(instalmentSchedule({ totalCents: 300, numberOfInstalments: 2, startOn: "2026-11-02", frequency: "FORTNIGHTLY" })[1].dueOn).toBe("2026-11-16");
  });
});

describe("request as entered from the standard form", () => {
  const ok = {
    ownerNames: "Jo Citizen",
    receivedOn: "2026-10-20",
    hardshipStatement: true,
    currentDebtCents: 250_000,
    proposedInstalmentCents: 25_000,
    proposedFrequency: "MONTHLY",
    proposedMonths: 10,
    interestWaiverRequested: true,
  };

  it("accepts a complete request", () => {
    expect(requestProblems(ok, rules, "2026-10-26")).toEqual({});
  });

  it("needs the owner's name, the hardship statement and a past date", () => {
    const e = requestProblems({ ...ok, ownerNames: " ", hardshipStatement: false, receivedOn: "2026-10-27" }, rules, "2026-10-26");
    expect(Object.keys(e).sort()).toEqual(["hardshipStatement", "ownerNames", "receivedOn"]);
  });

  it("refuses a proposed plan longer than 12 months", () => {
    expect(requestProblems({ ...ok, proposedMonths: 13 }, rules, "2026-10-26").proposedMonths).toMatch(/12 months/);
  });
});

describe("agreed terms", () => {
  const ok = { totalCents: 240_000, numberOfInstalments: 12, frequency: "MONTHLY", startOn: "2026-11-01", agreedOn: "2026-10-26", coversCurrentLevies: false };

  it("accept a plan whose last instalment is within 12 months of agreement", () => {
    expect(termsProblems(ok, rules)).toEqual({});
  });

  it("refuse a plan that runs past 12 months", () => {
    expect(termsProblems({ ...ok, numberOfInstalments: 13 }, rules).numberOfInstalments).toMatch(/more than 12 months/);
    expect(termsProblems({ ...ok, frequency: "WEEKLY", numberOfInstalments: 54 }, rules).numberOfInstalments).toMatch(/more than 12 months/);
  });

  it("refuse a first instalment before the plan was agreed", () => {
    expect(termsProblems({ ...ok, startOn: "2026-10-25" }, rules).startOn).toBeDefined();
  });

  it("allow current levies only for plans agreed from 23 Oct 2026", () => {
    expect(termsProblems({ ...ok, coversCurrentLevies: true }, rules)).toEqual({});
    expect(termsProblems({ ...ok, agreedOn: "2026-10-22", startOn: "2026-11-01", coversCurrentLevies: true }, rules).coversCurrentLevies).toBeDefined();
  });
});

describe("recorded decision", () => {
  const ok = { decision: "APPROVED", body: "STRATA_COMMITTEE", meetingOn: "2026-10-25", majorityVote: true, refusalReasons: "", interestWaiverRequested: false, interestWaiver: "" };

  it("accepts an approval at a committee meeting", () => {
    expect(decisionProblems(ok, "2026-10-20", "2026-10-26")).toEqual({});
  });

  it("needs a majority vote at a meeting held after the request", () => {
    const e = decisionProblems({ ...ok, majorityVote: false, meetingOn: "2026-10-19" }, "2026-10-20", "2026-10-26");
    expect(Object.keys(e).sort()).toEqual(["majorityVote", "meetingOn"]);
  });

  it("needs reasons for a refusal", () => {
    expect(decisionProblems({ ...ok, decision: "REFUSED", refusalReasons: "No." }, "2026-10-20", "2026-10-26").refusalReasons).toBeDefined();
  });

  it("needs a decision on a requested interest waiver", () => {
    expect(decisionProblems({ ...ok, interestWaiverRequested: true }, "2026-10-20", "2026-10-26").interestWaiver).toBeDefined();
    expect(decisionProblems({ ...ok, interestWaiverRequested: true, interestWaiver: "NOT_WAIVED" }, "2026-10-20", "2026-10-26")).toEqual({});
  });
});

describe("recovery while a plan is followed", () => {
  it("pauses the 30-day notice and later steps, not the earlier ones", () => {
    const active = [{ status: "ACTIVE" }];
    expect(stepPausedByPlan("FINAL_NOTICE", active, rules)).toBe(true);
    expect(stepPausedByPlan("PROCEEDINGS", active, rules)).toBe(true);
    expect(stepPausedByPlan("REMINDER_NOTICE", active, rules)).toBe(false);
  });

  it("does not pause once the plan is not followed or is finished", () => {
    expect(stepPausedByPlan("PROCEEDINGS", [{ status: "DEFAULTED" }, { status: "COMPLETED" }], rules)).toBe(false);
  });
});
