/**
 * What the adviser case page shows for a step under a draft pack's recovery
 * rules (VIC, ACT and WA stage 2, PR 9a), as plain data for the case screen:
 * the meetings and carried motions the decision to start proceedings may be
 * chosen from, the forums, the notes advisers are shown, and what the case
 * already records, and (PR 9b) the statutory charge: what its step asks for,
 * and the panel that shows a lodged charge and records its revocation, and
 * (PR 9c) the day a final notice given outside StrataVerze was given. Only
 * called where recoveryGatesApply holds (the charge panel only where the pack
 * has a statutory charge), so an NSW or Queensland case page reads nothing
 * more and passes nothing more.
 */
import type { StatutoryRules } from "@/config/statutory";
import { COMMITTEE_MEETING_TYPES, GENERAL_MEETING_TYPES, resolutionMeetings, type ResolutionMeeting } from "@/lib/finance/resolutions";
import { auDate } from "@/lib/onboarding/property-onboarding";
import { isHeldMeeting } from "@/lib/meetings/lifecycle";
import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";
import { chargeFacts, forumWordsFor, recoveryStepNeeds, storedResolutionKind, type DebtAuthorityResolution } from "./recovery-gates";
import { readRecoveryRecords, type RecoveryRecordRow } from "./recovery-records-repo";

/** One step's extra fields on the adviser case screen (the client's StepRequirement). */
export interface RecoveryStepRequirement {
  /** Why the step cannot be completed under the building's rules. */
  problem?: string;
  /** The decision to start proceedings: how the screens say it, and the meetings with motions it may be chosen from. */
  authority?: { words: string; meetings: { id: string; label: string; motions: { id: string; label: string }[] }[] };
  /** Where proceedings were started: the options, and the notes advisers are shown (guidance, never applied). */
  forum?: { options: { key: string; words: string }[]; notes: string[] };
  /**
   * The statutory charge (PR 9b): how the screens name it, who may declare it, where it is lodged, the
   * building's day (the latest day lodged that may be entered) and the meetings with motions the declaration
   * may be chosen from.
   */
  charge?: { words: string; declaredWords: string; lodgedWith: string; today: string; meetings: { id: string; label: string; motions: { id: string; label: string }[] }[] };
  /**
   * The final notice given outside StrataVerze (PR 9c), only where the pack lets one be recorded: how the screens name
   * it and the building's day (the latest day given that may be entered).
   */
  finalNotice?: { words: string; today: string };
  /** What the case records for this step, in words. */
  recorded?: string[];
}

/**
 * The case's lodged statutory charge (PR 9b), for the adviser case page: its
 * name, what is recorded, and, while its revocation is not recorded, where the
 * revocation is lodged and the building's day (the latest day that may be
 * entered).
 */
export interface RecoveryChargePanel {
  title: string;
  lines: string[];
  revocation: { lodgedWith: string; today: string } | null;
}

const money = (v: string | null) =>
  v == null ? "" : new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(Number(v));

/** The steps' extra fields, by step type, or null where no step has any. */
export async function recoveryStepRequirements(
  schemeId: string,
  rules: StatutoryRules,
  caseId: string,
  stepTypes: readonly string[],
): Promise<Record<string, RecoveryStepRequirement> | null> {
  const out: Record<string, RecoveryStepRequirement> = {};
  const accepted: DebtAuthorityResolution[] = [];
  for (const t of stepTypes) {
    const needs = recoveryStepNeeds(rules, t);
    if (!needs) continue;
    if ("problem" in needs) {
      out[t] = { problem: needs.problem };
      continue;
    }
    if (needs.authority) {
      accepted.push(...needs.authority.accepted);
      out[t] = { ...out[t], authority: { words: needs.authority.words, meetings: [] } };
    }
    if (needs.forum) out[t] = { ...out[t], forum: { options: [...needs.forum.options], notes: [...needs.forum.notes] } };
    if (needs.charge) {
      accepted.push(...needs.charge.declaredBy);
      const { schemeToday } = await import("@/lib/jurisdiction/scheme-time");
      const today = await schemeToday(schemeId);
      out[t] = { ...out[t], charge: { words: needs.charge.words, declaredWords: needs.charge.declaredWords, lodgedWith: needs.charge.lodgedWith, today, meetings: [] } };
    }
    if (needs.finalNotice) {
      const { schemeToday } = await import("@/lib/jurisdiction/scheme-time");
      out[t] = { ...out[t], finalNotice: { words: needs.finalNotice.words, today: await schemeToday(schemeId) } };
    }
  }
  if (Object.keys(out).length === 0) return null;

  // The meetings the decision may be chosen from: general meetings and/or committee meetings, with their carried motions.
  if (accepted.length > 0) {
    const general = accepted.some((a) => a.meeting === "GENERAL") ? await resolutionMeetings(schemeId, GENERAL_MEETING_TYPES) : [];
    const committee = accepted.some((a) => a.meeting === "COMMITTEE") ? await resolutionMeetings(schemeId, COMMITTEE_MEETING_TYPES) : [];
    // Only meetings that were held and not deleted (as authorityResolution checks; review M1).
    const listed = [...general, ...committee];
    const rows = listed.length
      ? await db.orm.public.Meeting.where((m) => and(m.schemeId.eq(schemeId), m.id.in(listed.map((x) => x.id)))).limit(listed.length).all()
      : [];
    const held = new Set(rows.filter((m) => !m.deletedAt && isHeldMeeting(m.status)).map((m) => m.id));
    const meetings = listed.filter((m) => held.has(m.id)).map((m: ResolutionMeeting) => ({ id: m.id, label: m.label, motions: m.motions }));
    for (const r of Object.values(out)) {
      if (r.authority) r.authority.meetings = meetings;
      if (r.charge) r.charge.meetings = meetings;
    }
  }

  // What the case already records, shown on the step that recorded it.
  const records = await readRecoveryRecords(caseId);
  if (records.length > 0) {
    const authorityStep = rules.DEBT_RECOVERY?.authorityToSue?.recordedAtStep;
    const forumStep = rules.DEBT_RECOVERY?.forum?.recordedAtStep;
    const chargeStep = rules.DEBT_RECOVERY?.statutoryCharge?.stepType;
    const finalNoticeStep = rules.DEBT_RECOVERY?.finalNotice?.stepType;
    for (const rec of records) {
      const step =
        rec.kind === "AUTHORITY_TO_SUE"
          ? authorityStep
          : rec.kind === "PROCEEDINGS_STARTED"
            ? forumStep
            : rec.kind === "STATUTORY_CHARGE_LODGED" || rec.kind === "STATUTORY_CHARGE_REVOKED"
              ? chargeStep
              : rec.kind === "FINAL_NOTICE_GIVEN"
                ? finalNoticeStep
                : undefined;
      if (!step) continue;
      out[step] = { ...out[step], recorded: [...(out[step]?.recorded ?? []), recordWords(rules, rec)] };
    }
  }
  return out;
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function recordWords(rules: StatutoryRules, rec: RecoveryRecordRow): string {
  if (rec.kind === "PROCEEDINGS_STARTED") return `Proceedings started in ${forumWordsFor(rules, rec.forum ?? "")} (recorded ${auDate(rec.decidedOn)}).`;
  const charge = rules.DEBT_RECOVERY?.statutoryCharge;
  if (rec.kind === "STATUTORY_CHARGE_REVOKED") return `Its revocation was lodged on ${auDate(rec.lodgedOn ?? "")}.`;
  if (rec.kind === "FINAL_NOTICE_GIVEN") return `${capitalise(rules.DEBT_RECOVERY?.finalNotice?.words ?? "the final notice")} was given on ${auDate(rec.decidedOn)}, outside StrataVerze.`;
  if (rec.kind === "STATUTORY_CHARGE_LODGED" && charge) {
    const how = (charge.declaredBy.value ?? []).find((a) => storedResolutionKind(a) === rec.resolutionKind)?.words ?? "a resolution";
    return `${capitalise(charge.words)} declared by ${how}, which took effect on ${auDate(rec.decidedOn)}, and lodged with ${charge.lodgedWith} on ${auDate(rec.lodgedOn ?? "")}.`;
  }
  // The pack's words for the kind of resolution recorded ("a motion carried at a council meeting").
  const how = (rules.DEBT_RECOVERY?.authorityToSue?.accepted.value ?? []).find((a) => storedResolutionKind(a) === rec.resolutionKind)?.words ?? "a resolution";
  return `Decided to start proceedings by ${how}, which took effect on ${auDate(rec.decidedOn)}, for ${money(rec.amount)} owing.`;
}

/**
 * The case's lodged statutory charge for the adviser case page (PR 9b), or
 * null where the pack has no statutory charge (nothing is read: NSW,
 * Queensland and Western Australia) or the case has no charge lodged. While
 * its revocation is not recorded, the panel offers to record it.
 */
export async function recoveryChargePanel(schemeId: string, rules: StatutoryRules, caseId: string): Promise<RecoveryChargePanel | null> {
  const charge = rules.DEBT_RECOVERY?.statutoryCharge;
  if (!charge) return null;
  const { lodgedOn, revokedOn } = chargeFacts(await readRecoveryRecords(caseId));
  if (lodgedOn == null) return null;
  const title = rules.DEBT_RECOVERY_STEP_LABELS?.[charge.stepType] ?? capitalise(charge.words);
  const lines = [`${capitalise(charge.words)} was lodged with ${charge.lodgedWith} on ${auDate(lodgedOn)}.`];
  if (revokedOn != null) {
    lines.push(`Its revocation was lodged on ${auDate(revokedOn)}.`);
    return { title, lines, revocation: null };
  }
  const blocks = charge.closeBlockedUntilRevoked.value;
  lines.push(
    blocks === "PAID_OR_SETTLED"
      ? "Its revocation is not recorded yet. The case cannot be closed as paid or settled until it is."
      : "Its revocation is not recorded yet. The case cannot be closed until it is.",
  );
  const { schemeToday } = await import("@/lib/jurisdiction/scheme-time");
  return { title, lines, revocation: { lodgedWith: charge.lodgedWith, today: await schemeToday(schemeId) } };
}
