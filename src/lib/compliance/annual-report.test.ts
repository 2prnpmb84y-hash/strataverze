import { describe, expect, it } from "vitest";
import { ANNUAL_REPORTING, RECORD_RETENTION } from "@/config/statutory";
import { annualReportStatus, keepUntil, reportDueOn } from "./annual-report";

const rules = ANNUAL_REPORTING;
const base = { lastAgmOn: "2026-09-15", reportedOn: null, schemeLots: 40, today: "2026-10-26" };

describe("Strata Hub annual report", () => {
  it("is due within 3 months of the AGM", () => {
    expect(reportDueOn("2026-09-15", rules)).toBe("2026-12-15");
    expect(annualReportStatus(base, rules)).toEqual({ status: "DUE", dueOn: "2026-12-15", daysLeft: 50 });
    expect(annualReportStatus({ ...base, today: "2026-12-16" }, rules).status).toBe("OVERDUE");
  });

  it("is done once reported, and waits for an AGM", () => {
    expect(annualReportStatus({ ...base, reportedOn: "2026-10-01" }, rules).status).toBe("REPORTED");
    expect(annualReportStatus({ ...base, lastAgmOn: null }, rules).status).toBe("NO_AGM");
  });

  it("is not required for a two-lot scheme from 1 Oct 2026", () => {
    expect(annualReportStatus({ ...base, schemeLots: 2 }, rules).status).toBe("EXEMPT");
    expect(annualReportStatus({ ...base, schemeLots: 2, today: "2026-09-30" }, rules).status).toBe("DUE");
  });
});

describe("record keeping", () => {
  it("keeps records 7 years and by-laws for the life of the scheme", () => {
    expect(keepUntil("FINANCIAL", "2026-10-26T03:00:00Z", RECORD_RETENTION)).toBe("2033-10-26");
    expect(keepUntil("MINUTES", "2024-02-29", RECORD_RETENTION)).toBe("2031-02-28");
    expect(keepUntil("BYLAW", "2026-10-26", RECORD_RETENTION)).toBe("LIFE");
    expect(keepUntil("SOMETHING_NEW", "2026-10-26", RECORD_RETENTION)).toBe("2033-10-26");
  });
});
