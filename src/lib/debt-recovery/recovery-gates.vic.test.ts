/**
 * The debt recovery gates applied for Victoria (stage 2, PR 9c), with the VIC
 * draft pack and fixtures: the s 18 amount threshold (D2), the final fee notice
 * (D3), the s 32(1) and s 163(2) waits counted from day 29 (D4, D5, D15), the
 * payment plan pause guard (D14) and tier 5 (D6). Every value missing fails
 * closed. NSW and Queensland stay null (recovery-gates.test.ts).
 */
import { describe, expect, it } from "vitest";
import { PENDING_RULE_PACKS, type StatutoryRules } from "@/config/statutory";
import {
  amountCents,
  authorityNeeded,
  recoveryGateProblem,
  recoveryGatesApply,
  recoveryRecordsToWrite,
  recoveryStepNeeds,
  type AuthorityFact,
  type DebtAuthorityResolution,
  type RecoveryGateInput,
  type TimingNotice,
} from "./recovery-gates";

type Rules = Pick<StatutoryRules, "DEBT_RECOVERY" | "DATED_RULES">;
const VIC_PACK = PENDING_RULE_PACKS.VIC;
const VIC = VIC_PACK.rules as unknown as Rules & Pick<StatutoryRules, "DEBT_RECOVERY_STEPS" | "DEBT_RECOVERY_STEP_LABELS">;
const RECOVERY = VIC_PACK.rules.DEBT_RECOVERY;
const STEPS = VIC.DEBT_RECOVERY_STEPS!.map((s) => ({ stepType: s.stepType, stepOrder: s.stepOrder }));
const LABELS = VIC.DEBT_RECOVERY_STEP_LABELS;

const ORDINARY: DebtAuthorityResolution = { meeting: "GENERAL", kind: "ORDINARY", words: "an ordinary resolution at a general meeting" };
const SPECIAL: DebtAuthorityResolution = { meeting: "GENERAL", kind: "SPECIAL", words: "a special resolution at a general meeting" };
const COMMITTEE: DebtAuthorityResolution = { meeting: "COMMITTEE", kind: "ANY", words: "a committee motion" };
const carried = (resolution: DebtAuthorityResolution, decidedOn = "2026-10-20"): AuthorityFact => ({ problem: null, resolution, decidedOn, meetingId: "m-1", itemId: "i-1" });
const NOTHING = { authorityToSue: false, forum: null };
const AUTHORISED = { authorityToSue: true, forum: null, authorisedAmount: "1235.50", finalNoticeGivenOn: "2026-10-01" };
const notice = (over: Partial<TimingNotice> = {}): TimingNotice => ({ number: "F-1", issuedOn: "2026-10-01", rulePack: `AU-VIC ${VIC_PACK.version}`, takeover: false, ...over });

const complete = (stepType: string, over: Partial<Extract<RecoveryGateInput, { action: "COMPLETE_STEP" }>> = {}, rules: Rules = VIC): string | null =>
  recoveryGateProblem(rules, {
    action: "COMPLETE_STEP",
    stepType,
    caseSteps: STEPS,
    authority: null,
    forum: null,
    recorded: NOTHING,
    today: "2026-11-02",
    caseOpenedOn: "2026-10-01",
    labels: LABELS,
    // The building is tier 1 to 4 unless a test says otherwise (review L4: checked at the decision and proceedings steps).
    applies: true,
    ...over,
  });

/** The VIC pack's recovery rules with some keys changed. */
const withVic = (over: Record<string, unknown>, dated: Rules["DATED_RULES"] = VIC.DATED_RULES): Rules => ({
  DEBT_RECOVERY: { ...RECOVERY, ...over } as unknown as Rules["DEBT_RECOVERY"],
  DATED_RULES: dated,
});
/** A final notice given outside StrataVerze may be recorded (a fixture; the VIC pack refuses it, D3). */
const OUTSIDE_ALLOWED = withVic({ finalNotice: { ...RECOVERY.finalNotice, givenOutsideMayBeRecorded: { value: true, status: "STRATAVERZE", source: "fixture" } } });
/** A fixture comparator with a value, so the threshold can be applied. */
const threshold = (comparator: unknown) => ({ authorityToSue: { ...RECOVERY.authorityToSue, amountThreshold: { ...RECOVERY.authorityToSue.amountThreshold, comparator } } });
const WITH_COMPARATOR = withVic(threshold({ value: "LOT_CURRENT_ANNUAL_FEES", status: "STRATAVERZE", source: "fixture" }));

describe("the Victorian pack has the gates", () => {
  it("applies them, with every key in the shared shape", () => {
    expect(recoveryGatesApply(VIC)).toBe(true);
    expect(recoveryGateProblem(VIC, { action: "INITIATE", applies: true })).toBeNull();
    expect(recoveryGateProblem(VIC, { action: "CLOSE" })).toBeNull();
  });
});

describe("tier 5 and an unknown tier are refused at opening (D6)", () => {
  it("refuses a tier 5 owners corporation, and one whose tier cannot be worked out", () => {
    expect(recoveryGateProblem(VIC, { action: "INITIATE", applies: false })).toBe(
      "This is a tier 5 owners corporation (a 2-lot subdivision or services only), which is exempt from OCA ss 18, 31 and 32 (ss 7A(1)(a), 8), so StrataVerze does not run debt recovery for it. A case cannot be opened. Nothing was saved.",
    );
    const unknown =
      "This owners corporation's tier cannot be worked out from what is recorded. A tier 5 owners corporation is exempt from OCA ss 18, 31 and 32 (ss 7A(1)(a), 8), so StrataVerze goes on with debt recovery only once the tier is known to be 1 to 4. Record the building's facts first. A case cannot be opened. Nothing was saved.";
    expect(recoveryGateProblem(VIC, { action: "INITIATE", applies: null })).toBe(unknown);
    // Not worked out at all (no building read) refuses too.
    expect(recoveryGateProblem(VIC, { action: "INITIATE" })).toBe(unknown);
  });

  it("the condition is tiers 1 to 4", () => {
    expect(RECOVERY.appliesWhen.when).toEqual({ selector: "tier", in: ["TIER_1", "TIER_2", "TIER_3", "TIER_4"] });
  });

  it("is checked again at the Authority to Start Proceedings and Proceedings steps, and not at the others (review L4)", () => {
    const decision = { authority: carried(SPECIAL), amountOwing: "1.00" };
    const proceedings = { recorded: AUTHORISED, forum: "VCAT", amountOwing: "1235.50" };
    for (const [stepType, over] of [["COMMITTEE_REVIEW", decision], ["PROCEEDINGS", proceedings]] as const) {
      expect(complete(stepType, over), stepType).toBeNull();
      expect(complete(stepType, { ...over, applies: false }), stepType).toMatch(/^This is a tier 5 owners corporation .+ This step cannot be completed\. Nothing was saved\.$/);
      expect(complete(stepType, { ...over, applies: null }), stepType).toMatch(/^This owners corporation's tier cannot be worked out .+ This step cannot be completed\. Nothing was saved\.$/);
      // Not worked out at all refuses too.
      expect(complete(stepType, { ...over, applies: undefined }), stepType).toMatch(/tier cannot be worked out/);
    }
    // The other steps do not read it.
    expect(complete("LEDGER_VERIFICATION", { applies: false })).toBeNull();
    expect(complete("LEGAL_REFERRAL", { recorded: AUTHORISED, applies: null })).toBeNull();
  });
});

describe("the s 18 amount threshold (D2)", () => {
  const rule = RECOVERY.authorityToSue;
  const fixture = (WITH_COMPARATOR.DEBT_RECOVERY!.authorityToSue)!;

  it("with no comparator value, only a special resolution at a general meeting, whatever the amount", () => {
    expect(rule.amountThreshold.comparator.value).toBeNull();
    for (const claim of [0, 100, 1_000_000, null]) expect(authorityNeeded(rule, claim, 50_000)).toEqual([SPECIAL]);
    expect(recoveryStepNeeds(VIC, "COMMITTEE_REVIEW")).toEqual({ authority: { accepted: [SPECIAL], words: "a special resolution at a general meeting" }, forum: null });
  });

  it("the step offers only the special resolution while StrataVerze does not work out the comparator's amount, even with a comparator value (review L2)", () => {
    expect(recoveryStepNeeds(WITH_COMPARATOR, "COMMITTEE_REVIEW")).toEqual({ authority: { accepted: [SPECIAL], words: "a special resolution at a general meeting" }, forum: null });
    // As the server passes it (no comparator amount), the gate needs the special resolution too.
    expect(complete("COMMITTEE_REVIEW", { authority: carried(ORDINARY), amountOwing: "1.00", comparatorCents: null }, WITH_COMPARATOR)).toMatch(/^Choose a special resolution at a general meeting\./);
  });

  it("with a comparator: exactly twice allows an ordinary resolution, one cent more needs a special one", () => {
    expect(authorityNeeded(fixture, 100_000, 50_000)).toEqual([ORDINARY, SPECIAL]);
    expect(authorityNeeded(fixture, 100_001, 50_000)).toEqual([SPECIAL]);
    // An amount not known (the comparator's or the claim's) needs the special resolution.
    expect(authorityNeeded(fixture, 100_000, null)).toEqual([SPECIAL]);
    expect(authorityNeeded(fixture, null, 50_000)).toEqual([SPECIAL]);
    expect(authorityNeeded(fixture, Number.NaN, 50_000)).toEqual([SPECIAL]);
  });

  it("the gate: with no comparator value an ordinary resolution is refused and a special one accepted", () => {
    expect(complete("COMMITTEE_REVIEW", { authority: carried(ORDINARY), amountOwing: "100.00" })).toBe(
      `Choose a special resolution at a general meeting. Whether a claim is within twice the total amount of the current annual fees cannot be told: whether "the total amount of the current annual fees" in s 18(2) means the owners corporation's total annual fees or the lot's is not stated in the notes, and the Victorian financial year is not confirmed, so the current annual fees cannot be worked out either. Until both are confirmed every proceeding needs a special resolution at a general meeting (decision D2).`,
    );
    expect(complete("COMMITTEE_REVIEW", { authority: carried(SPECIAL), amountOwing: "100.00" })).toBeNull();
  });

  it("the gate, with a fixture comparator: exactly 2x accepts an ordinary resolution, 2x plus 1 cent refuses it", () => {
    expect(complete("COMMITTEE_REVIEW", { authority: carried(ORDINARY), amountOwing: "1000.00", comparatorCents: 50_000 }, WITH_COMPARATOR)).toBeNull();
    expect(complete("COMMITTEE_REVIEW", { authority: carried(ORDINARY), amountOwing: "1000.01", comparatorCents: 50_000 }, WITH_COMPARATOR)).toBe(
      "The amount owing ($1,000.01) is more than twice the total amount of the current annual fees ($1,000.00), so choose a special resolution at a general meeting.",
    );
    expect(complete("COMMITTEE_REVIEW", { authority: carried(SPECIAL), amountOwing: "1000.01", comparatorCents: 50_000 }, WITH_COMPARATOR)).toBeNull();
    // No amount for the comparator (StrataVerze never works it out yet): the special resolution only.
    expect(complete("COMMITTEE_REVIEW", { authority: carried(ORDINARY), amountOwing: "10.00", comparatorCents: null }, WITH_COMPARATOR)).toBe(
      "Choose a special resolution at a general meeting. StrataVerze does not work out twice the total amount of the current annual fees yet, so whether the claim is within it cannot be told.",
    );
    expect(complete("COMMITTEE_REVIEW", { authority: carried(ORDINARY), amountOwing: null, comparatorCents: 50_000 }, WITH_COMPARATOR)).toBe(
      "Could not work out the amount owing, so choose a special resolution at a general meeting. Nothing was saved.",
    );
  });

  it("refuses a committee motion and the adviser alone", () => {
    expect(complete("COMMITTEE_REVIEW", { authority: carried(COMMITTEE) })).toBe("Choose a special resolution at a general meeting.");
    expect(complete("COMMITTEE_REVIEW")).toBe("Choose the meeting and the motion that decided to start proceedings: a special resolution at a general meeting.");
    expect(rule.managerMayDecide.value).toBe(false);
  });

  it("a resolution must have taken effect by the building's day (an interim special resolution's day is the day it took effect)", () => {
    expect(complete("COMMITTEE_REVIEW", { authority: carried(SPECIAL, "2026-11-03"), amountOwing: "1.00" })).toBe("That resolution has not taken effect yet, so it cannot be relied on.");
    expect(complete("COMMITTEE_REVIEW", { authority: carried(SPECIAL, "2026-11-02"), amountOwing: "1.00" })).toBeNull();
  });

  it("a threshold whose resolutions the pack does not accept, or whose comparator is not one StrataVerze knows, is not in the shape", () => {
    const shape = "This building's debt recovery rules are not in the shape StrataVerze applies, so this is refused. Nothing was saved.";
    expect(recoveryGateProblem(withVic({ authorityToSue: { ...rule, accepted: { ...rule.accepted, value: [SPECIAL] } } }), { action: "INITIATE", applies: true })).toBe(shape);
    expect(recoveryGateProblem(withVic(threshold({ value: "BUDGET", status: "STRATAVERZE", source: "x" })), { action: "INITIATE", applies: true })).toBe(shape);
  });
});

describe("proceedings for more than the amount decided are refused", () => {
  const at = (amountOwing: string | null, authorisedAmount: string | null) =>
    complete("PROCEEDINGS", { recorded: { ...AUTHORISED, authorisedAmount }, forum: "VCAT", amountOwing, today: "2026-11-02" });

  it("the same or a smaller amount passes, one cent more is refused, and an amount not known refuses", () => {
    expect(at("1235.50", "1235.50")).toBeNull();
    expect(at("1000.00", "1235.50")).toBeNull();
    expect(at("1235.51", "1235.50")).toBe(
      "The amount owing now ($1,235.51) is more than the amount owing when the decision to start proceedings was recorded ($1,235.50), so that decision may not cover it. This step cannot be completed. Nothing was saved.",
    );
    const unknown = "Could not compare the amount owing with the amount recorded with the decision to start proceedings, so this step cannot be completed. Nothing was saved.";
    expect(at(null, "1235.50")).toBe(unknown);
    expect(at("1235.50", null)).toBe(unknown);
  });

  it("reads amounts to the cent", () => {
    expect([amountCents("1235.5"), amountCents("0.01"), amountCents("12"), amountCents("1.234"), amountCents(""), amountCents(null)]).toEqual([123_550, 1, 1_200, null, null, null]);
  });
});

describe("the final fee notice (D3)", () => {
  const refusal =
    "StrataVerze cannot give the final fee notice yet: it must be in the approved form (Owners corporation final fee notice), which StrataVerze cannot produce yet, and the day the current approved forms applied from is not confirmed (April 2025 in guidance; the 28 April 2025 date was found in no official source). The final fee notice, if given outside StrataVerze, cannot be recorded either. Recording a final fee notice given outside StrataVerze is refused for now, until how the approved forms are used is settled (FOR_REVIEW APPROVED_FORMS_USE and FINAL_NOTICE_OUTSIDE). So this step cannot be completed. Nothing was saved.";

  it("is refused for StrataVerze to give and for a notice given outside StrataVerze, whatever the day or notices", () => {
    expect(recoveryStepNeeds(VIC, "FINAL_NOTICE")).toEqual({ problem: refusal });
    expect(complete("FINAL_NOTICE", { notices: [notice()], packCode: "AU-VIC", today: "2026-12-01", finalNoticeGivenOn: "2026-11-30" })).toBe(refusal);
    expect(recoveryRecordsToWrite(VIC, { stepType: "FINAL_NOTICE", authority: null, forum: null, today: "2026-12-01", amountOwing: "1", finalNoticeGivenOn: "2026-11-30" })).toEqual([]);
  });

  it("with no value for recording one given outside, it is refused with the pack's note", () => {
    const none = withVic({ finalNotice: { ...RECOVERY.finalNotice, givenOutsideMayBeRecorded: { value: null, status: "NOT_CONFIRMED", source: "x", note: "not decided" } } });
    expect(recoveryStepNeeds(none, "FINAL_NOTICE")).toEqual({ problem: expect.stringMatching(/cannot be recorded either\. Not decided\. So this step cannot be completed/) });
  });

  it("where recording one given outside is allowed (a fixture), the day given is asked for and recorded", () => {
    expect(recoveryStepNeeds(OUTSIDE_ALLOWED, "FINAL_NOTICE")).toEqual({ authority: null, forum: null, finalNotice: { words: "the final fee notice" } });
    const base = { notices: [notice()], packCode: "AU-VIC", today: "2026-11-02" };
    expect(complete("FINAL_NOTICE", base, OUTSIDE_ALLOWED)).toBe("Enter the day the final fee notice was given.");
    expect(complete("FINAL_NOTICE", { ...base, finalNoticeGivenOn: "2026-11-03" }, OUTSIDE_ALLOWED)).toBe("The day the final fee notice was given cannot be after today (02/11/2026).");
    expect(complete("FINAL_NOTICE", { ...base, finalNoticeGivenOn: "2026-10-30" }, OUTSIDE_ALLOWED)).toBeNull();
    expect(recoveryRecordsToWrite(OUTSIDE_ALLOWED, { stepType: "FINAL_NOTICE", authority: null, forum: null, today: "2026-11-02", amountOwing: "1", finalNoticeGivenOn: "2026-10-30" })).toEqual([
      { kind: "FINAL_NOTICE_GIVEN", decidedOn: "2026-10-30", resolutionMeetingId: null, resolutionItemId: null, resolutionKind: null, amount: null, forum: null },
    ]);
  });
});

describe("the s 32(1) wait: from day 29 after the latest fee notice was issued (D4, D15)", () => {
  const at = (today: string, notices: readonly TimingNotice[] | undefined = [notice()], given?: string) =>
    complete("FINAL_NOTICE", { notices, packCode: "AU-VIC", today, finalNoticeGivenOn: given ?? today }, OUTSIDE_ALLOWED);

  it("day 28 is refused and day 29 allowed", () => {
    expect(at("2026-10-29")).toBe(
      "Final Notice cannot have been given before 30/10/2026: a final fee notice may be given only if the fees are not paid within 28 days after the fee notice (OCA s 32(1)), which StrataVerze counts from day 29 after the day each overdue fee notice was issued. Nothing was saved.",
    );
    expect(at("2026-10-30")).toBeNull();
  });

  it("counts from the latest overdue notice", () => {
    const two = [notice({ number: "F-1", issuedOn: "2026-09-01" }), notice({ number: "F-2", issuedOn: "2026-10-01" })];
    expect(at("2026-10-29", two)).toMatch(/before 30\/10\/2026/);
    expect(at("2026-10-30", two)).toBeNull();
  });

  it("the day given is what counts, not the day it is recorded", () => {
    expect(at("2026-11-20", [notice()], "2026-10-29")).toMatch(/^Final Notice cannot have been given before 30\/10\/2026/);
    expect(at("2026-11-20", [notice()], "2026-10-30")).toBeNull();
  });

  it("refuses a takeover notice, a notice issued under other rules or none, no notices, notices not read and a notice with no issue day", () => {
    expect(at("2026-12-01", [notice(), notice({ number: "T-9", takeover: true, rulePack: null })])).toBe(
      "Notice T-9 was not issued under this building's rules in StrataVerze (brought across at takeover, or issued under other rules), so the days before Final Notice cannot be counted from it. Nothing was saved.",
    );
    expect(at("2026-12-01", [notice({ number: "N-1", rulePack: "AU-NSW 2026.10.16" })])).toMatch(/^Notice N-1 was not issued under this building's rules/);
    expect(at("2026-12-01", [notice({ number: "N-2", rulePack: null })])).toMatch(/^Notice N-2 was not issued/);
    expect(at("2026-12-01", [notice({ number: "N-3", rulePack: "AU-VICTORIA 1" })])).toMatch(/^Notice N-3 was not issued/);
    expect(at("2026-12-01", [])).toBe("No notice of this lot is overdue, so Final Notice cannot be completed. Nothing was saved.");
    expect(complete("FINAL_NOTICE", { packCode: "AU-VIC", today: "2026-12-01", finalNoticeGivenOn: "2026-12-01" }, OUTSIDE_ALLOWED)).toBe(
      "Could not check the lot's notices, so Final Notice cannot be completed. Nothing was saved.",
    );
    expect(at("2026-12-01", [notice({ issuedOn: null })])).toBe("The day notice F-1 was issued is not recorded, so Final Notice cannot be completed. Nothing was saved.");
  });

  it("a day count or its start with no value refuses with the pack's note", () => {
    const timing = (over: Record<string, unknown>) => withVic({ ...OUTSIDE_ALLOWED.DEBT_RECOVERY, stepTiming: RECOVERY.stepTiming.map((t) => (t.stepType === "FINAL_NOTICE" ? { ...t, ...over } : t)) });
    expect(complete("FINAL_NOTICE", { notices: [notice()], packCode: "AU-VIC", today: "2026-12-01", finalNoticeGivenOn: "2026-12-01" }, timing({ days: { value: null, status: "NOT_CONFIRMED", source: "x", note: "Days not read." } }))).toBe(
      "Final Notice cannot be completed: how many days it must wait is not confirmed. Days not read. Nothing was saved.",
    );
    expect(
      complete("FINAL_NOTICE", { notices: [notice()], packCode: "AU-VIC", today: "2026-12-01", finalNoticeGivenOn: "2026-12-01" }, timing({ earliest: { value: null, status: "NOT_CONFIRMED", source: "x", note: "Not decided." } })),
    ).toBe("Final Notice cannot be completed: from which day it may be completed is not confirmed. Not decided. Nothing was saved.");
  });
});

describe("the s 163(2) wait: from day 29 after the final notice was recorded as given, for VCAT and a court (D4, D5)", () => {
  const at = (forum: string, today: string, finalNoticeGivenOn: string | null = "2026-10-01") =>
    complete("PROCEEDINGS", { recorded: { ...AUTHORISED, finalNoticeGivenOn }, forum, amountOwing: "1235.50", today });

  it.each(["VCAT", "COURT"])("%s: day 28 refused, day 29 allowed", (forum) => {
    expect(at(forum, "2026-10-29")).toBe(
      "Proceedings can be completed from 30/10/2026: an application to VCAT for payment can only be made if the amount is not paid within 28 days after the final notice (OCA s 163(2)), which StrataVerze counts from day 29 after the day the final notice was recorded as given, and applies to a claim in a court too. Nothing was saved.",
    );
    expect(at(forum, "2026-10-30")).toBeNull();
  });

  it("no final notice recorded as given refuses", () => {
    expect(at("VCAT", "2026-12-01", null)).toBe("The final fee notice is not recorded as given on this case, so Proceedings cannot be completed. Nothing was saved.");
  });

  it("the forum must still be one of the pack's, and no limit or court is named", () => {
    expect(at("SAT", "2026-12-01")).toBe("Choose where proceedings were started: VCAT or any court of competent jurisdiction.");
    expect(RECOVERY.forum.options.map((o) => [o.key, o.status, o.limitCents])).toEqual([
      ["VCAT", "CONFIRMED", null],
      ["COURT", "CONFIRMED", null],
    ]);
    expect(recoveryStepNeeds(VIC, "PROCEEDINGS")).toEqual({ authority: null, forum: { options: [{ key: "VCAT", words: "VCAT" }, { key: "COURT", words: "any court of competent jurisdiction" }], notes: [] } });
  });
});

describe("the payment plan pause guard (D14)", () => {
  const pending = (over: Record<string, unknown>) => ({
    PAYMENT_PLANS: {
      title: "Payment plans",
      versions: [{ legalStatus: "ENACTED_NOT_COMMENCED", value: {}, commencedOn: null, fixedStartDate: null, latestStartDate: "2027-12-01", commencement: "x", source: "x", status: "CONFIRMED", ...over }],
    },
  });
  const proceedings = (dated: unknown, today: string) =>
    complete("PROCEEDINGS", { recorded: AUTHORISED, forum: "VCAT", amountOwing: "1235.50", today }, withVic({}, dated as Rules["DATED_RULES"]));
  const paused = (today: string) =>
    `Proceedings cannot be completed: the law on payment plans may have started by today (${today}), and the payment plan pause is not supported yet. Nothing was saved.`;

  it("the VIC pack: refused from the latest start date (1 Dec 2027), allowed the day before", () => {
    expect(complete("PROCEEDINGS", { recorded: AUTHORISED, forum: "VCAT", amountOwing: "1235.50", today: "2027-11-30" })).toBeNull();
    expect(complete("PROCEEDINGS", { recorded: AUTHORISED, forum: "COURT", amountOwing: "1235.50", today: "2027-12-01" })).toBe(paused("01/12/2027"));
    const finalNotice = complete("FINAL_NOTICE", { notices: [notice()], packCode: "AU-VIC", today: "2027-12-01", finalNoticeGivenOn: "2027-12-01" }, OUTSIDE_ALLOWED);
    expect(finalNotice).toBe("Final Notice cannot be completed: the law on payment plans may have started by today (01/12/2027), and the payment plan pause is not supported yet. Nothing was saved.");
  });

  it("refused once recorded as commenced, or once its fixed or latest start date has passed", () => {
    expect(proceedings(pending({ commencedOn: "2026-11-02", latestStartDate: "2027-12-01" }), "2026-11-02")).toBe(paused("02/11/2026"));
    expect(proceedings(pending({ commencedOn: "2026-11-03" }), "2026-11-02")).toBeNull();
    expect(proceedings(pending({ latestStartDate: "2026-11-02" }), "2026-11-02")).toBe(paused("02/11/2026"));
    expect(proceedings(pending({ fixedStartDate: "2026-11-01" }), "2026-11-02")).toBe(paused("02/11/2026"));
    // Recorded as in force.
    expect(proceedings({ PAYMENT_PLANS: { title: "Payment plans", versions: [{ legalStatus: "IN_FORCE", from: "2026-11-01", value: {}, source: "x", status: "CONFIRMED" }] } }, "2026-11-02")).toBe(paused("02/11/2026"));
    // A Bill never applies.
    expect(proceedings({ PAYMENT_PLANS: { title: "Payment plans", versions: [{ legalStatus: "NOT_LAW", presentedOn: "2026-01-01", value: {}, commencement: "x", source: "x", textStatus: "READ_IN_BILL_TEXT" }] } }, "2026-11-02")).toBeNull();
  });

  it("a rule with no values, or a value whose legal status is not known, refuses; an announcement never applies (review L1)", () => {
    expect(proceedings({ PAYMENT_PLANS: { title: "Payment plans", versions: [] } }, "2026-11-02")).toBe(paused("02/11/2026"));
    expect(proceedings({ PAYMENT_PLANS: { title: "Payment plans", versions: [{ legalStatus: "PROCLAIMED", value: {}, source: "x" }] } }, "2026-11-02")).toBe(paused("02/11/2026"));
    expect(proceedings({ PAYMENT_PLANS: { title: "Payment plans", versions: [{ value: {}, source: "x" }] } }, "2026-11-02")).toBe(paused("02/11/2026"));
    expect(proceedings({ PAYMENT_PLANS: { title: "Payment plans", versions: ["x"] } }, "2026-11-02")).toBe(paused("02/11/2026"));
    expect(proceedings({ PAYMENT_PLANS: { title: "Payment plans", versions: [{ legalStatus: "ANNOUNCED_NO_LEGISLATION", value: {}, commencement: "x", source: "x", status: "GUIDANCE" }] } }, "2026-11-02")).toBeNull();
  });

  it("a dated rule the pack does not hold refuses", () => {
    expect(proceedings({}, "2026-11-02")).toBe("Proceedings cannot be checked against the law that would pause it, which is not in this building's rules. Nothing was saved.");
    const noDated = { DEBT_RECOVERY: RECOVERY as unknown as Rules["DEBT_RECOVERY"] };
    expect(complete("PROCEEDINGS", { recorded: AUTHORISED, forum: "VCAT", amountOwing: "1235.50" }, noDated as Rules)).toMatch(/not in this building's rules/);
  });
});

describe("shape checks for the timing and final notice keys", () => {
  const shape = "This building's debt recovery rules are not in the shape StrataVerze applies, so this is refused. Nothing was saved.";
  const init = (rules: Rules) => recoveryGateProblem(rules, { action: "INITIATE", applies: true });

  it("refuses a timing rule by forum on a step that does not record the forum, a bad day count, and a key written as undefined", () => {
    expect(init(withVic({ stepTiming: [{ ...RECOVERY.stepTiming[1], stepType: "LEGAL_REFERRAL" }] }))).toBe(shape);
    expect(init(withVic({ stepTiming: [{ ...RECOVERY.stepTiming[0], days: { value: -1, status: "CONFIRMED", source: "x" } }] }))).toBe(shape);
    expect(init(withVic({ stepTiming: [{ ...RECOVERY.stepTiming[0], pausedBy: undefined }] }))).toBe(shape);
    expect(init(withVic({ finalNotice: { ...RECOVERY.finalNotice, givenOutsideMayBeRecorded: { value: "yes", status: "STRATAVERZE", source: "x" } } }))).toBe(shape);
    expect(init(withVic({ appliesWhen: { when: RECOVERY.appliesWhen.when } }))).toBe(shape);
  });

  it("refuses counting from a notice other than the pack's final notice as not supported", () => {
    expect(init(withVic({ stepTiming: [{ ...RECOVERY.stepTiming[1], after: { kind: "STEP_NOTICE_SENT", stepType: "INITIAL_CONTACT" } }] }))).toBe(
      "Debt recovery for this building needs rules StrataVerze does not apply yet, so this is refused. Nothing was saved.",
    );
  });
});
