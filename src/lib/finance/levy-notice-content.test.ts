import { describe, expect, it } from "vitest";
import { validateLevyNoticeContent as validateWith, type LevyNoticeContentInput } from "./levy-notice-content";
import { statutoryRulesFor } from "@/config/statutory";

const validateLevyNoticeContent = (n: LevyNoticeContentInput) => validateWith(n, statutoryRulesFor("NSW").NOTICE_RULES);

const complete: LevyNoticeContentInput = {
  scheme: { name: "Harbour View", planNumber: "12345" },
  lotNumber: "4",
  ownerNames: ["A Owner"],
  noticeDate: "2026-11-01",
  dueDate: "2026-12-01",
  fundName: "Administrative Fund",
  amountCents: 125000,
  payment: { accountName: "The Owners SP 12345", bsb: "062-000", accountNumber: "12345678", reference: "LN-0001" },
  contact: { name: "Strata manager", emailOrPhone: "manager@example.com" },
  includesInterestWarning: true,
  includesHardshipStatement: true,
  includesLedgerAccess: true,
};

describe("validateLevyNoticeContent", () => {
  it("passes a complete notice", () => {
    expect(validateLevyNoticeContent(complete)).toEqual([]);
  });

  it("lists every missing item", () => {
    const missing = validateLevyNoticeContent({
      ...complete,
      scheme: { name: "", planNumber: null },
      ownerNames: [],
      payment: { accountName: null, bsb: null, accountNumber: null, reference: null },
      includesHardshipStatement: false,
    }).map((m) => m.code);
    expect(missing).toEqual(expect.arrayContaining(["PLAN_NUMBER", "SCHEME_NAME", "OWNER", "PAYMENT_DETAILS", "PAYMENT_REFERENCE", "HARDSHIP_STATEMENT"]));
  });

  it("needs at least 30 days' notice, or 14 for an urgent special levy", () => {
    expect(validateLevyNoticeContent({ ...complete, dueDate: "2026-11-20" }).map((m) => m.code)).toContain("NOTICE_PERIOD");
    expect(validateLevyNoticeContent({ ...complete, dueDate: "2026-11-20", isUrgentSpecialLevy: true })).toEqual([]);
  });

  it("only requires the hardship statement from 27 October 2025", () => {
    expect(
      validateLevyNoticeContent({ ...complete, noticeDate: "2025-09-01", dueDate: "2025-10-15", includesHardshipStatement: false }),
    ).toEqual([]);
  });
});
