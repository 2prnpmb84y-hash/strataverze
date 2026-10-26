import { describe, expect, it } from "vitest";
import { statutoryRulesFor } from "@/config/statutory";
import { actName, capitalise, graceText, noticeLeadText } from "./wording";

const NSW = statutoryRulesFor("NSW");

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
