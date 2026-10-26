import { describe, expect, it } from "vitest";
import { COMMITTEE_TRAINING } from "@/config/statutory";
import { trainingDueOn, trainingStatus } from "./committee-training";

const rules = COMMITTEE_TRAINING;
const base = { appointedOn: "2026-10-01", completedOn: null, exemption: null, schemeLots: 40, today: "2026-11-01" };

describe("committee training", () => {
  it("is due within 3 months of appointment (the published examples)", () => {
    expect(trainingDueOn("2026-10-01", rules)).toBe("2027-01-01");
    expect(trainingDueOn("2027-06-01", rules)).toBe("2027-09-01");
  });

  it("counts down, then is overdue", () => {
    expect(trainingStatus(base, rules)).toEqual({ status: "DUE", dueOn: "2027-01-01", daysLeft: 61 });
    expect(trainingStatus({ ...base, today: "2027-01-02" }, rules)).toEqual({ status: "OVERDUE", dueOn: "2027-01-01", daysLeft: -1 });
  });

  it("is not required for a member appointed before 1 Oct 2026 until next appointed", () => {
    expect(trainingStatus({ ...base, appointedOn: "2026-09-30" }, rules).status).toBe("NOT_YET_REQUIRED");
  });

  it("is met by a recorded completion, or an exemption, or a two-lot scheme", () => {
    expect(trainingStatus({ ...base, completedOn: "2026-10-20" }, rules).status).toBe("TRAINED");
    expect(trainingStatus({ ...base, exemption: "STRATA_MANAGING_AGENT" }, rules).status).toBe("EXEMPT");
    expect(trainingStatus({ ...base, schemeLots: 2 }, rules).status).toBe("SCHEME_EXEMPT");
    expect(trainingStatus({ ...base, exemption: "SOMETHING_ELSE" }, rules).status).toBe("DUE");
  });
});
