import { describe, expect, it } from "vitest";
import { QLD_RULE_PACK, statutoryRulesFor, type NswRules, type StatutoryRules } from "@/config/statutory";
import { actName, bodyCorporateName, bodyCorporateShortName, capitalise, graceText, lateChargeWords, noticeLeadText, planLine } from "./wording";

const NSW = statutoryRulesFor("NSW") as NswRules;
const QLD = QLD_RULE_PACK.rules;

describe("wording from the rules", () => {
  it("gives the NSW phrases the platform has always used", () => {
    expect(noticeLeadText(NSW.LEVY_NOTICE_RULES)).toBe("5 weeks");
    expect(graceText(NSW.STATUTORY_INTEREST)).toBe("one month");
    expect(actName(NSW.TERMINOLOGY)).toBe("Strata Schemes Management Act 2015 (NSW)");
    expect(capitalise(NSW.TERMINOLOGY.ownersCorporation)).toBe("Owners corporation");
  });

  it("follows the rule's value", () => {
    expect(noticeLeadText({ issueDaysBeforeDue: 7 })).toBe("1 week");
    expect(noticeLeadText({ issueDaysBeforeDue: 40 })).toBe("40 days");
    expect(graceText({ graceMonths: 2 })).toBe("two months");
  });
});

describe("the plan and the legal entity, from the pack's terms", () => {
  const scheme = { name: "Harbour View", planNumber: "12345" };

  it("names the plan before its number, or nothing without a number", () => {
    expect(planLine(NSW.TERMINOLOGY, "12345")).toBe("Strata Plan 12345");
    expect(planLine(QLD.TERMINOLOGY, "12345")).toBe("Community titles scheme 12345");
    expect(planLine(NSW.TERMINOLOGY, null)).toBeNull();
    expect(planLine(QLD.TERMINOLOGY, "")).toBeNull();
  });

  it("gives the NSW owners corporation's name as the invoice always has", () => {
    expect(bodyCorporateName(NSW.TERMINOLOGY, scheme)).toBe("The Owners - Strata Plan No. 12345");
    expect(bodyCorporateName(NSW.TERMINOLOGY, { ...scheme, planNumber: null })).toBe("The Owners Corporation");
    expect(bodyCorporateShortName(NSW.TERMINOLOGY, scheme)).toBe("The Owners - Strata Plan 12345");
  });

  it("puts headings in capitals but keeps the plan number as entered", () => {
    expect(bodyCorporateShortName(NSW.TERMINOLOGY, { ...scheme, planNumber: "sp 3782" }, { upperCase: true })).toBe("THE OWNERS - STRATA PLAN sp 3782");
    expect(bodyCorporateShortName(QLD.TERMINOLOGY, { ...scheme, planNumber: "cts 12" }, { upperCase: true })).toBe("BODY CORPORATE FOR HARBOUR VIEW COMMUNITY TITLES SCHEME cts 12");
  });

  it("gives the Queensland body corporate's name from the scheme's name and number (Act ss 22, 33)", () => {
    expect(bodyCorporateName(QLD.TERMINOLOGY, scheme)).toBe("Body corporate for Harbour View community titles scheme 12345");
    expect(bodyCorporateName(QLD.TERMINOLOGY, { ...scheme, planNumber: undefined })).toBe("The Body Corporate");
    expect(bodyCorporateShortName(QLD.TERMINOLOGY, scheme)).toBe("Body corporate for Harbour View community titles scheme 12345");
  });

  it("fills each token once, so a name holding a token is kept as typed", () => {
    expect(bodyCorporateName(QLD.TERMINOLOGY, { name: "The {plan} Tower", planNumber: "7" })).toBe("Body corporate for The {plan} Tower community titles scheme 7");
  });

  it("has the late charge and levy words each pack decided", () => {
    expect([NSW.TERMINOLOGY.levy, NSW.TERMINOLOGY.levies, NSW.TERMINOLOGY.lateCharge]).toEqual(["levy", "levies", "interest"]);
    expect([QLD.TERMINOLOGY.levy, QLD.TERMINOLOGY.levies, QLD.TERMINOLOGY.lateCharge]).toEqual(["contribution", "contributions", "penalty"]);
  });
});

describe("the interest page's words, from the pack's late charge (step 6)", () => {
  const qldShaped = { ...NSW, TERMINOLOGY: QLD.TERMINOLOGY, LATE_CHARGE: QLD.LATE_CHARGE, CITATIONS: undefined, STATUTORY_INTEREST: undefined } as unknown as StatutoryRules;

  it("gives NSW the words the page and form have always shown", () => {
    const on = lateChargeWords(NSW, { mode: "STATUTORY" });
    expect(on.title).toBe("Interest on Overdue Levies");
    expect(on.legend).toBe("Interest on overdue levies");
    expect(on.description).toBe("Statutory interest: 10% a year simple interest on levies unpaid one month after the due date (SSMA 2015 s 85).");
    expect(on.options).toEqual([
      {
        mode: "STATUTORY",
        label:
          "Statutory interest: simple interest at 10% a year on levies unpaid one month after the due date. This is the default under the Strata Schemes Management Act 2015 (NSW) s 85. The rate cannot be changed.",
        needsResolution: false,
        needsRate: false,
      },
      { mode: "NO_INTEREST", label: "No interest, because a general meeting resolved that contributions bear no interest (s 85(3)).", needsResolution: true, needsRate: false },
    ]);
    expect(on.reasons).toEqual({
      IN_GRACE: "In the one month grace period",
      PAID_IN_GRACE: "Paid within the grace period",
      NOT_YET_DUE: "Not yet due",
      NOTHING_OWING: "Nothing owing",
      NO_INTEREST_RESOLUTION: "No interest by resolution",
    });
    const off = lateChargeWords(NSW, { mode: "NO_INTEREST" });
    expect(off.description).toBe("No interest: the owners corporation resolved that contributions bear no interest (SSMA 2015 s 85(3)).");
    expect(off.noCharge).toEqual({
      title: "No interest is charged",
      description: "The owners corporation has resolved that contributions bear no interest (SSMA 2015 s 85(3)). Change the setting above if that resolution is revoked.",
    });
  });

  it("gives Queensland the penalty in plain words, never interest", () => {
    const on = lateChargeWords(qldShaped, { mode: "RESOLVED_RATE", monthlyRatePercent: 2 });
    expect(on.title).toBe("Penalty on Overdue Contributions");
    expect(on.options.map((o) => [o.mode, o.label, o.needsResolution, o.needsRate])).toEqual([
      ["NONE", "No penalty", false, false],
      ["RESOLVED_RATE", "Penalty at the rate the body corporate resolved", true, true],
    ]);
    expect(on.description).toBe("Penalty: 2% a month on contributions unpaid after the date for payment, for each whole month in arrears, at the rate the body corporate resolved.");
    expect(on.maxMonthlyRatePercent).toBe(2.5);
    expect(on.reasons.NOT_A_MONTH_IN_ARREARS).toBe("Less than a whole month in arrears");
    expect(lateChargeWords(NSW, { mode: "STATUTORY" }).reasons).not.toHaveProperty("NOT_A_MONTH_IN_ARREARS");
    const off = lateChargeWords(qldShaped, { mode: "NONE" });
    expect(off.description).toBe("No penalty: the body corporate has not resolved to charge one.");
    for (const w of [on, off]) {
      // The words shown (the reason codes are keys, not words).
      const text = JSON.stringify({ ...w, reasons: Object.values(w.reasons) });
      expect(text).not.toMatch(/interest/i);
      expect(text).not.toMatch(/[;–—]| - /);
    }
  });
});
