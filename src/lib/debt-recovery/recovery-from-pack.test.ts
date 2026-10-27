/**
 * Debt recovery from the rule pack (stage 2, step 8, 27 Oct 2026): the step
 * labels, the Queensland steps, the 2 year rule and which fees can be passed
 * to an owner all come from the building's pack. NSW stays as it was.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PENDING_RULE_PACKS, statutoryRulesFor, type NswRules } from "@/config/statutory";
import { flaggableDueOnOrBefore, lotDebtsFrom, proceedingsDeadlineFlags, proceedingsDeadlineRule, proceedingsDeadlineWarning, type LotDebt } from "./proceedings-deadline";
import { NEVER_RECOVERABLE_FROM_OWNER, usageFee } from "@/lib/billing/fee-engine";
import { feeWordingFor, toFeeView } from "@/lib/billing/disclosure";
import { TEST_PRICE_BOOK as book } from "@/lib/billing/test-price-book";
import { auDate } from "@/lib/onboarding/property-onboarding";

const NSW = statutoryRulesFor("NSW") as NswRules;
const QLD = PENDING_RULE_PACKS.QLD.rules;

const SCREENS = [
  "app/(portal)/adviser/schemes/[id]/finance/debt-recovery/debt-recovery-client.tsx",
  "app/(portal)/adviser/schemes/[id]/finance/debt-recovery/[caseId]/case-detail-client.tsx",
  "app/(portal)/owner/(scheme)/levies/debt-recovery/debt-recovery-owner-client.tsx",
  "app/(portal)/owner/(scheme)/levies/debt-recovery/[caseId]/case-detail-owner-client.tsx",
];

describe("debt recovery step labels", () => {
  it("are the NSW pack's, for every NSW step", () => {
    for (const step of NSW.DEBT_RECOVERY_STEPS) expect(NSW.DEBT_RECOVERY_STEP_LABELS[step.stepType]).toBeTruthy();
    expect(NSW.DEBT_RECOVERY_STEP_LABELS.HARDSHIP_REVIEW).toBe("Hardship Review");
  });

  it("are the Queensland pack's, for every Queensland step", () => {
    for (const step of QLD.DEBT_RECOVERY_STEPS) expect(QLD.DEBT_RECOVERY_STEP_LABELS[step.stepType]).toBeTruthy();
    expect(QLD.DEBT_RECOVERY_STEP_LABELS.HARDSHIP_REVIEW).toBe("Waiver Request");
    expect(Object.keys(QLD.DEBT_RECOVERY_STEP_LABELS).sort()).toEqual(Object.keys(NSW.DEBT_RECOVERY_STEP_LABELS).sort());
  });

  it("are not written in the screens, which take them as props", () => {
    for (const rel of SCREENS) {
      const text = readFileSync(join(__dirname, "..", "..", rel), "utf8");
      expect(text, rel).not.toMatch(/Ledger Verification|Hardship Review/);
      expect(text, rel).toMatch(/stepLabels/);
      // No pack values in a client file: only need-rule may be imported from the config.
      for (const m of text.matchAll(/from "(@\/config\/statutory[^"]*)"/g)) expect(m[1], rel).toBe("@/config/statutory/need-rule");
    }
  });
});

describe("Queensland debt recovery steps (draft)", () => {
  const steps = QLD.DEBT_RECOVERY_STEPS;

  it("use the NSW step types, in order, so the case engine, fees and screens work", () => {
    const nswTypes = new Set(NSW.DEBT_RECOVERY_STEPS.map((s) => s.stepType));
    for (const s of steps) expect(nswTypes.has(s.stepType), s.stepType).toBe(true);
    expect(steps.map((s) => s.stepOrder)).toEqual(steps.map((_, i) => i + 1));
    expect(QLD.FEATURES.debtRecoverySteps).toBe(true);
    for (const s of steps) expect(QLD.DEBT_RECOVERY_GUIDANCE[s.stepType], s.stepType).toBeTruthy();
  });

  it("never say levy or interest to owners", () => {
    for (const s of steps) {
      for (const text of [s.actionRequired, s.legalBasis ?? ""]) expect(text, s.stepType).not.toMatch(/\blev(y|ies)\b|\binterest\b/i);
    }
  });

  it("mark every step that is StrataVerze practice, and say so to owners", () => {
    for (const s of steps) {
      expect(s.status, s.stepType).toBeDefined();
      if (s.status === "STRATAVERZE") expect(s.legalBasis, s.stepType).toMatch(/^StrataVerze practice/);
    }
    for (const t of ["LEDGER_VERIFICATION", "REMINDER_NOTICE", "FINAL_NOTICE", "HARDSHIP_REVIEW"]) expect(steps.find((s) => s.stepType === t)?.status).toBe("STRATAVERZE");
    expect(steps.find((s) => s.stepType === "COMMITTEE_REVIEW")?.legalBasis).toContain("166(2)");
    expect(steps.find((s) => s.stepType === "PROCEEDINGS")?.actionRequired).toContain("$25,000");
  });

  it("have no dashes or semicolons in their text", () => {
    const texts = [...steps.flatMap((s) => [s.actionRequired, s.legalBasis ?? "", s.triggerCondition]), ...Object.values(QLD.DEBT_RECOVERY_GUIDANCE), ...Object.values(QLD.DEBT_RECOVERY_STEP_LABELS)];
    for (const t of texts) expect(t).not.toMatch(/[;–—]| - /);
  });

  it("guidance records the points not confirmed", () => {
    expect(QLD.DEBT_RECOVERY_GUIDANCE.PROCEEDINGS).toMatch(/Not confirmed: the Magistrates Court limit/);
    expect(QLD.DEBT_RECOVERY_GUIDANCE.LEGAL_REFERRAL).toMatch(/Not confirmed: whether any particular cost/);
  });

  it("NSW steps have no status, so their data is unchanged", () => {
    for (const s of NSW.DEBT_RECOVERY_STEPS) expect("status" in s).toBe(false);
  });

  it("are listed for review", () => {
    const where = QLD.FOR_REVIEW.map((f) => f.where).join(" | ");
    expect(where).toContain("DEBT_RECOVERY_STEPS");
    expect(where).toContain("proceedings-deadline");
    expect(where).toContain("NEVER_RECOVERABLE_FEE_VARIANTS");
    expect(QLD.FOR_REVIEW.some((f) => f.where.includes("HARDSHIP_REVIEW") && /committee/.test(f.point) && /not confirmed/.test(f.point))).toBe(true);
  });
});

describe("the 2 year rule (SM s 166(2))", () => {
  const rule = proceedingsDeadlineRule(QLD);
  const lot = (oldestUnpaidDueDate: string | null, proceedingsStarted = false): LotDebt => ({ lotId: "lot-4", lotNumber: "4", oldestUnpaidDueDate, proceedingsStarted });

  it("comes from the Queensland pack, and NSW has none", () => {
    expect(rule).toEqual({ overdueYears: 2, withinMonths: 2, citation: "Standard Module s 166(2)" });
    expect(proceedingsDeadlineRule(statutoryRulesFor("NSW"))).toBeNull();
    expect(proceedingsDeadlineFlags(proceedingsDeadlineRule(statutoryRulesFor("NSW")), [lot("2020-01-01")], "2026-10-27")).toEqual([]);
  });

  it("flags a contribution outstanding exactly 2 years, with the deadline", () => {
    const [flag] = proceedingsDeadlineFlags(rule, [lot("2024-10-27")], "2026-10-27");
    expect(flag).toEqual({ lotId: "lot-4", lotNumber: "4", oldestUnpaidDueDate: "2024-10-27", outstandingSince: "2026-10-27", deadline: "2026-12-27", passed: false });
    expect(proceedingsDeadlineWarning(flag, rule!, QLD.TERMINOLOGY, auDate)).toBe(
      "Lot 4: the oldest unpaid contribution (due 27/10/2024) has been outstanding for 2 years. The body corporate must start proceedings by 27/12/2026.",
    );
  });

  it("does not flag one day earlier", () => {
    expect(proceedingsDeadlineFlags(rule, [lot("2024-10-27")], "2026-10-26")).toEqual([]);
  });

  it("does not flag a lot whose proceedings have started, or with nothing unpaid", () => {
    expect(proceedingsDeadlineFlags(rule, [lot("2024-01-01", true), lot(null)], "2026-10-27")).toEqual([]);
  });

  it("marks the deadline passed the day after it", () => {
    expect(proceedingsDeadlineFlags(rule, [lot("2024-10-27")], "2026-12-27")[0].passed).toBe(false);
    const [late] = proceedingsDeadlineFlags(rule, [lot("2024-10-27")], "2026-12-28");
    expect(late.passed).toBe(true);
    expect(proceedingsDeadlineWarning(late, rule!, QLD.TERMINOLOGY, auDate)).toMatch(/by 27\/12\/2026\. That date has passed\.$/);
  });

  it("clamps to the month end", () => {
    expect(proceedingsDeadlineFlags(rule, [lot("2023-12-31")], "2025-12-31")[0].deadline).toBe("2026-02-28");
    expect(proceedingsDeadlineFlags(rule, [lot("2024-02-29")], "2026-02-27")).toEqual([]);
    // From the clamped end of the 2 years: 28 Feb 2026, then 2 months to 28 Apr 2026.
    const [leap] = proceedingsDeadlineFlags(rule, [lot("2024-02-29")], "2026-02-28");
    expect(leap.outstandingSince).toBe("2026-02-28");
    expect(leap.deadline).toBe("2026-04-28");
  });

  it("loads only contributions due on or before today less 2 years", () => {
    expect(flaggableDueOnOrBefore(rule!, "2026-10-27")).toBe("2024-10-27");
  });

  it("counts proceedings only on an open case opened on or after the oldest unpaid due date", () => {
    const notice = { lotId: "lot-4", lotNumber: "4", dueDate: "2024-03-01", balanceCents: 50_000 };
    // A case settled in 2023, with proceedings and a court file, says nothing about the 2024 contribution.
    const settled2023 = { id: "c-2023", lotId: "lot-4", status: "CLOSED_SETTLED", openedOn: "2023-02-01", courtFileNumber: "M123/23" };
    const [lot4] = lotDebtsFrom([notice], [settled2023], new Set(["c-2023"]));
    expect(lot4).toEqual({ lotId: "lot-4", lotNumber: "4", oldestUnpaidDueDate: "2024-03-01", proceedingsStarted: false });
    expect(proceedingsDeadlineFlags(rule, [lot4], "2026-10-27")).toHaveLength(1);
    // Nor does an open case opened before that contribution fell due.
    const openEarlier = { ...settled2023, id: "c-early", status: "IN_PROGRESS" };
    expect(lotDebtsFrom([notice], [openEarlier], new Set(["c-early"]))[0].proceedingsStarted).toBe(false);
    // A closed case opened after it does not count either.
    const closedLater = { ...settled2023, id: "c-closed", openedOn: "2024-06-01" };
    expect(lotDebtsFrom([notice], [closedLater], new Set(["c-closed"]))[0].proceedingsStarted).toBe(false);
    // An open case opened after it, with proceedings started, does.
    const open2024 = { id: "c-2024", lotId: "lot-4", status: "REFERRED_LEGAL", openedOn: "2024-06-01", courtFileNumber: null };
    expect(lotDebtsFrom([notice], [open2024], new Set(["c-2024"]))[0].proceedingsStarted).toBe(true);
    expect(lotDebtsFrom([notice], [{ ...open2024, courtFileNumber: "M9/25" }], new Set())[0].proceedingsStarted).toBe(true);
    expect(lotDebtsFrom([notice], [open2024], new Set())[0].proceedingsStarted).toBe(false);
  });

  it("takes the lot's oldest unpaid contribution and ignores paid ones", () => {
    const lots = lotDebtsFrom(
      [
        { lotId: "lot-4", lotNumber: "4", dueDate: "2024-06-01", balanceCents: 100 },
        { lotId: "lot-4", lotNumber: "4", dueDate: "2024-03-01", balanceCents: 100 },
        { lotId: "lot-4", lotNumber: "4", dueDate: "2023-03-01", balanceCents: 0 },
      ],
      [],
      new Set(),
    );
    expect(lots).toEqual([{ lotId: "lot-4", lotNumber: "4", oldestUnpaidDueDate: "2024-03-01", proceedingsStarted: false }]);
  });
});

describe("fees never passed to an owner, by pack", () => {
  const quote = (list?: ReadonlyArray<{ code: string; variant: string }>) =>
    usageFee({ code: "RECOVERY_STEP", variant: "PAYMENT_PLAN", priceBook: book, date: "2026-11-01", neverRecoverableFromOwner: list })!;

  it("are the NSW pack's list for NSW, unchanged, and the fee engine's default is the same list", () => {
    expect(NSW.NEVER_RECOVERABLE_FEE_VARIANTS).toEqual([{ code: "RECOVERY_STEP", variant: "PAYMENT_PLAN" }]);
    expect(NEVER_RECOVERABLE_FROM_OWNER).toEqual(NSW.NEVER_RECOVERABLE_FEE_VARIANTS);
    for (const q of [quote(NSW.NEVER_RECOVERABLE_FEE_VARIANTS), quote()]) {
      expect(q.payerType).toBe("OC");
      expect(q.recoverableFromOwner).toBe(false);
    }
  });

  it("are none for Queensland, so the price book decides", () => {
    expect(QLD.NEVER_RECOVERABLE_FEE_VARIANTS).toEqual([]);
    const q = quote(QLD.NEVER_RECOVERABLE_FEE_VARIANTS);
    expect(q.payerType).toBe("OWNER_VIA_OC");
    expect(q.recoverableFromOwner).toBe(true);
  });

  it("disclosure wording is the building's, and the NSW text is unchanged", () => {
    const reminder = usageFee({ code: "RECOVERY_STEP", variant: "REMINDER", priceBook: book, date: "2026-11-01" })!;
    expect(toFeeView(reminder, feeWordingFor(NSW))).toEqual(toFeeView(reminder));
    expect(toFeeView(reminder, feeWordingFor(NSW)).payerLabel).toBe("Charged to the owners corporation and recoverable from the owner in arrears (SSMA s 86)");
    const qld = toFeeView(reminder, feeWordingFor(QLD));
    expect(qld.payerLabel).toBe("Charged to the body corporate and may be recoverable from the owner if reasonably incurred (Standard Module s 166(1)(c))");
    expect(qld.explanation).toBe("StrataVerze charges a flat fee for this debt recovery step. It may be recoverable from the owner if reasonably incurred (Standard Module s 166(1)(c)).");
  });

  it("the Queensland payment plan fee view does not say both that it can and cannot be passed on", () => {
    const nsw = toFeeView(quote(NSW.NEVER_RECOVERABLE_FEE_VARIANTS), feeWordingFor(NSW));
    expect(nsw.explanation).toMatch(/cannot be passed to the owner/);
    expect(nsw.payerLabel).toBe("Charged to the owners corporation");
    const qld = toFeeView(quote(QLD.NEVER_RECOVERABLE_FEE_VARIANTS), feeWordingFor(QLD));
    expect(qld.explanation).toBe("StrataVerze charges a flat fee for setting up a payment plan. It may be recoverable from the owner if reasonably incurred (Standard Module s 166(1)(c)).");
    expect(qld.payerLabel).toBe("Charged to the body corporate and may be recoverable from the owner if reasonably incurred (Standard Module s 166(1)(c))");
    expect(qld.explanation).not.toMatch(/cannot/);
    // Charged to the body corporate only (a price book row with no recovery): no recovery wording at all.
    const ocOnly = toFeeView({ ...quote(QLD.NEVER_RECOVERABLE_FEE_VARIANTS), payerType: "OC", recoverableFromOwner: false }, feeWordingFor(QLD));
    expect(ocOnly.explanation).toBe("StrataVerze charges a flat fee for setting up a payment plan. It is charged to the body corporate and cannot be passed to the owner.");
    expect(ocOnly.payerLabel).toBe("Charged to the body corporate");
  });
});
