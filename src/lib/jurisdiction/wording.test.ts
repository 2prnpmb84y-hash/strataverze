import { describe, expect, it } from "vitest";
import { PENDING_RULE_PACKS, statutoryRulesFor, type NswRules } from "@/config/statutory";
import { actName, bodyCorporateName, bodyCorporateShortName, capitalise, graceText, noticeLeadText, planLine } from "./wording";

const NSW = statutoryRulesFor("NSW") as NswRules;
const QLD = PENDING_RULE_PACKS.QLD.rules;

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
