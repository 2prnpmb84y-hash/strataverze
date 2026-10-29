/**
 * Debt recovery from the rule pack (stage 2, step 8, 27 Oct 2026): the step
 * labels, the Queensland steps, the 2 year rule and which fees can be passed
 * to an owner all come from the building's pack. NSW stays as it was.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PENDING_RULE_PACKS, QLD_RULE_PACK, RULE_PACKS, statutoryRulesFor, type NswRules } from "@/config/statutory";
import type { DebtRecoveryRules } from "@/config/statutory/types";
import { flaggableDueOnOrBefore, lotDebtsFrom, proceedingsDeadlineFlags, proceedingsDeadlineRule, proceedingsDeadlineWarning, type LotDebt } from "./proceedings-deadline";
import { NEVER_RECOVERABLE_FROM_OWNER, usageFee } from "@/lib/billing/fee-engine";
import { feeWordingFor, toFeeView } from "@/lib/billing/disclosure";
import { TEST_PRICE_BOOK as book } from "@/lib/billing/test-price-book";
import { auDate } from "@/lib/onboarding/property-onboarding";
import { recoveryFeeVariant } from "@/lib/billing/hook-codes";

const NSW = statutoryRulesFor("NSW") as NswRules;
const QLD = QLD_RULE_PACK.rules;

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

describe("every pack's recovery steps (step order fix, 29 Oct 2026)", () => {
  const packs = [...Object.values(RULE_PACKS), ...Object.values(PENDING_RULE_PACKS)];

  it("have unique, strictly increasing step orders and unique step types, starting at LEDGER_VERIFICATION", () => {
    // The server completes the steps in step order, and a new case's current
    // step is the database default for current_step (LEDGER_VERIFICATION).
    let checked = 0;
    for (const pack of packs) {
      // A draft pack's rules may not declare the steps at all.
      const steps = (pack.rules as { DEBT_RECOVERY_STEPS?: readonly { stepType: string; stepOrder: number }[] }).DEBT_RECOVERY_STEPS;
      if (!steps) continue;
      checked++;
      const orders = steps.map((s) => s.stepOrder);
      for (let i = 1; i < orders.length; i++) expect(orders[i], `${pack.code} step ${i + 1}`).toBeGreaterThan(orders[i - 1]);
      expect(new Set(orders).size, pack.code).toBe(orders.length);
      expect(new Set(steps.map((s) => s.stepType)).size, pack.code).toBe(steps.length);
      expect(steps[0]?.stepType, pack.code).toBe("LEDGER_VERIFICATION");
    }
    expect(checked).toBeGreaterThanOrEqual(2);
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

describe("Western Australian debt recovery (draft, stage 2, PR 9a)", () => {
  const wa = PENDING_RULE_PACKS.WA.rules;
  const steps = wa.DEBT_RECOVERY_STEPS;
  // Compile-time: the pack's DEBT_RECOVERY follows the shared shape, its own fields kept.
  const shared: DebtRecoveryRules = wa.DEBT_RECOVERY;
  const ownerText = steps.flatMap((s) => [s.actionRequired, s.legalBasis ?? "", s.triggerCondition, wa.DEBT_RECOVERY_STEP_LABELS[s.stepType] ?? ""]);

  it("follows the shared DebtRecoveryRules shape, with the authority and the forum", () => {
    expect(shared.source.length).toBeGreaterThan(10);
    expect(shared.authorityToSue?.recordedAtStep).toBe("COMMITTEE_REVIEW");
    expect(shared.forum?.recordedAtStep).toBe("PROCEEDINGS");
    // No key StrataVerze does not apply yet, and none written as undefined.
    for (const k of ["stepTiming", "finalNotice", "statutoryCharge", "appliesWhen"]) expect(k in wa.DEBT_RECOVERY, k).toBe(false);
    expect("amountThreshold" in wa.DEBT_RECOVERY.authorityToSue).toBe(false);
  });

  it("uses the NSW step types, in order, each with a label and guidance, and the steps are on", () => {
    const nswTypes = NSW.DEBT_RECOVERY_STEPS.map((s) => s.stepType);
    expect(steps.map((s) => s.stepType)).toEqual(nswTypes);
    expect(steps.map((s) => s.stepOrder)).toEqual(steps.map((_, i) => i + 1));
    for (const s of steps) {
      expect(wa.DEBT_RECOVERY_STEP_LABELS[s.stepType], s.stepType).toBeTruthy();
      expect(wa.DEBT_RECOVERY_GUIDANCE[s.stepType], s.stepType).toBeTruthy();
    }
    expect(wa.FEATURES.debtRecoverySteps).toBe(true);
  });

  it("charges every recovery step fee to the strata company, never the owner (D10)", () => {
    expect(wa.NEVER_RECOVERABLE_FEE_VARIANTS.map((v) => `${v.code}:${v.variant}`).sort()).toEqual(
      ["RECOVERY_STEP:FINAL_NOTICE", "RECOVERY_STEP:PAYMENT_PLAN", "RECOVERY_STEP:REFERRAL", "RECOVERY_STEP:REMINDER"],
    );
    expect("RECOVERY_COSTS_RECOVERABLE" in wa).toBe(false);
    for (const variant of ["REMINDER", "FINAL_NOTICE", "REFERRAL", "PAYMENT_PLAN"]) {
      const quote = usageFee({ code: "RECOVERY_STEP", variant, priceBook: book, date: "2026-11-01", neverRecoverableFromOwner: wa.NEVER_RECOVERABLE_FEE_VARIANTS });
      if (quote) expect(quote.recoverableFromOwner, variant).toBe(false);
    }
  });

  it("owner text never names SAT, the Magistrates Court or a limit, and never says levy", () => {
    for (const t of ownerText) {
      expect(t).not.toMatch(/\bSAT\b|State Administrative Tribunal|Magistrates|\$\d|tribunal/i);
      expect(t).not.toMatch(/\blev(y|ies)\b/i);
    }
    expect(steps.find((s) => s.stepType === "PROCEEDINGS")?.actionRequired).toContain("a court of competent jurisdiction");
    expect(steps.find((s) => s.stepType === "COMMITTEE_REVIEW")?.legalBasis).toContain("s 143(5)(e)");
  });

  it("states only CONFIRMED law to owners, and says StrataVerze practice where a step is StrataVerze's own", () => {
    for (const s of steps) {
      expect(s.status, s.stepType).toBeDefined();
      if (s.status === "STRATAVERZE") expect(s.legalBasis, s.stepType).toMatch(/^StrataVerze practice/);
      if (s.status === "NOT_CONFIRMED") expect(s.legalBasis, s.stepType).toBeUndefined();
    }
    expect(steps.filter((s) => s.status === "CONFIRMED").map((s) => s.stepType)).toEqual(["PROCEEDINGS"]);
    // The guidance (advisers only) keeps the points not confirmed and the forum.
    expect(wa.DEBT_RECOVERY_GUIDANCE.COMMITTEE_REVIEW).toMatch(/Not confirmed: who within the strata company decides/);
    expect(wa.DEBT_RECOVERY_GUIDANCE.PROCEEDINGS).toMatch(/never SAT/);
    expect(wa.DEBT_RECOVERY_GUIDANCE.PROCEEDINGS).toMatch(/Guidance, not confirmed: the Magistrates Court/);
    expect(wa.DEBT_RECOVERY_GUIDANCE.LEGAL_REFERRAL).toMatch(/Not confirmed: whether legal and collection costs/);
  });

  it("holds a value only where it is CONFIRMED or STRATAVERZE, and SAT only as excluded", () => {
    const checked = [wa.DEBT_RECOVERY.authorityToSue.accepted, wa.DEBT_RECOVERY.authorityToSue.managerMayDecide, ...wa.DEBT_RECOVERY.forum.options.flatMap((o) => (o.limitCents ? [o.limitCents] : []))];
    for (const v of checked) {
      if (v.value != null) expect(["CONFIRMED", "STRATAVERZE"]).toContain(v.status);
      else expect(v.note.length).toBeGreaterThan(10);
    }
    expect(wa.DEBT_RECOVERY.authorityToSue.managerMayDecide.value).toBe(false);
    expect(wa.DEBT_RECOVERY.forum.options.map((o) => o.key)).toEqual(["COURT"]);
    expect(wa.DEBT_RECOVERY.forum.options[0].limitCents?.value).toBeNull();
    expect(wa.DEBT_RECOVERY.forum.excluded.map((x) => [x.key, x.status])).toEqual([["SAT", "CONFIRMED"]]);
  });

  it("have no dashes or semicolons in their text", () => {
    const texts = [...ownerText, ...Object.values(wa.DEBT_RECOVERY_GUIDANCE)];
    for (const t of texts) expect(t).not.toMatch(/[;–—]| - /);
  });
});

describe("the draft packs' debt recovery switch (stage 2, PR 9a)", () => {
  it("a draft pack has the recovery steps on only with DEBT_RECOVERY.authorityToSue (VIC stays off until PR 9c)", () => {
    for (const pack of Object.values(PENDING_RULE_PACKS)) {
      const rules = pack.rules as unknown as { FEATURES: { debtRecoverySteps: boolean }; DEBT_RECOVERY?: { authorityToSue?: unknown } };
      if (rules.FEATURES.debtRecoverySteps) expect(rules.DEBT_RECOVERY?.authorityToSue, pack.code).toBeDefined();
    }
    expect(PENDING_RULE_PACKS.VIC.rules.FEATURES.debtRecoverySteps).toBe(false);
    expect(PENDING_RULE_PACKS.WA.rules.FEATURES.debtRecoverySteps).toBe(true);
  });
});

describe("ACT debt recovery (draft, stage 2, PR 9b)", () => {
  const act = PENDING_RULE_PACKS.ACT.rules;
  const steps = act.DEBT_RECOVERY_STEPS;
  // Compile-time: the pack's DEBT_RECOVERY follows the shared shape, its own fields kept.
  const shared: DebtRecoveryRules = act.DEBT_RECOVERY;
  const ownerText = steps.flatMap((s) => [s.actionRequired, s.legalBasis ?? "", s.triggerCondition, act.DEBT_RECOVERY_STEP_LABELS[s.stepType] ?? ""]);
  const recovery = act.DEBT_RECOVERY;

  it("follows the shared DebtRecoveryRules shape, with the authority, the forum and the statutory charge", () => {
    expect(shared.source.length).toBeGreaterThan(10);
    expect(shared.authorityToSue?.recordedAtStep).toBe("COMMITTEE_REVIEW");
    expect(shared.forum?.recordedAtStep).toBe("PROCEEDINGS");
    expect(shared.statutoryCharge?.stepType).toBe("STATUTORY_CHARGE");
    // No key StrataVerze does not apply yet, and none written as undefined.
    for (const k of ["stepTiming", "finalNotice", "appliesWhen"]) expect(k in recovery, k).toBe(false);
    expect("amountThreshold" in recovery.authorityToSue).toBe(false);
    for (const [k, v] of Object.entries(recovery)) expect(v, k).not.toBeUndefined();
    // The fields kept for the review, renamed so they do not clash with the shared keys.
    expect(recovery.forumGuidance).toMatchObject({ tribunal: "ACAT", status: "GUIDANCE", courtIncludesAcat: true, courtIncludesAcatStatus: "CONFIRMED" });
    expect(recovery.statutoryChargeFacts).toEqual({ available: true, securesInterest: true, powerOfSale: false, revokeAndLodgeWhenPaid: true });
  });

  it("uses the NSW step types plus STATUTORY_CHARGE right after COMMITTEE_REVIEW, in order, each with a label and guidance", () => {
    const nswTypes = NSW.DEBT_RECOVERY_STEPS.map((s) => s.stepType);
    const at = nswTypes.indexOf("COMMITTEE_REVIEW") + 1;
    expect(steps.map((s) => s.stepType)).toEqual([...nswTypes.slice(0, at), "STATUTORY_CHARGE", ...nswTypes.slice(at)]);
    expect(steps.map((s) => s.stepOrder)).toEqual(steps.map((_, i) => i + 1));
    for (const s of steps) {
      expect(act.DEBT_RECOVERY_STEP_LABELS[s.stepType], s.stepType).toBeTruthy();
      expect(act.DEBT_RECOVERY_GUIDANCE[s.stepType], s.stepType).toBeTruthy();
    }
    expect(Object.keys(act.DEBT_RECOVERY_STEP_LABELS).sort()).toEqual(steps.map((s) => s.stepType).sort());
    expect(act.FEATURES.debtRecoverySteps).toBe(true);
  });

  it("charges every recovery step fee to the owners corporation, never the owner, and the charge step is unpriced (D10)", () => {
    expect(act.NEVER_RECOVERABLE_FEE_VARIANTS.map((v) => `${v.code}:${v.variant}`).sort()).toEqual(
      ["RECOVERY_STEP:FINAL_NOTICE", "RECOVERY_STEP:PAYMENT_PLAN", "RECOVERY_STEP:REFERRAL", "RECOVERY_STEP:REMINDER"],
    );
    expect("RECOVERY_COSTS_RECOVERABLE" in act).toBe(false);
    for (const variant of ["REMINDER", "FINAL_NOTICE", "REFERRAL", "PAYMENT_PLAN"]) {
      const quote = usageFee({ code: "RECOVERY_STEP", variant, priceBook: book, date: "2026-11-01", neverRecoverableFromOwner: act.NEVER_RECOVERABLE_FEE_VARIANTS });
      if (quote) expect(quote.recoverableFromOwner, variant).toBe(false);
    }
    expect(recoveryFeeVariant("STATUTORY_CHARGE")).toBeNull();
  });

  it("owner text never states the ACAT limit, the Magistrates Court or ACAT's civil jurisdiction, and never says levy", () => {
    for (const t of ownerText) {
      expect(t).not.toMatch(/\$\d|Magistrates|civil jurisdiction|tribunal|guidance/i);
      expect(t).not.toMatch(/\blev(y|ies)\b/i);
    }
    expect(steps.find((s) => s.stepType === "PROCEEDINGS")?.actionRequired).toContain("a court, which includes ACAT (UTMA dictionary)");
    expect(steps.find((s) => s.stepType === "COMMITTEE_REVIEW")?.legalBasis).toContain("UTMA sch 2 s 2.5(2)(a)");
    expect(steps.find((s) => s.stepType === "STATUTORY_CHARGE")?.legalBasis).toBe("UTMA ss 96, 97");
    // The forum options that may be recorded: only the confirmed court. The guidance forum is never in owner text.
    const guidanceWords = recovery.forum.options.filter((o) => o.status === "GUIDANCE").map((o) => o.words);
    expect(guidanceWords.length).toBeGreaterThan(0);
    for (const t of ownerText) for (const w of guidanceWords) expect(t).not.toContain(w);
  });

  it("states only CONFIRMED law to owners, and says StrataVerze practice where a step is StrataVerze's own", () => {
    for (const s of steps) {
      expect(s.status, s.stepType).toBeDefined();
      if (s.status === "STRATAVERZE") expect(s.legalBasis, s.stepType).toMatch(/^StrataVerze practice/);
      if (s.status === "NOT_CONFIRMED") expect(s.legalBasis, s.stepType).toBeUndefined();
    }
    expect(steps.filter((s) => s.status === "CONFIRMED").map((s) => s.stepType)).toEqual(["STATUTORY_CHARGE", "PROCEEDINGS"]);
    // The guidance (advisers only) keeps the points not confirmed and the forum guidance.
    expect(act.DEBT_RECOVERY_GUIDANCE.PROCEEDINGS).toMatch(/Guidance, not confirmed: ACAT says levies may be recovered as a debt in its civil jurisdiction, up to \$25,000/);
    expect(act.DEBT_RECOVERY_GUIDANCE.PROCEEDINGS).toMatch(/The limit is never applied/);
    expect(act.DEBT_RECOVERY_GUIDANCE.STATUTORY_CHARGE).toMatch(/Not confirmed: any form or fee for the charge or its revocation, and any period for the revocation/);
    expect(act.DEBT_RECOVERY_GUIDANCE.COMMITTEE_REVIEW).toMatch(/decision D7/);
  });

  it("holds every value checked: a value only where it is CONFIRMED or STRATAVERZE, and a note otherwise", () => {
    const a = recovery.authorityToSue;
    const c = recovery.statutoryCharge;
    const checked = [a.accepted, a.managerMayDecide, c.declaredBy, c.revocation.required, c.revocation.withinDays, c.closeBlockedUntilRevoked, ...recovery.forum.options.flatMap((o) => (o.limitCents ? [o.limitCents] : []))];
    for (const v of checked) {
      if (v.value != null) expect(["CONFIRMED", "STRATAVERZE"]).toContain(v.status);
      else expect(v.note.length).toBeGreaterThan(10);
    }
    // D7: an executive committee motion or a general meeting ordinary resolution, never the adviser alone.
    expect(a.accepted.value?.map((r) => [r.meeting, r.kind])).toEqual([["COMMITTEE", "ANY"], ["GENERAL", "ORDINARY"]]);
    expect(a.managerMayDecide.value).toBe(false);
    // D8: declared by an executive committee or general meeting motion; revocation required, no deadline; any close blocked.
    expect(c.declaredBy.value?.map((r) => [r.meeting, r.kind])).toEqual([["COMMITTEE", "ANY"], ["GENERAL", "ANY"]]);
    expect(c.declaredBy.status).toBe("STRATAVERZE");
    expect(c.revocation.required).toMatchObject({ value: true, status: "CONFIRMED" });
    expect(c.revocation.withinDays).toMatchObject({ value: null, status: "NOT_CONFIRMED" });
    expect(c.closeBlockedUntilRevoked).toMatchObject({ value: "ANY_CLOSE", status: "STRATAVERZE" });
    expect([c.securesInterest, c.powerOfSale, c.lodgedWith, c.certifiedBy]).toEqual([true, false, "the registrar-general", "the executive committee"]);
    // D13: only the court may be recorded; ACAT is guidance, and its limit is never applied.
    expect(recovery.forum.options.map((o) => [o.key, o.status])).toEqual([["COURT", "CONFIRMED"], ["ACAT", "GUIDANCE"]]);
    expect(recovery.forum.options.find((o) => o.key === "ACAT")?.limitCents).toMatchObject({ value: null, status: "GUIDANCE", guidance: 2_500_000 });
    expect(recovery.forum.excluded).toEqual([]);
  });

  it("have no dashes or semicolons in their text", () => {
    const texts = [...ownerText, ...Object.values(act.DEBT_RECOVERY_GUIDANCE)];
    for (const t of texts) expect(t).not.toMatch(/[;–—]| - /);
  });

  it("is switched on only with DEBT_RECOVERY.authorityToSue, like every draft pack", () => {
    expect(PENDING_RULE_PACKS.ACT.rules.FEATURES.debtRecoverySteps).toBe(true);
    expect(PENDING_RULE_PACKS.ACT.rules.DEBT_RECOVERY.authorityToSue).toBeDefined();
  });
});

describe("a pack with a statutory charge has no statutory payment plans (PR 9b review L1)", () => {
  it("every pack, active or pending, with DEBT_RECOVERY.statutoryCharge has FEATURES.statutoryPaymentPlans off", () => {
    const packs = [...Object.values(RULE_PACKS), ...Object.values(PENDING_RULE_PACKS)] as unknown as {
      code: string;
      rules: { FEATURES: { statutoryPaymentPlans: boolean }; DEBT_RECOVERY?: { statutoryCharge?: unknown } };
    }[];
    const withCharge = packs.filter((p) => p.rules.DEBT_RECOVERY?.statutoryCharge);
    expect(withCharge.map((p) => p.code)).toContain("AU-ACT");
    for (const p of withCharge) {
      expect(
        p.rules.FEATURES.statutoryPaymentPlans,
        `${p.code}: completePlan (src/lib/debt-recovery/payment-plan-requests.ts) closes a case as paid when the last instalment is paid without checking a lodged statutory charge's revocation, so a pack with a statutory charge must not have statutory payment plans until completePlan applies the charge close gate`,
      ).toBe(false);
    }
  });
});
