/**
 * The draft packs' debt recovery gates (VIC, ACT and WA stage 2, PR 9a), with
 * fixtures and the Western Australian pack. NSW and Queensland get null from
 * every gate; every refusal path fails closed.
 */
import { describe, expect, it } from "vitest";
import { PENDING_RULE_PACKS, RULE_PACKS, type StatutoryRules } from "@/config/statutory";
import {
  authorityWords,
  forumWordsFor,
  recoveryGateProblem,
  recoveryGatesApply,
  recoveryRecordsToWrite,
  recoveryStepNeeds,
  storedResolutionKind,
  type AuthorityFact,
  type DebtAuthorityResolution,
  type RecoveryGateInput,
} from "./recovery-gates";

type Rules = Pick<StatutoryRules, "DEBT_RECOVERY">;
const NSW = RULE_PACKS.NSW.rules;
const QLD = RULE_PACKS.QLD.rules;
const WA = PENDING_RULE_PACKS.WA.rules as unknown as Rules & Pick<StatutoryRules, "DEBT_RECOVERY_STEPS" | "DEBT_RECOVERY_STEP_LABELS">;
const WA_STEPS = WA.DEBT_RECOVERY_STEPS!.map((s) => ({ stepType: s.stepType, stepOrder: s.stepOrder }));
const LABELS = WA.DEBT_RECOVERY_STEP_LABELS;

const COUNCIL: DebtAuthorityResolution = { meeting: "COMMITTEE", kind: "ANY", words: "a motion carried at a council meeting" };
const GENERAL: DebtAuthorityResolution = { meeting: "GENERAL", kind: "ANY", words: "a motion carried at a general meeting" };
const carried = (resolution: DebtAuthorityResolution, decidedOn = "2026-10-20"): AuthorityFact => ({ problem: null, resolution, decidedOn, meetingId: "meeting-1", itemId: "item-1" });
const NOTHING = { authorityToSue: false, forum: null };
const AUTHORISED = { authorityToSue: true, forum: null };

const complete = (stepType: string, over: Partial<Extract<RecoveryGateInput, { action: "COMPLETE_STEP" }>> = {}): RecoveryGateInput => ({
  action: "COMPLETE_STEP",
  stepType,
  caseSteps: WA_STEPS,
  authority: null,
  forum: null,
  recorded: NOTHING,
  today: "2026-11-02",
  caseOpenedOn: "2026-10-01",
  labels: LABELS,
  ...over,
});

/** A fixture pack with only the given DEBT_RECOVERY keys, beside a source. */
const withRecovery = (extra: Record<string, unknown>): Rules => ({ DEBT_RECOVERY: { source: "fixture", ...extra } as unknown as Rules["DEBT_RECOVERY"] });
const WA_RULES = WA.DEBT_RECOVERY!;

describe("NSW and Queensland: no gates", () => {
  const inputs: RecoveryGateInput[] = [
    { action: "INITIATE" },
    { action: "CLOSE" },
    { action: "REFER_LEGAL", recorded: NOTHING },
    ...["LEDGER_VERIFICATION", "COMMITTEE_REVIEW", "LEGAL_REFERRAL", "PROCEEDINGS", "CLOSED"].map((t) => complete(t, { forum: "SAT" })),
  ];

  it.each([
    ["NSW", NSW],
    ["QLD", QLD],
  ] as const)("%s: the gates do not apply, and every gate gives null", (_st, rules) => {
    expect(recoveryGatesApply(rules)).toBe(false);
    for (const input of inputs) expect(recoveryGateProblem(rules, input)).toBeNull();
    for (const s of rules.DEBT_RECOVERY_STEPS ?? []) expect(recoveryStepNeeds(rules, s.stepType)).toBeNull();
    expect(recoveryRecordsToWrite(rules, { stepType: "COMMITTEE_REVIEW", authority: carried(COUNCIL), forum: "COURT", today: "2026-11-02", amountOwing: "1" })).toEqual([]);
  });

  it("a pack with DEBT_RECOVERY but none of the gate keys (Queensland's 2 year rule) has no gates", () => {
    expect(QLD.DEBT_RECOVERY).toBeDefined();
    expect(recoveryGatesApply({ DEBT_RECOVERY: undefined })).toBe(false);
  });
});

describe("Western Australia", () => {
  it("has the gates, and opening a case and closing it pass", () => {
    expect(recoveryGatesApply(WA)).toBe(true);
    expect(recoveryGateProblem(WA, { action: "INITIATE" })).toBeNull();
    expect(recoveryGateProblem(WA, { action: "CLOSE" })).toBeNull();
  });

  it("asks for the council or general meeting decision at COMMITTEE_REVIEW and the forum at PROCEEDINGS, nothing elsewhere", () => {
    expect(recoveryStepNeeds(WA, "COMMITTEE_REVIEW")).toEqual({
      authority: { accepted: [COUNCIL, GENERAL], words: "a motion carried at a council meeting or a motion carried at a general meeting" },
      forum: null,
    });
    const proceedings = recoveryStepNeeds(WA, "PROCEEDINGS");
    expect(proceedings).toMatchObject({ authority: null, forum: { options: [{ key: "COURT", words: "a court of competent jurisdiction" }] } });
    const notes = (proceedings as unknown as { forum: { notes: string[] } }).forum.notes;
    // The limits and SAT are notes for advisers: guidance never applied, and where proceedings may not go.
    expect(notes[0]).toMatch(/^Guidance, not confirmed, never applied: .*Magistrates Court.*\$75,000/);
    expect(notes[1]).toBe("Not the State Administrative Tribunal (SAT): a dispute about an amount owed as a debt is not a scheme dispute (STA s 197(3)(f)).");
    for (const t of ["LEDGER_VERIFICATION", "INITIAL_CONTACT", "REMINDER_NOTICE", "FINAL_NOTICE", "HARDSHIP_REVIEW", "LEGAL_REFERRAL", "ENFORCEMENT", "CLOSED"]) {
      expect(recoveryStepNeeds(WA, t), t).toBeNull();
    }
  });

  it("the steps before the decision pass with nothing recorded", () => {
    for (const t of ["LEDGER_VERIFICATION", "INITIAL_CONTACT", "REMINDER_NOTICE", "FINAL_NOTICE", "HARDSHIP_REVIEW"]) expect(recoveryGateProblem(WA, complete(t)), t).toBeNull();
  });

  it("the strata manager alone is refused: COMMITTEE_REVIEW needs the meeting and the motion", () => {
    expect(recoveryGateProblem(WA, complete("COMMITTEE_REVIEW"))).toBe(
      "Choose the meeting and the motion that decided to start proceedings: a motion carried at a council meeting or a motion carried at a general meeting.",
    );
  });

  it("a council motion or a general meeting motion is accepted, and recorded with the amount owing", () => {
    for (const r of [COUNCIL, GENERAL]) {
      expect(recoveryGateProblem(WA, complete("COMMITTEE_REVIEW", { authority: carried(r) }))).toBeNull();
    }
    expect(recoveryRecordsToWrite(WA, { stepType: "COMMITTEE_REVIEW", authority: carried(COUNCIL), forum: null, today: "2026-11-02", amountOwing: "1235.50" })).toEqual([
      { kind: "AUTHORITY_TO_SUE", decidedOn: "2026-10-20", resolutionMeetingId: "meeting-1", resolutionItemId: "item-1", resolutionKind: "COMMITTEE", amount: "1235.50", forum: null },
    ]);
  });

  it("the server's refusal of the chosen motion is passed on, and a kind the pack does not accept is refused", () => {
    expect(recoveryGateProblem(WA, complete("COMMITTEE_REVIEW", { authority: { problem: "That motion was not carried, so it cannot be relied on." } }))).toBe(
      "That motion was not carried, so it cannot be relied on.",
    );
    const special: DebtAuthorityResolution = { meeting: "GENERAL", kind: "SPECIAL", words: "a special resolution" };
    expect(recoveryGateProblem(WA, complete("COMMITTEE_REVIEW", { authority: carried(special) }))).toBe(
      "Choose a motion carried at a council meeting or a motion carried at a general meeting.",
    );
  });

  it("a resolution that takes effect after the building's day is refused", () => {
    expect(recoveryGateProblem(WA, complete("COMMITTEE_REVIEW", { authority: carried(GENERAL, "2026-11-03") }))).toBe("That resolution has not taken effect yet, so it cannot be relied on.");
    expect(recoveryGateProblem(WA, complete("COMMITTEE_REVIEW", { authority: carried(GENERAL, "2026-11-02") }))).toBeNull();
    expect(recoveryGateProblem(WA, complete("COMMITTEE_REVIEW", { authority: carried(GENERAL, "not a day") }))).toBe("That resolution has not taken effect yet, so it cannot be relied on.");
  });

  it("a resolution that took effect before the case was opened is refused, and an unknown opening day refuses (review L4)", () => {
    expect(recoveryGateProblem(WA, complete("COMMITTEE_REVIEW", { authority: carried(GENERAL, "2026-09-30") }))).toBe(
      "That resolution took effect before this case was opened, so it cannot be relied on for it. Choose the motion that decided to start proceedings for this case.",
    );
    expect(recoveryGateProblem(WA, complete("COMMITTEE_REVIEW", { authority: carried(GENERAL, "2026-10-01") }))).toBeNull();
    expect(recoveryGateProblem(WA, complete("COMMITTEE_REVIEW", { authority: carried(GENERAL), caseOpenedOn: null }))).toBe(
      "The day this case was opened is not known, so no resolution can be checked against it.",
    );
    // A step that records no decision does not need the opening day.
    expect(recoveryGateProblem(WA, complete("LEDGER_VERIFICATION", { caseOpenedOn: null }))).toBeNull();
  });

  it("every step after the decision needs it recorded: the legal referral, proceedings, enforcement and closing", () => {
    for (const t of ["LEGAL_REFERRAL", "PROCEEDINGS", "ENFORCEMENT", "CLOSED"]) {
      expect(recoveryGateProblem(WA, complete(t, { forum: "COURT" })), t).toBe("Record the decision to start proceedings on the Decision to Start Proceedings step first.");
    }
    expect(recoveryGateProblem(WA, complete("LEGAL_REFERRAL", { recorded: AUTHORISED }))).toBeNull();
    // A step the case does not have is refused.
    expect(recoveryGateProblem(WA, complete("STATUTORY_CHARGE", { recorded: AUTHORISED }))).toBe("Record the decision to start proceedings on the Decision to Start Proceedings step first.");
  });

  it("the forum: a court is recorded, SAT is refused with the pack's reason, anything else is refused", () => {
    expect(recoveryGateProblem(WA, complete("PROCEEDINGS", { recorded: AUTHORISED, forum: "COURT" }))).toBeNull();
    expect(recoveryGateProblem(WA, complete("PROCEEDINGS", { recorded: AUTHORISED, forum: "SAT" }))).toBe(
      "The State Administrative Tribunal (SAT) cannot hear this claim: a dispute about an amount owed as a debt is not a scheme dispute (STA s 197(3)(f)).",
    );
    for (const forum of [null, "", "VCAT", "ACAT", "court"]) {
      expect(recoveryGateProblem(WA, complete("PROCEEDINGS", { recorded: AUTHORISED, forum })), String(forum)).toBe("Choose where proceedings were started: a court of competent jurisdiction.");
    }
    expect(recoveryRecordsToWrite(WA, { stepType: "PROCEEDINGS", authority: null, forum: "COURT", today: "2026-11-02", amountOwing: "1" })).toEqual([
      { kind: "PROCEEDINGS_STARTED", decidedOn: "2026-11-02", resolutionMeetingId: null, resolutionItemId: null, resolutionKind: null, amount: null, forum: "COURT" },
    ]);
    expect(forumWordsFor(WA, "COURT")).toBe("a court of competent jurisdiction");
  });

  it("marking the case as referred for legal recovery needs the decision recorded", () => {
    expect(recoveryGateProblem(WA, { action: "REFER_LEGAL", recorded: NOTHING, labels: LABELS })).toBe(
      "Record the decision to start proceedings on the Decision to Start Proceedings step before referring this case for legal recovery.",
    );
    expect(recoveryGateProblem(WA, { action: "REFER_LEGAL", recorded: AUTHORISED })).toBeNull();
  });
});

describe("failing closed", () => {
  const authority = (accepted: unknown, extra: Record<string, unknown> = {}) => ({
    recordedAtStep: "COMMITTEE_REVIEW",
    accepted,
    managerMayDecide: { value: false, status: "CONFIRMED", source: "s" },
    source: "s",
    status: "STRATAVERZE",
    ...extra,
  });

  it("who may decide with no value refuses the decision step, with the pack's note, and every referral", () => {
    const rules = withRecovery({ authorityToSue: authority({ value: null, status: "NOT_CONFIRMED", source: "s", note: "The notes do not say who decides." }) });
    expect(recoveryGateProblem(rules, { action: "INITIATE" })).toBeNull();
    const refusal = "Who may decide to start proceedings is not confirmed for this building, so this step cannot be completed. The notes do not say who decides.";
    expect(recoveryStepNeeds(rules, "COMMITTEE_REVIEW")).toEqual({ problem: refusal });
    expect(recoveryGateProblem(rules, complete("COMMITTEE_REVIEW", { authority: carried(GENERAL) }))).toBe(refusal);
    expect(recoveryGateProblem(rules, { action: "REFER_LEGAL", recorded: NOTHING, labels: LABELS })).toMatch(/^Record the decision to start proceedings/);
    // An empty list is refused too.
    expect(recoveryStepNeeds(withRecovery({ authorityToSue: authority({ value: [], status: "STRATAVERZE", source: "s" }) }), "COMMITTEE_REVIEW")).toMatchObject({ problem: expect.stringMatching(/not confirmed/) });
  });

  // statutoryCharge is applied since PR 9b (recovery-gates.charge.test.ts), and stepTiming, finalNotice, appliesWhen and
  // the amount threshold since PR 9c (recovery-gates.vic.test.ts): a value not in their shape refuses every action.
  it.each(["stepTiming", "finalNotice", "appliesWhen"])("a key not in its shape (%s) refuses every action", (key) => {
    const rules = withRecovery({ [key]: { anything: true } });
    expect(recoveryGatesApply(rules)).toBe(true);
    const refusal = "This building's debt recovery rules are not in the shape StrataVerze applies, so this is refused. Nothing was saved.";
    for (const input of [{ action: "INITIATE" } as const, { action: "CLOSE" } as const, { action: "REFER_LEGAL", recorded: AUTHORISED } as const, complete("LEDGER_VERIFICATION")]) {
      expect(recoveryGateProblem(rules, input)).toBe(refusal);
    }
    expect(recoveryStepNeeds(rules, "LEDGER_VERIFICATION")).toEqual({ problem: refusal });
  });

  it("an amount threshold not in its shape refuses", () => {
    const rules = withRecovery({ authorityToSue: authority({ value: [GENERAL], status: "STRATAVERZE", source: "s" }, { amountThreshold: { multiple: 2 } }) });
    expect(recoveryGateProblem(rules, { action: "INITIATE" })).toMatch(/not in the shape/);
  });

  it("a key written as undefined, or not in the shared shape (such as the ACT pack's own forum and charge fields before PR 9b), refuses", () => {
    const shape = "This building's debt recovery rules are not in the shape StrataVerze applies, so this is refused. Nothing was saved.";
    expect(recoveryGateProblem(withRecovery({ forum: undefined }), { action: "INITIATE" })).toBe(shape);
    expect(recoveryGateProblem(withRecovery({ forum: { tribunal: "ACAT", status: "GUIDANCE" } }), { action: "INITIATE" })).toBe(shape);
    expect(recoveryGateProblem(withRecovery({ authorityToSue: authority({ value: [{ meeting: "OWNER", kind: "ANY", words: "x" }], status: "STRATAVERZE", source: "s" }) }), { action: "INITIATE" })).toBe(shape);
    expect(recoveryGateProblem(withRecovery({ authorityToSue: { recordedAtStep: "X" } }), { action: "INITIATE" })).toBe(shape);
    // The ACT pack's DEBT_RECOVERY before PR 9b (its own forum and charge fields): every gate refused it.
    expect(recoveryGateProblem(withRecovery({ statutoryCharge: { available: true, securesInterest: true, powerOfSale: false, revokeAndLodgeWhenPaid: true } }), { action: "INITIATE" })).toBe(shape);
    // Since PR 9b the ACT pack's DEBT_RECOVERY is in the shared shape, so opening a case passes.
    const act = PENDING_RULE_PACKS.ACT.rules as unknown as Rules;
    expect(recoveryGatesApply(act)).toBe(true);
    expect(recoveryGateProblem(act, { action: "INITIATE" })).toBeNull();
  });

  it("a forum option that is only guidance is shown as a note and cannot be recorded", () => {
    const forum = (status: string) => ({
      recordedAtStep: "PROCEEDINGS",
      options: [{ key: "ACAT", words: "ACAT", status, limitCents: null, source: "s" }],
      excluded: [],
      source: "s",
    });
    expect(recoveryStepNeeds(withRecovery({ forum: forum("GUIDANCE") }), "PROCEEDINGS")).toEqual({
      problem: "Where proceedings may be brought is not confirmed for this building, so this step cannot be completed.",
    });
    const mixed = withRecovery({
      forum: { ...forum("CONFIRMED"), options: [{ key: "COURT", words: "a court", status: "CONFIRMED", limitCents: null, source: "s" }, { key: "ACAT", words: "ACAT", status: "GUIDANCE", limitCents: null, source: "s" }] },
    });
    expect(recoveryStepNeeds(mixed, "PROCEEDINGS")).toEqual({ authority: null, forum: { options: [{ key: "COURT", words: "a court" }], notes: ["Guidance, not confirmed: ACAT."] } });
    expect(recoveryGateProblem(mixed, complete("PROCEEDINGS", { forum: "ACAT" }))).toBe("Choose where proceedings were started: a court.");
    // A limit is never applied: a confirmed limit is not even shown.
    const limited = withRecovery({ forum: { ...forum("CONFIRMED"), options: [{ key: "COURT", words: "a court", status: "CONFIRMED", limitCents: { value: 100, status: "CONFIRMED", source: "s" }, source: "s" }] } });
    expect(recoveryStepNeeds(limited, "PROCEEDINGS")).toEqual({ authority: null, forum: { options: [{ key: "COURT", words: "a court" }], notes: [] } });
  });

  it("an ACT-style committee authority: a committee motion is accepted where the pack lists it", () => {
    const rules = withRecovery({ authorityToSue: authority({ value: [{ meeting: "COMMITTEE", kind: "ANY", words: "a motion carried at an executive committee meeting" }], status: "CONFIRMED", source: "s" }) });
    expect(recoveryGateProblem(rules, complete("COMMITTEE_REVIEW", { authority: carried({ meeting: "COMMITTEE", kind: "ANY", words: "x" }) }))).toBeNull();
    // A VIC-style pack that accepts only a special resolution at a general meeting refuses a committee motion.
    const vic = withRecovery({ authorityToSue: authority({ value: [{ meeting: "GENERAL", kind: "SPECIAL", words: "a special resolution" }], status: "CONFIRMED", source: "s" }) });
    expect(recoveryGateProblem(vic, complete("COMMITTEE_REVIEW", { authority: carried(COUNCIL) }))).toBe("Choose a special resolution.");
    expect(recoveryGateProblem(vic, complete("COMMITTEE_REVIEW", { authority: carried({ meeting: "GENERAL", kind: "SPECIAL", words: "x" }) }))).toBeNull();
  });
});

describe("helpers", () => {
  it("store the kind of resolution as the database allows", () => {
    expect(storedResolutionKind(COUNCIL)).toBe("COMMITTEE");
    expect(storedResolutionKind(GENERAL)).toBe("GENERAL_MEETING");
    expect(storedResolutionKind({ meeting: "GENERAL", kind: "SPECIAL", words: "" })).toBe("SPECIAL");
    expect(storedResolutionKind({ meeting: "GENERAL", kind: "ORDINARY", words: "" })).toBe("ORDINARY");
    expect(authorityWords([COUNCIL])).toBe("a motion carried at a council meeting");
  });

  it("the WA pack's rules are the ones tested here", () => {
    expect(WA_RULES.authorityToSue?.recordedAtStep).toBe("COMMITTEE_REVIEW");
    expect(WA_RULES.forum?.recordedAtStep).toBe("PROCEEDINGS");
  });
});
