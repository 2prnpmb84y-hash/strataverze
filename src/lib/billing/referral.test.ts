import { describe, expect, it } from "vitest";
import { DEFAULT_REFERRAL_DISCLOSURE, referralIncomeProblem, renderReferralDisclosure } from "./referral";

describe("referral disclosure", () => {
  it("states the amount in dollars and the partner", () => {
    const text = renderReferralDisclosure(DEFAULT_REFERRAL_DISCLOSURE, { partnerName: "Example Broking", amountCents: 123456 });
    expect(text).toContain("$1,234.56");
    expect(text).toContain("Example Broking");
    expect(text).not.toMatch(/\{(partner|amount)\}/);
  });

  it("says what StrataVerze does and does not do", () => {
    expect(DEFAULT_REFERRAL_DISCLOSURE).toMatch(/does not give insurance advice/);
    expect(DEFAULT_REFERRAL_DISCLOSURE).toMatch(/does not quote, compare, recommend or arrange cover/);
    expect(DEFAULT_REFERRAL_DISCLOSURE).toMatch(/no part of this payment goes to the strata manager/);
  });
});

describe("referralIncomeProblem", () => {
  const ok = {
    schemeId: "s1",
    insurancePolicyId: null,
    partnerName: "Example Broking",
    amountCents: 50000,
    receivedAt: "2026-10-01",
    disclosureText: "Some text",
  };
  it("accepts a complete record", () => {
    expect(referralIncomeProblem(ok, "2026-10-22")).toBeNull();
  });
  it("rejects missing or invalid fields", () => {
    expect(referralIncomeProblem({ ...ok, partnerName: " " }, "2026-10-22")).toMatch(/partner/);
    expect(referralIncomeProblem({ ...ok, amountCents: 0 }, "2026-10-22")).toMatch(/amount/);
    expect(referralIncomeProblem({ ...ok, receivedAt: "2026-11-01" }, "2026-10-22")).toMatch(/future/);
    expect(referralIncomeProblem({ ...ok, disclosureText: "Paid {amount}" }, "2026-10-22")).toMatch(/placeholders/);
  });
});
