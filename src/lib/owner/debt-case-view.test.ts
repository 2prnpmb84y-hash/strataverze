import { describe, expect, it } from "vitest";
import { caseViewerFor, debtorCaseView, debtorMayView } from "./debt-case-view";

const A = "scheme-a";
const debtCase = { schemeId: A, lotId: "lot-1", ownerId: "debtor" };
const now = new Date("2026-10-23T00:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();

describe("debtorMayView", () => {
  it("allows the current owner of the lot", () => {
    expect(debtorMayView(debtCase, "debtor", [{ schemeId: A, lotId: "lot-1", role: "OWNER", isActive: true }], now)).toBe(true);
  });

  it("allows a former owner for 30 days, then not", () => {
    const former = (n: number) => [{ schemeId: A, lotId: "lot-1", role: "OWNER", isActive: false, endDate: daysAgo(n) }];
    expect(debtorMayView(debtCase, "debtor", former(10), now)).toBe(true);
    expect(debtorMayView(debtCase, "debtor", former(31), now)).toBe(false);
  });

  it("rejects an inactive membership with no end date, or another lot", () => {
    expect(debtorMayView(debtCase, "debtor", [{ schemeId: A, lotId: "lot-1", role: "OWNER", isActive: false }], now)).toBe(false);
    expect(debtorMayView(debtCase, "debtor", [{ schemeId: A, lotId: "lot-2", role: "OWNER", isActive: true }], now)).toBe(false);
  });

  it("gives a co-owner of the lot the debtor view (they are jointly liable)", () => {
    expect(debtorMayView(debtCase, "co-owner", [{ schemeId: A, lotId: "lot-1", role: "OWNER", isActive: true }], now)).toBe(true);
  });
});

describe("caseViewerFor", () => {
  it("gives a committee member who co-owns the lot only the debtor view", () => {
    expect(
      caseViewerFor(
        debtCase,
        "co-owner",
        [
          { schemeId: A, lotId: null, role: "COMMITTEE", isActive: true },
          { schemeId: A, lotId: "lot-1", role: "OWNER", isActive: true },
        ],
        now,
      ),
    ).toBe("debtor");
  });

  it("gives the committee of the case's scheme the full case", () => {
    expect(caseViewerFor(debtCase, "cm", [{ schemeId: A, lotId: null, role: "COMMITTEE", isActive: true }], now)).toBe("committee");
  });

  it("gives a committee member who is the debtor only the debtor view", () => {
    expect(
      caseViewerFor(
        debtCase,
        "debtor",
        [
          { schemeId: A, lotId: null, role: "COMMITTEE", isActive: true },
          { schemeId: A, lotId: "lot-1", role: "OWNER", isActive: true },
        ],
        now,
      ),
    ).toBe("debtor");
  });

  it("gives an inactive committee member or another owner nothing", () => {
    expect(caseViewerFor(debtCase, "cm", [{ schemeId: A, lotId: null, role: "COMMITTEE", isActive: false }], now)).toBeNull();
    expect(caseViewerFor(debtCase, "neighbour", [{ schemeId: A, lotId: "lot-2", role: "OWNER", isActive: true }], now)).toBeNull();
  });
});

describe("debtorCaseView", () => {
  it("removes internal notes, solicitor details, evidence and drafts", () => {
    const view = debtorCaseView({
      id: "case-1",
      totalOwed: 1000,
      solicitorName: "Smith Legal",
      solicitorRef: "S-1",
      courtFileNumber: "2026/1",
      disputeDetails: "internal",
      hardshipDetails: "internal",
      notes: "Owner is difficult",
      steps: [{ stepType: "REMINDER_NOTICE", evidenceNotes: "called twice", outcome: "no answer" }],
      documents: [
        { id: "d1", documentType: "DEMAND_NOTICE", isDraft: false },
        { id: "d2", documentType: "DEMAND_NOTICE", isDraft: true },
        { id: "d3", documentType: "SOLICITOR_REFERRAL", isDraft: false },
        { id: "d4", documentType: "COMMITTEE_REPORT", isDraft: false },
      ],
      activities: [{ id: "a1", description: "internal" }],
    });
    expect(view).toMatchObject({
      id: "case-1",
      totalOwed: 1000,
      solicitorName: null,
      solicitorRef: null,
      courtFileNumber: null,
      notes: null,
      disputeDetails: null,
      hardshipDetails: null,
      activities: [],
    });
    expect(view.steps[0]).toMatchObject({ stepType: "REMINDER_NOTICE", evidenceNotes: null, outcome: null });
    expect(view.documents.map((d) => d.id)).toEqual(["d1"]);
  });
});
