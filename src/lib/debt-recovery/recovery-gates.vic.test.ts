/**
 * The debt recovery gates applied for Victoria (stage 2, PR 9c), with the VIC
 * draft pack and fixtures: the s 18 amount threshold (D2), the final fee notice
 * (D3), the s 32(1) and s 163(2) waits counted from day 29 (D4, D5, D15), the
 * payment plan pause guard (D14) and tier 5 (D6); and, at the Proceedings step,
 * the decision checked again and the claim limited to the notices the final
 * notice covered (Matthew Wrigley's decision of 30 Oct 2026). Every value
 * missing fails closed. NSW and Queensland stay null (recovery-gates.test.ts).
 */
import { describe, expect, it } from "vitest";
import { PENDING_RULE_PACKS, type StatutoryRules } from "@/config/statutory";
import {
  amountCents,
  authorityNeeded,
  claimAmount,
  recoveryGateProblem,
  recoveryGatesApply,
  recoveryRecordsToWrite,
  recoveryStepNeeds,
  type AuthorityFact,
  type ClaimNotice,
  type DebtAuthorityResolution,
  type RecoveryGateInput,
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
const AUTHORISED = { authorityToSue: true, forum: null, authorisedResolutionKind: "SPECIAL", finalNoticeGivenOn: "2026-10-01" };
/** A notice of the lot overdue on the building's day (issued 1 Oct, due 29 Oct 2026, unless said), as overdueNoticesForClaim reads it. */
const notice = (over: Partial<ClaimNotice> = {}): ClaimNotice => ({
  number: "F-1",
  issuedOn: "2026-10-01",
  dueOn: "2026-10-29",
  rulePack: `AU-VIC ${VIC_PACK.version}`,
  takeover: false,
  owingCents: 10_000,
  ...over,
});
/** A notice overdue when proceedings are started; by default one the final notice given on 1 Oct 2026 covered (due 1 Sep, issued 1 Aug). */
const claimNotice = (over: Partial<ClaimNotice> = {}): ClaimNotice => notice({ issuedOn: "2026-08-01", dueOn: "2026-09-01", ...over });
/** The lot's overdue notices at the Proceedings step, each covered by the final notice (decision of 30 Oct 2026). */
const CLAIM = { claimNotices: [claimNotice()], packCode: "AU-VIC" };

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
    const proceedings = { recorded: AUTHORISED, forum: "VCAT", amountOwing: "1235.50", ...CLAIM };
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

describe("the decision checked again when proceedings are started (decision of 30 Oct 2026)", () => {
  const at = (authorisedResolutionKind: string | null, amountOwing: string | null, over: Partial<Extract<RecoveryGateInput, { action: "COMPLETE_STEP" }>> = {}, rules: Rules = VIC) =>
    complete("PROCEEDINGS", { recorded: { ...AUTHORISED, authorisedResolutionKind }, forum: "VCAT", amountOwing, ...CLAIM, ...over }, rules);
  const comparatorNote =
    'whether "the total amount of the current annual fees" in s 18(2) means the owners corporation\'s total annual fees or the lot\'s is not stated in the notes, and the Victorian financial year is not confirmed, so the current annual fees cannot be worked out either. Until both are confirmed every proceeding needs a special resolution at a general meeting (decision D2).';
  const ordinaryWas = "The decision to start proceedings was recorded as an ordinary resolution at a general meeting, which may decide only a claim within twice the total amount of the current annual fees";
  const onlySpecial = "Only a special resolution at a general meeting may decide it, so this step cannot be completed. Nothing was saved.";

  it("a special resolution covers a larger amount owing since the decision: the growth alone is no longer refused", () => {
    // The amount recorded with the decision was 1,235.50 (the old check refused 1,235.51); it is no longer compared.
    expect(at("SPECIAL", "1235.51")).toBeNull();
    expect(at("SPECIAL", "999999.99")).toBeNull();
    expect(at("SPECIAL", "999999.99", { comparatorCents: 50_000 }, WITH_COMPARATOR)).toBeNull();
    // A special resolution needs no amount at all.
    expect(at("SPECIAL", null)).toBeNull();
  });

  it("an ordinary resolution is refused while the comparator has no value (the VIC pack), whatever the amount", () => {
    for (const amount of ["0.01", "1235.50", "999999.99"]) {
      expect(at("ORDINARY", amount), amount).toBe(`${ordinaryWas}, and whether the claim is within it cannot be told: ${comparatorNote} ${onlySpecial}`);
    }
  });

  it("an ordinary resolution with a fixture comparator: within the ceiling allowed, grown past it refused", () => {
    expect(at("ORDINARY", "1000.00", { comparatorCents: 50_000 }, WITH_COMPARATOR)).toBeNull();
    expect(at("ORDINARY", "1000.01", { comparatorCents: 50_000 }, WITH_COMPARATOR)).toBe(
      `${ordinaryWas}, and the amount owing now ($1,000.01) is more than twice the total amount of the current annual fees ($1,000.00). ${onlySpecial}`,
    );
    expect(at("ORDINARY", null, { comparatorCents: 50_000 }, WITH_COMPARATOR)).toBe(`${ordinaryWas}, and the amount owing could not be worked out. ${onlySpecial}`);
  });

  it("an ordinary resolution with no comparator amount (as the server passes it) is refused, even with a comparator value", () => {
    expect(at("ORDINARY", "1.00", { comparatorCents: null }, WITH_COMPARATOR)).toBe(
      `${ordinaryWas}, and StrataVerze does not work out twice the total amount of the current annual fees yet, so whether the claim is within it cannot be told. ${onlySpecial}`,
    );
    expect(at("ORDINARY", "1.00", {}, WITH_COMPARATOR)).toMatch(/^The decision to start proceedings was recorded as an ordinary resolution/);
  });

  it("a recorded resolution that matches none the pack accepts, or none recorded, refuses", () => {
    const unknown = "Could not tell which resolution decided to start proceedings on this case, so this step cannot be completed. Nothing was saved.";
    for (const kind of [null, "COMMITTEE", "GENERAL_MEETING", "special", ""]) expect(at(kind, "1.00"), String(kind)).toBe(unknown);
    expect(complete("PROCEEDINGS", { recorded: { authorityToSue: true, forum: null, finalNoticeGivenOn: "2026-10-01" }, forum: "VCAT", amountOwing: "1.00", ...CLAIM })).toBe(unknown);
  });

  it("reads amounts to the cent", () => {
    expect([amountCents("1235.5"), amountCents("0.01"), amountCents("12"), amountCents("1.234"), amountCents(""), amountCents(null)]).toEqual([123_550, 1, 1_200, null, null, null]);
  });
});

describe("the claim is limited to the notices the final notice covered (decision of 30 Oct 2026)", () => {
  // The final notice was recorded as given on 1 Oct 2026; the building's day is 2 Nov 2026.
  const at = (claimNotices: readonly ClaimNotice[] | undefined, over: Partial<Extract<RecoveryGateInput, { action: "COMPLETE_STEP" }>> = {}) =>
    complete("PROCEEDINGS", { recorded: AUTHORISED, forum: "VCAT", amountOwing: "5000.00", packCode: "AU-VIC", ...(claimNotices ? { claimNotices } : {}), ...over });
  const refusal = (numbers: string, why: string) =>
    `Notice ${numbers} ${why} on the day the final fee notice was recorded as given (01/10/2026), so the final fee notice did not cover it. StrataVerze limits a claim to the notices the final fee notice covered (StrataVerze practice, decision of 30 Oct 2026) and does not record which notices a claim includes, so Proceedings cannot be completed while such a notice is overdue. Wait until it is paid, or close this case and open a new one. Nothing was saved.`;

  it("allows notices overdue and past the s 32(1) wait on the day the final notice was given, however the amount has grown", () => {
    expect(at([claimNotice(), claimNotice({ number: "F-0", issuedOn: "2026-07-01", dueOn: "2026-08-01" })])).toBeNull();
    // Due the day before, and issued on day 29 before: covered.
    expect(at([claimNotice({ dueOn: "2026-09-30", issuedOn: "2026-09-02" })])).toBeNull();
    // Nothing overdue now: nothing claimed that was not covered.
    expect(at([])).toBeNull();
  });

  it("refuses a notice that became overdue after the final notice was given (the next quarter's)", () => {
    expect(at([claimNotice(), claimNotice({ number: "F-2", issuedOn: "2026-09-01", dueOn: "2026-10-01" })])).toBe(refusal("F-2", "was not yet overdue"));
    expect(at([claimNotice({ number: "F-3", issuedOn: "2026-09-20", dueOn: "2026-10-20" }), claimNotice({ number: "F-4", issuedOn: "2026-10-01", dueOn: "2026-10-31" })])).toBe(
      refusal("F-3, F-4", "was not yet overdue"),
    );
  });

  it("refuses a notice overdue on that day but issued less than 29 days before it (s 32(1) as D4 counts it)", () => {
    expect(at([claimNotice({ number: "F-5", issuedOn: "2026-09-03", dueOn: "2026-09-30" })])).toBe(refusal("F-5", "was not yet past the wait before the final fee notice may be given"));
  });

  it("refuses a takeover notice, one issued under other rules or none, one with no issue or due day, and notices not read", () => {
    const tail = "so whether the final fee notice covered it cannot be told, and Proceedings cannot be completed. Nothing was saved.";
    expect(at([claimNotice({ number: "T-9", takeover: true, rulePack: null })])).toBe(
      `Notice T-9 was not issued under this building's rules in StrataVerze (brought across at takeover, or issued under other rules), ${tail}`,
    );
    expect(at([claimNotice({ number: "N-1", rulePack: "AU-NSW 2026.10.16" })])).toMatch(/^Notice N-1 was not issued under this building's rules/);
    expect(at([claimNotice({ number: "N-2", rulePack: null })])).toMatch(/^Notice N-2 was not issued/);
    expect(at([claimNotice()], { packCode: undefined })).toMatch(/^Notice F-1 was not issued/);
    expect(at([claimNotice({ issuedOn: null })])).toBe(`The day notice F-1 was issued or fell due is not recorded, ${tail}`);
    expect(at([claimNotice({ dueOn: null })])).toBe(`The day notice F-1 was issued or fell due is not recorded, ${tail}`);
    expect(at(undefined)).toBe("Could not check the lot's notices, so Proceedings cannot be completed. Nothing was saved.");
  });

  it("refuses with no final notice recorded as given", () => {
    expect(at([claimNotice()], { recorded: { ...AUTHORISED, finalNoticeGivenOn: null } })).toBe(
      "The final fee notice is not recorded as given on this case, so Proceedings cannot be completed. Nothing was saved.",
    );
  });

  it("refuses where the final notice's own wait has no value", () => {
    const rules = withVic({ stepTiming: RECOVERY.stepTiming.map((t) => (t.stepType === "FINAL_NOTICE" ? { ...t, days: { value: null, status: "NOT_CONFIRMED", source: "x", note: "Days not read." } } : t)) });
    expect(complete("PROCEEDINGS", { recorded: AUTHORISED, forum: "VCAT", amountOwing: "1.00", ...CLAIM }, rules)).toBe(
      "How long the final fee notice must wait after a notice is not set or not confirmed for this building, so which notices it covered cannot be told, and Proceedings cannot be completed. Nothing was saved.",
    );
  });

  it("is checked only at the Proceedings step", () => {
    expect(complete("LEGAL_REFERRAL", { recorded: AUTHORISED, claimNotices: [claimNotice({ dueOn: "2026-10-30" })] })).toBeNull();
  });
});

describe("the final fee notice (D3)", () => {
  const refusal =
    "StrataVerze cannot give the final fee notice yet: it must be in the approved form (Owners corporation final fee notice), which StrataVerze cannot produce yet, and the day the current approved forms applied from is not confirmed (April 2025 in guidance; the 28 April 2025 date was found in no official source). The final fee notice, if given outside StrataVerze, cannot be recorded either. Recording a final fee notice given outside StrataVerze is refused for now, until how the approved forms are used is settled (FOR_REVIEW APPROVED_FORMS_USE and FINAL_NOTICE_OUTSIDE). So this step cannot be completed. Nothing was saved.";

  it("is refused for StrataVerze to give and for a notice given outside StrataVerze, whatever the day or notices", () => {
    expect(recoveryStepNeeds(VIC, "FINAL_NOTICE")).toEqual({ problem: refusal });
    expect(complete("FINAL_NOTICE", { claimNotices: [notice()], packCode: "AU-VIC", today: "2026-12-01", finalNoticeGivenOn: "2026-11-30" })).toBe(refusal);
    expect(recoveryRecordsToWrite(VIC, { stepType: "FINAL_NOTICE", authority: null, forum: null, today: "2026-12-01", amountOwing: "1", finalNoticeGivenOn: "2026-11-30" })).toEqual([]);
  });

  it("with no value for recording one given outside, it is refused with the pack's note", () => {
    const none = withVic({ finalNotice: { ...RECOVERY.finalNotice, givenOutsideMayBeRecorded: { value: null, status: "NOT_CONFIRMED", source: "x", note: "not decided" } } });
    expect(recoveryStepNeeds(none, "FINAL_NOTICE")).toEqual({ problem: expect.stringMatching(/cannot be recorded either\. Not decided\. So this step cannot be completed/) });
  });

  it("where recording one given outside is allowed (a fixture), the day given is asked for and recorded", () => {
    expect(recoveryStepNeeds(OUTSIDE_ALLOWED, "FINAL_NOTICE")).toEqual({ authority: null, forum: null, finalNotice: { words: "the final fee notice" } });
    const base = { claimNotices: [notice()], packCode: "AU-VIC", today: "2026-11-02" };
    expect(complete("FINAL_NOTICE", base, OUTSIDE_ALLOWED)).toBe("Enter the day the final fee notice was given.");
    expect(complete("FINAL_NOTICE", { ...base, finalNoticeGivenOn: "2026-11-03" }, OUTSIDE_ALLOWED)).toBe("The day the final fee notice was given cannot be after today (02/11/2026).");
    expect(complete("FINAL_NOTICE", { ...base, finalNoticeGivenOn: "2026-10-30" }, OUTSIDE_ALLOWED)).toBeNull();
    expect(recoveryRecordsToWrite(OUTSIDE_ALLOWED, { stepType: "FINAL_NOTICE", authority: null, forum: null, today: "2026-11-02", amountOwing: "1", finalNoticeGivenOn: "2026-10-30" })).toEqual([
      { kind: "FINAL_NOTICE_GIVEN", decidedOn: "2026-10-30", resolutionMeetingId: null, resolutionItemId: null, resolutionKind: null, amount: null, forum: null },
    ]);
  });
});

describe("the s 32(1) wait: from day 29 after the latest fee notice was issued (D4, D15)", () => {
  const at = (today: string, claimNotices: readonly ClaimNotice[] | undefined = [notice()], given?: string) =>
    complete("FINAL_NOTICE", { ...(claimNotices ? { claimNotices } : {}), packCode: "AU-VIC", today, finalNoticeGivenOn: given ?? today }, OUTSIDE_ALLOWED);

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
    expect(complete("FINAL_NOTICE", { claimNotices: [notice()], packCode: "AU-VIC", today: "2026-12-01", finalNoticeGivenOn: "2026-12-01" }, timing({ days: { value: null, status: "NOT_CONFIRMED", source: "x", note: "Days not read." } }))).toBe(
      "Final Notice cannot be completed: how many days it must wait is not confirmed. Days not read. Nothing was saved.",
    );
    expect(
      complete("FINAL_NOTICE", { claimNotices: [notice()], packCode: "AU-VIC", today: "2026-12-01", finalNoticeGivenOn: "2026-12-01" }, timing({ earliest: { value: null, status: "NOT_CONFIRMED", source: "x", note: "Not decided." } })),
    ).toBe("Final Notice cannot be completed: from which day it may be completed is not confirmed. Not decided. Nothing was saved.");
  });
});

describe("the s 163(2) wait: from day 29 after the final notice was recorded as given, for VCAT and a court (D4, D5)", () => {
  const at = (forum: string, today: string, finalNoticeGivenOn: string | null = "2026-10-01") =>
    complete("PROCEEDINGS", { recorded: { ...AUTHORISED, finalNoticeGivenOn }, forum, amountOwing: "1235.50", ...CLAIM, today });

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

describe("one definition of the notices a final notice covers, at the Final Notice and Proceedings steps (review of 30 Oct 2026)", () => {
  const finalNoticeAt = (claimNotices: readonly ClaimNotice[], given: string, today = given) =>
    complete("FINAL_NOTICE", { claimNotices, packCode: "AU-VIC", today, finalNoticeGivenOn: given }, OUTSIDE_ALLOWED);
  const proceedingsAt = (claimNotices: readonly ClaimNotice[], given: string, today: string) =>
    complete("PROCEEDINGS", { recorded: { ...AUTHORISED, finalNoticeGivenOn: given }, forum: "VCAT", amountOwing: "1.00", claimNotices, packCode: "AU-VIC", today }, OUTSIDE_ALLOWED);
  const dayAfter = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

  it("refuses a final notice given before a notice was overdue: issued 1 Aug, due 15 Sep, given 1 Sep (the reviewer's case)", () => {
    const n = notice({ number: "F-7", issuedOn: "2026-08-01", dueOn: "2026-09-15" });
    expect(finalNoticeAt([n], "2026-09-01", "2026-09-20")).toBe(
      "Notice F-7 was not yet overdue on the day the final fee notice was given (01/09/2026), so the final fee notice given that day did not cover it. StrataVerze records the final fee notice only where it covers every notice of the lot overdue now (StrataVerze practice, decision of 30 Oct 2026). Wait until that notice is paid, or give the final fee notice once it is overdue and record that day. Nothing was saved.",
    );
    // On its due day still refused; the day after, accepted, and then covered at Proceedings.
    expect(finalNoticeAt([n], "2026-09-15", "2026-09-20")).toMatch(/^Notice F-7 was not yet overdue/);
    expect(finalNoticeAt([n], "2026-09-16", "2026-09-20")).toBeNull();
    expect(proceedingsAt([n], "2026-09-16", "2026-10-15")).toBeNull();
    // Without the due-day check the old step accepted 1 Sep, and Proceedings then refused the same notice.
    expect(proceedingsAt([n], "2026-09-01", "2026-10-15")).toMatch(/^Notice F-7 was not yet overdue on the day the final fee notice was recorded as given \(01\/09\/2026\)/);
  });

  it("refuses a notice with no due day at the Final Notice step", () => {
    expect(finalNoticeAt([notice({ dueOn: null })], "2026-11-30")).toBe("The day notice F-1 was issued or fell due is not recorded, so Final Notice cannot be completed. Nothing was saved.");
  });

  it("a pack with a final notice but no wait counted from the overdue notices refuses at both steps, never skipping the wait", () => {
    const noWait = withVic({ ...OUTSIDE_ALLOWED.DEBT_RECOVERY, stepTiming: RECOVERY.stepTiming.filter((t) => t.stepType !== "FINAL_NOTICE") });
    expect(complete("FINAL_NOTICE", { claimNotices: [notice()], packCode: "AU-VIC", today: "2026-11-30", finalNoticeGivenOn: "2026-11-30" }, noWait)).toBe(
      "How long the final fee notice must wait after a notice is not set or not confirmed for this building, so Final Notice cannot be completed. Nothing was saved.",
    );
    expect(complete("PROCEEDINGS", { recorded: AUTHORISED, forum: "VCAT", amountOwing: "1.00", ...CLAIM }, noWait)).toBe(
      "How long the final fee notice must wait after a notice is not set or not confirmed for this building, so which notices it covered cannot be told, and Proceedings cannot be completed. Nothing was saved.",
    );
  });

  it("property: any day the Final Notice step accepts covers the same notices at Proceedings", () => {
    // A small seeded generator, so the run is the same every time.
    let seed = 20261030;
    const rand = (n: number) => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed % n;
    };
    let accepted = 0;
    let refused = 0;
    for (let i = 0; i < 3000; i++) {
      const count = 1 + rand(4);
      const notices = Array.from({ length: count }, (_, k) => {
        const issuedOn = dayAfter("2026-01-01", rand(150));
        return notice({ number: `N-${k}`, issuedOn, dueOn: dayAfter(issuedOn, rand(70) - 5) });
      });
      const given = dayAfter("2026-01-01", rand(260));
      const finalToday = dayAfter(given, rand(15));
      // The notices overdue when the Final Notice step is completed, as overdueNoticesForClaim reads them.
      const overdue = notices.filter((n) => (n.dueOn as string) < finalToday);
      if (overdue.length === 0) continue;
      if (finalNoticeAt(overdue, given, finalToday) !== null) {
        refused++;
        continue;
      }
      accepted++;
      // Proceedings once the s 163(2) wait has passed, for the same notices.
      expect(proceedingsAt(overdue, given, dayAfter(given, 29 + rand(30))), JSON.stringify({ overdue, given, finalToday })).toBeNull();
    }
    // Both outcomes are exercised.
    expect(accepted).toBeGreaterThan(100);
    expect(refused).toBeGreaterThan(100);
  });
});

describe("the claim amount (review of 30 Oct 2026)", () => {
  it("adds each claim notice's balance and interest, to the cent, and is not known where any amount is not", () => {
    expect(claimAmount([])).toBe("0.00");
    expect(claimAmount([{ owingCents: 120_000 }, { owingCents: 30_505 }])).toBe("1505.05");
    expect(claimAmount([{ owingCents: 7 }])).toBe("0.07");
    expect(claimAmount([{ owingCents: 120_000 }, { owingCents: null }])).toBeNull();
    expect(claimAmount([{ owingCents: Number.NaN }])).toBeNull();
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
    complete("PROCEEDINGS", { recorded: AUTHORISED, forum: "VCAT", amountOwing: "1235.50", ...CLAIM, today }, withVic({}, dated as Rules["DATED_RULES"]));
  const paused = (today: string) =>
    `Proceedings cannot be completed: the law on payment plans may have started by today (${today}), and the payment plan pause is not supported yet. Nothing was saved.`;

  it("the VIC pack: refused from the latest start date (1 Dec 2027), allowed the day before", () => {
    expect(complete("PROCEEDINGS", { recorded: AUTHORISED, forum: "VCAT", amountOwing: "1235.50", ...CLAIM, today: "2027-11-30" })).toBeNull();
    expect(complete("PROCEEDINGS", { recorded: AUTHORISED, forum: "COURT", amountOwing: "1235.50", ...CLAIM, today: "2027-12-01" })).toBe(paused("01/12/2027"));
    const finalNotice = complete("FINAL_NOTICE", { claimNotices: [notice()], packCode: "AU-VIC", today: "2027-12-01", finalNoticeGivenOn: "2027-12-01" }, OUTSIDE_ALLOWED);
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
    expect(complete("PROCEEDINGS", { recorded: AUTHORISED, forum: "VCAT", amountOwing: "1235.50", ...CLAIM }, noDated as Rules)).toMatch(/not in this building's rules/);
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
