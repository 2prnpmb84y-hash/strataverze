/**
 * The statutory charge in the draft packs' debt recovery gates (the ACT,
 * stage 2, PR 9b), with fixtures rather than pack values: the charge step
 * (declared by a resolution the pack accepts and lodged, or not declared),
 * the case's charge from its records, closing refused in every status while a
 * lodged charge's revocation is not recorded, and recording the revocation
 * (refused with nothing lodged, twice, before the charge was lodged, after
 * the building's day). NSW, Queensland and Western Australia read nothing.
 */
import { describe, expect, it } from "vitest";
import { PENDING_RULE_PACKS, RULE_PACKS, type StatutoryRules } from "@/config/statutory";
import {
  chargeCloseProblem,
  chargeFacts,
  chargeRevocationProblem,
  recoveryGateProblem,
  recoveryGatesApply,
  recoveryRecordsToWrite,
  recoveryStepNeeds,
  revocationRecord,
  statutoryChargeApplies,
  type AuthorityFact,
  type ChargeChoice,
  type ChargeFacts,
  type DebtAuthorityResolution,
  type RecoveryGateInput,
} from "./recovery-gates";

type Rules = Pick<StatutoryRules, "DEBT_RECOVERY">;

const COMMITTEE: DebtAuthorityResolution = { meeting: "COMMITTEE", kind: "ANY", words: "a motion carried at a committee meeting" };
const GENERAL: DebtAuthorityResolution = { meeting: "GENERAL", kind: "ANY", words: "a motion carried at a general meeting" };
const ORDINARY: DebtAuthorityResolution = { meeting: "GENERAL", kind: "ORDINARY", words: "an ordinary resolution at a general meeting" };

const AUTHORITY = {
  recordedAtStep: "COMMITTEE_REVIEW",
  accepted: { value: [COMMITTEE, ORDINARY], status: "STRATAVERZE", source: "s" },
  managerMayDecide: { value: false, status: "STRATAVERZE", source: "s" },
  source: "s",
  status: "STRATAVERZE",
};

const charge = (over: Record<string, unknown> = {}) => ({
  stepType: "STATUTORY_CHARGE",
  words: "a charge over the lot",
  declaredBy: { value: [COMMITTEE, GENERAL], status: "STRATAVERZE", source: "s" },
  certifiedBy: "the committee",
  lodgedWith: "the land registry",
  copiesTo: ["the owner"],
  securesInterest: true,
  powerOfSale: false,
  revocation: { required: { value: true, status: "CONFIRMED", source: "s" }, withinDays: { value: null, status: "NOT_CONFIRMED", source: "s", note: "No period." } },
  closeBlockedUntilRevoked: { value: "ANY_CLOSE", status: "STRATAVERZE", source: "s" },
  source: "s",
  status: "CONFIRMED",
  ...over,
});

/** A fixture pack with only the given DEBT_RECOVERY keys, beside a source. */
const withRecovery = (extra: Record<string, unknown>): Rules => ({ DEBT_RECOVERY: { source: "fixture", ...extra } as unknown as Rules["DEBT_RECOVERY"] });
const RULES = withRecovery({ authorityToSue: AUTHORITY, statutoryCharge: charge() });

const STEPS = ["LEDGER_VERIFICATION", "INITIAL_CONTACT", "REMINDER_NOTICE", "FINAL_NOTICE", "HARDSHIP_REVIEW", "COMMITTEE_REVIEW", "STATUTORY_CHARGE", "LEGAL_REFERRAL", "PROCEEDINGS", "ENFORCEMENT", "CLOSED"].map(
  (stepType, i) => ({ stepType, stepOrder: i + 1 }),
);
const AUTHORISED = { authorityToSue: true, forum: null };
const declared = (resolution: DebtAuthorityResolution, decidedOn: string, lodgedOn: string | null): ChargeChoice => ({
  declared: true,
  resolution: { problem: null, resolution, decidedOn, meetingId: "meeting-1", itemId: "item-1" },
  lodgedOn,
});
const atCharge = (charge: ChargeChoice | null | undefined, over: Partial<Extract<RecoveryGateInput, { action: "COMPLETE_STEP" }>> = {}): RecoveryGateInput => ({
  action: "COMPLETE_STEP",
  stepType: "STATUTORY_CHARGE",
  caseSteps: STEPS,
  authority: null,
  forum: null,
  recorded: AUTHORISED,
  today: "2026-11-02",
  caseOpenedOn: "2026-10-01",
  ...(charge === undefined ? {} : { charge }),
  ...over,
});

const NOTHING_LODGED: ChargeFacts = { lodgedOn: null, revokedOn: null };
const OUTSTANDING: ChargeFacts = { lodgedOn: "2026-10-22", revokedOn: null };
const REVOKED: ChargeFacts = { lodgedOn: "2026-10-22", revokedOn: "2026-10-30" };
const STATUSES = ["CLOSED_PAID", "CLOSED_SETTLED", "CLOSED_WRITTEN_OFF", undefined] as const;
const SHAPE = "This building's debt recovery rules are not in the shape StrataVerze applies, so this is refused. Nothing was saved.";
const NOT_SUPPORTED = "Debt recovery for this building needs rules StrataVerze does not apply yet, so this is refused. Nothing was saved.";

describe("the charge step", () => {
  it("applies the gates, and opening a case passes", () => {
    expect(recoveryGatesApply(RULES)).toBe(true);
    expect(statutoryChargeApplies(RULES)).toBe(true);
    expect(recoveryGateProblem(RULES, { action: "INITIATE" })).toBeNull();
  });

  it("asks at the charge step only, with who may declare it and where it is lodged", () => {
    expect(recoveryStepNeeds(RULES, "STATUTORY_CHARGE")).toEqual({
      authority: null,
      forum: null,
      charge: { declaredBy: [COMMITTEE, GENERAL], declaredWords: "a motion carried at a committee meeting or a motion carried at a general meeting", words: "a charge over the lot", lodgedWith: "the land registry" },
    });
    // Other steps' needs carry no charge key at all.
    expect(recoveryStepNeeds(RULES, "COMMITTEE_REVIEW")).toEqual({ authority: { accepted: [COMMITTEE, ORDINARY], words: "a motion carried at a committee meeting or an ordinary resolution at a general meeting" }, forum: null });
    for (const t of ["LEDGER_VERIFICATION", "LEGAL_REFERRAL", "PROCEEDINGS", "CLOSED"]) expect(recoveryStepNeeds(RULES, t), t).toBeNull();
  });

  it("who may declare it with no value refuses the step, with the pack's note, and an empty list too", () => {
    const none = withRecovery({ statutoryCharge: charge({ declaredBy: { value: null, status: "NOT_CONFIRMED", source: "s", note: "The notes do not say who declares it." } }) });
    const refusal = "Who may declare a charge over the lot is not confirmed for this building, so this step cannot be completed. The notes do not say who declares it.";
    expect(recoveryStepNeeds(none, "STATUTORY_CHARGE")).toEqual({ problem: refusal });
    expect(recoveryGateProblem(none, atCharge({ declared: false }))).toBe(refusal);
    const empty = withRecovery({ statutoryCharge: charge({ declaredBy: { value: [], status: "STRATAVERZE", source: "s" } }) });
    expect(recoveryStepNeeds(empty, "STATUTORY_CHARGE")).toEqual({ problem: "Who may declare a charge over the lot is not confirmed for this building, so this step cannot be completed." });
  });

  it("needs a choice: declared and lodged, or none declared", () => {
    expect(recoveryGateProblem(RULES, atCharge(undefined))).toBe("Say whether a charge over the lot was declared and lodged.");
    expect(recoveryGateProblem(RULES, atCharge(null))).toBe("Say whether a charge over the lot was declared and lodged.");
  });

  it("none declared passes and records nothing", () => {
    expect(recoveryGateProblem(RULES, atCharge({ declared: false }))).toBeNull();
    expect(recoveryRecordsToWrite(RULES, { stepType: "STATUTORY_CHARGE", authority: null, forum: null, today: "2026-11-02", amountOwing: "1", charge: { declared: false } })).toEqual([]);
  });

  it("a declaration by a committee or general meeting motion, lodged in time, passes and records the charge with both days", () => {
    for (const r of [COMMITTEE, GENERAL]) expect(recoveryGateProblem(RULES, atCharge(declared(r, "2026-10-20", "2026-10-22")))).toBeNull();
    // Lodged the day it took effect, or today, passes too.
    expect(recoveryGateProblem(RULES, atCharge(declared(COMMITTEE, "2026-10-20", "2026-10-20")))).toBeNull();
    expect(recoveryGateProblem(RULES, atCharge(declared(COMMITTEE, "2026-10-20", "2026-11-02")))).toBeNull();
    expect(recoveryRecordsToWrite(RULES, { stepType: "STATUTORY_CHARGE", authority: null, forum: null, today: "2026-11-02", amountOwing: "1235.50", charge: declared(GENERAL, "2026-10-20", " 2026-10-22 ") })).toEqual([
      { kind: "STATUTORY_CHARGE_LODGED", decidedOn: "2026-10-20", resolutionMeetingId: "meeting-1", resolutionItemId: "item-1", resolutionKind: "GENERAL_MEETING", amount: null, forum: null, lodgedOn: "2026-10-22" },
    ]);
  });

  it("refuses the server's refusal of the motion, a kind the pack does not accept, and one not yet in effect", () => {
    const refused: ChargeChoice = { declared: true, resolution: { problem: "That motion was not carried, so it cannot be relied on." } as AuthorityFact, lodgedOn: "2026-10-22" };
    expect(recoveryGateProblem(RULES, atCharge(refused))).toBe("That motion was not carried, so it cannot be relied on.");
    expect(recoveryGateProblem(RULES, atCharge(declared(ORDINARY, "2026-10-20", "2026-10-22")))).toBe("Choose a motion carried at a committee meeting or a motion carried at a general meeting.");
    expect(recoveryGateProblem(RULES, atCharge(declared(COMMITTEE, "2026-11-03", "2026-11-03")))).toBe("That resolution has not taken effect yet, so it cannot be relied on.");
    expect(recoveryGateProblem(RULES, atCharge(declared(COMMITTEE, "not a day", "2026-10-22")))).toBe("That resolution has not taken effect yet, so it cannot be relied on.");
    expect(recoveryRecordsToWrite(RULES, { stepType: "STATUTORY_CHARGE", authority: null, forum: null, today: "2026-11-02", amountOwing: "1", charge: refused })).toEqual([]);
  });

  it("accepts a charge declared and lodged before the case was opened, and needs no opening day (review M1)", () => {
    expect(recoveryGateProblem(RULES, atCharge(declared(COMMITTEE, "2026-09-01", "2026-09-05")))).toBeNull();
    expect(recoveryGateProblem(RULES, atCharge(declared(COMMITTEE, "2026-10-20", "2026-10-22"), { caseOpenedOn: null }))).toBeNull();
    expect(recoveryRecordsToWrite(RULES, { stepType: "STATUTORY_CHARGE", authority: null, forum: null, today: "2026-11-02", amountOwing: "1", charge: declared(COMMITTEE, "2026-09-01", "2026-09-05") })).toMatchObject([
      { kind: "STATUTORY_CHARGE_LODGED", decidedOn: "2026-09-01", lodgedOn: "2026-09-05" },
    ]);
    // Still: lodged on or after the declaration, and neither after today.
    expect(recoveryGateProblem(RULES, atCharge(declared(COMMITTEE, "2026-09-01", "2026-08-31")))).toBe("It cannot have been lodged before the resolution that declared it took effect (01/09/2026).");
  });

  it("refuses a missing or unreal day lodged, one after today and one before the declaration took effect", () => {
    for (const day of [null, "", "22/10/2026", "2026-02-30"]) {
      expect(recoveryGateProblem(RULES, atCharge(declared(COMMITTEE, "2026-10-20", day))), String(day)).toBe("Enter the day it was lodged with the land registry.");
    }
    expect(recoveryGateProblem(RULES, atCharge(declared(COMMITTEE, "2026-10-20", "2026-11-03")))).toBe("The day it was lodged with the land registry cannot be after today (02/11/2026).");
    expect(recoveryGateProblem(RULES, atCharge(declared(COMMITTEE, "2026-10-20", "2026-10-19")))).toBe(
      "It cannot have been lodged before the resolution that declared it took effect (20/10/2026).",
    );
    expect(recoveryRecordsToWrite(RULES, { stepType: "STATUTORY_CHARGE", authority: null, forum: null, today: "2026-11-02", amountOwing: "1", charge: declared(COMMITTEE, "2026-10-20", null) })).toEqual([]);
  });

  it("comes after the decision to start proceedings: refused until it is recorded", () => {
    expect(recoveryGateProblem(RULES, atCharge({ declared: false }, { recorded: { authorityToSue: false, forum: null } }))).toBe(
      "Record the decision to start proceedings on the COMMITTEE_REVIEW step first.",
    );
  });
});

describe("the case's charge from its records", () => {
  it("matches by the days lodged, whatever order the rows come in or however they tie (review L2)", () => {
    const lodged = { kind: "STATUTORY_CHARGE_LODGED", lodgedOn: "2026-10-22" };
    const revoked = { kind: "STATUTORY_CHARGE_REVOKED", lodgedOn: "2026-10-30" };
    expect(chargeFacts([revoked, lodged])).toEqual(REVOKED);
    expect(chargeFacts([lodged, revoked])).toEqual(REVOKED);
    // A revocation lodged the same day as the charge revokes it.
    expect(chargeFacts([{ kind: "STATUTORY_CHARGE_REVOKED", lodgedOn: "2026-10-22" }, lodged])).toEqual({ lodgedOn: "2026-10-22", revokedOn: "2026-10-22" });
    // A later charge, listed first, is still the latest; an earlier revocation does not revoke it.
    const earlier = [{ kind: "STATUTORY_CHARGE_LODGED", lodgedOn: "2026-10-02" }, { kind: "STATUTORY_CHARGE_REVOKED", lodgedOn: "2026-10-05" }];
    expect(chargeFacts([lodged, ...earlier])).toEqual(OUTSTANDING);
    expect(chargeFacts([...earlier].reverse())).toEqual({ lodgedOn: "2026-10-02", revokedOn: "2026-10-05" });
    // A revocation with no real day revokes nothing.
    expect(chargeFacts([lodged, { kind: "STATUTORY_CHARGE_REVOKED", lodgedOn: null }])).toEqual(OUTSTANDING);
  });

  it("is the latest charge lodged and a revocation recorded after it", () => {
    expect(chargeFacts([])).toEqual(NOTHING_LODGED);
    expect(chargeFacts([{ kind: "AUTHORITY_TO_SUE", lodgedOn: null }])).toEqual(NOTHING_LODGED);
    expect(chargeFacts([{ kind: "STATUTORY_CHARGE_LODGED", lodgedOn: "2026-10-22" }])).toEqual(OUTSTANDING);
    expect(chargeFacts([{ kind: "STATUTORY_CHARGE_LODGED", lodgedOn: "2026-10-22" }, { kind: "STATUTORY_CHARGE_REVOKED", lodgedOn: "2026-10-30" }])).toEqual(REVOKED);
    // A revocation recorded before any charge revokes nothing; a charge lodged after a revocation is outstanding.
    expect(chargeFacts([{ kind: "STATUTORY_CHARGE_REVOKED", lodgedOn: "2026-10-01" }, { kind: "STATUTORY_CHARGE_LODGED", lodgedOn: "2026-10-22" }])).toEqual(OUTSTANDING);
    expect(
      chargeFacts([
        { kind: "STATUTORY_CHARGE_LODGED", lodgedOn: "2026-10-02" },
        { kind: "STATUTORY_CHARGE_REVOKED", lodgedOn: "2026-10-05" },
        { kind: "STATUTORY_CHARGE_LODGED", lodgedOn: "2026-10-22" },
      ]),
    ).toEqual(OUTSTANDING);
  });
});

describe("closing a case with a charge", () => {
  it.each(STATUSES)("a lodged charge with no revocation refuses closing (%s)", (status) => {
    const refusal = "A charge over the lot was lodged with the land registry on 22/10/2026, and its revocation is not recorded as lodged. Record the revocation before closing this case. Nothing was saved.";
    expect(recoveryGateProblem(RULES, { action: "CLOSE", ...(status ? { status } : {}), charge: OUTSTANDING })).toBe(refusal);
    expect(chargeCloseProblem(RULES, { status, charge: OUTSTANDING })).toBe(refusal);
  });

  it.each(STATUSES)("with the revocation recorded, or no charge lodged, it closes (%s)", (status) => {
    for (const c of [REVOKED, NOTHING_LODGED]) expect(recoveryGateProblem(RULES, { action: "CLOSE", ...(status ? { status } : {}), charge: c })).toBeNull();
  });

  it("the Closed step is refused too while the revocation is not recorded, and without the case's charge", () => {
    const closedStep = (chargeOnCase?: ChargeFacts) => atCharge(undefined, { stepType: "CLOSED", ...(chargeOnCase ? { chargeOnCase } : {}) });
    expect(recoveryGateProblem(RULES, closedStep(OUTSTANDING))).toMatch(/^A charge over the lot was lodged with the land registry on 22\/10\/2026, and its revocation is not recorded as lodged/);
    expect(recoveryGateProblem(RULES, closedStep())).toMatch(/^Could not check whether a charge/);
    for (const c of [REVOKED, NOTHING_LODGED]) expect(recoveryGateProblem(RULES, closedStep(c))).toBeNull();
    // Other steps do not look at the case's charge.
    expect(recoveryGateProblem(RULES, atCharge(undefined, { stepType: "ENFORCEMENT" }))).toBeNull();
  });

  it("without the case's charge it refuses: a failed read is never \"no charge\"", () => {
    expect(recoveryGateProblem(RULES, { action: "CLOSE", status: "CLOSED_PAID" })).toBe(
      "Could not check whether a charge on this case is still to be revoked, so it cannot be closed. Nothing was saved.",
    );
  });

  it("PAID_OR_SETTLED blocks paid, settled or an unknown status only, and no value blocks every closing", () => {
    const paidOrSettled = withRecovery({ statutoryCharge: charge({ closeBlockedUntilRevoked: { value: "PAID_OR_SETTLED", status: "STRATAVERZE", source: "s" } }) });
    expect(chargeCloseProblem(paidOrSettled, { status: "CLOSED_WRITTEN_OFF", charge: OUTSTANDING })).toBeNull();
    for (const status of ["CLOSED_PAID", "CLOSED_SETTLED", undefined]) expect(chargeCloseProblem(paidOrSettled, { status, charge: OUTSTANDING }), String(status)).not.toBeNull();
    const unknown = withRecovery({ statutoryCharge: charge({ closeBlockedUntilRevoked: { value: null, status: "NOT_CONFIRMED", source: "s", note: "n" } }) });
    for (const status of STATUSES) expect(chargeCloseProblem(unknown, { status, charge: OUTSTANDING }), String(status)).not.toBeNull();
  });

  it("NSW, Queensland and Western Australia have no charge: the close gate gives null before looking at anything", () => {
    const WA = PENDING_RULE_PACKS.WA.rules as unknown as Rules;
    for (const rules of [RULE_PACKS.NSW.rules, RULE_PACKS.QLD.rules, WA]) {
      expect(statutoryChargeApplies(rules)).toBe(false);
      for (const status of STATUSES) expect(chargeCloseProblem(rules, { status, charge: OUTSTANDING })).toBeNull();
      expect(chargeCloseProblem(rules, {})).toBeNull();
    }
    expect(recoveryGateProblem(WA, { action: "CLOSE" })).toBeNull();
  });
});

describe("recording the revocation", () => {
  const revoke = (charge: ChargeFacts | undefined, lodgedOn: string | null, rules: Rules = RULES) => chargeRevocationProblem(rules, { charge, lodgedOn, today: "2026-11-02" });

  it("records a revocation lodged on or after the charge and up to today", () => {
    for (const day of ["2026-10-22", "2026-10-30", "2026-11-02", " 2026-11-02 "]) expect(revoke(OUTSTANDING, day), day).toBeNull();
    expect(revocationRecord(" 2026-10-30 ")).toEqual({
      kind: "STATUTORY_CHARGE_REVOKED",
      decidedOn: "2026-10-30",
      resolutionMeetingId: null,
      resolutionItemId: null,
      resolutionKind: null,
      amount: null,
      forum: null,
      lodgedOn: "2026-10-30",
    });
  });

  it("refuses with nothing lodged, a second revocation, before the charge was lodged and after today", () => {
    expect(revoke(NOTHING_LODGED, "2026-10-30")).toBe("No charge is recorded as lodged on this case, so there is nothing to revoke. Nothing was saved.");
    expect(revoke(REVOKED, "2026-10-31")).toBe("The revocation of this charge is already recorded (lodged on 30/10/2026). Nothing was saved.");
    expect(revoke(OUTSTANDING, "2026-10-21")).toBe("The revocation cannot have been lodged before the charge was (on 22/10/2026).");
    expect(revoke(OUTSTANDING, "2026-11-03")).toBe("The day the revocation was lodged cannot be after today (02/11/2026).");
    for (const day of [null, "", "30/10/2026", "2026-02-30"]) expect(revoke(OUTSTANDING, day), String(day)).toBe("Enter the day the revocation was lodged with the land registry.");
    expect(revoke(undefined, "2026-10-30")).toBe("Could not check the charge on this case. Nothing was saved.");
  });

  it("is refused for a pack with no charge (NSW, Queensland, Western Australia)", () => {
    for (const rules of [RULE_PACKS.NSW.rules, RULE_PACKS.QLD.rules, PENDING_RULE_PACKS.WA.rules as unknown as Rules]) {
      expect(revoke(OUTSTANDING, "2026-10-30", rules)).toBe("There is no charge to revoke under this building's rules. Nothing was saved.");
    }
  });

  it("no revocation deadline (no value) never blocks it", () => {
    expect((charge().revocation as { withinDays: { value: unknown } }).withinDays.value).toBeNull();
    expect(revoke(OUTSTANDING, "2026-11-02")).toBeNull();
  });
});

describe("failing closed on the charge's shape", () => {
  it("a revocation deadline with a value is not applied yet, so every action is refused", () => {
    const rules = withRecovery({ statutoryCharge: charge({ revocation: { required: { value: true, status: "CONFIRMED", source: "s" }, withinDays: { value: 28, status: "CONFIRMED", source: "s" } } }) });
    expect(recoveryGateProblem(rules, { action: "INITIATE" })).toBe(NOT_SUPPORTED);
    expect(recoveryGateProblem(rules, { action: "CLOSE", charge: NOTHING_LODGED })).toBe(NOT_SUPPORTED);
    expect(chargeRevocationProblem(rules, { charge: OUTSTANDING, lodgedOn: "2026-10-30", today: "2026-11-02" })).toBe(NOT_SUPPORTED);
  });

  it.each([
    ["no words", { words: undefined }],
    ["another step type", { stepType: "CHARGE" }],
    ["no lodged with", { lodgedWith: 1 }],
    ["declaredBy not checked", { declaredBy: [COMMITTEE] }],
    ["declaredBy with an unknown meeting", { declaredBy: { value: [{ meeting: "OWNER", kind: "ANY", words: "x" }], status: "STRATAVERZE", source: "s" } }],
    ["no revocation", { revocation: undefined }],
    ["a revocation deadline not checked", { revocation: { required: { value: true, status: "CONFIRMED", source: "s" }, withinDays: 28 } }],
    ["an unknown close rule", { closeBlockedUntilRevoked: { value: "NEVER", status: "STRATAVERZE", source: "s" } }],
  ])("a charge not in the shared shape (%s) refuses every action", (_what, over) => {
    const rules = withRecovery({ statutoryCharge: charge(over) });
    expect(recoveryGateProblem(rules, { action: "INITIATE" })).toBe(SHAPE);
    expect(recoveryStepNeeds(rules, "STATUTORY_CHARGE")).toEqual({ problem: SHAPE });
    expect(recoveryGateProblem(rules, { action: "CLOSE", charge: NOTHING_LODGED })).toBe(SHAPE);
  });
});
