/**
 * What the adviser case page shows for a step under a draft pack's recovery
 * rules (VIC, ACT and WA stage 2, PR 9a), as plain data for the case screen:
 * the meetings and carried motions the decision to start proceedings may be
 * chosen from, the forums, the notes advisers are shown, and what the case
 * already records. Only called where recoveryGatesApply holds, so an NSW or
 * Queensland case page reads nothing more and passes nothing more.
 */
import type { StatutoryRules } from "@/config/statutory";
import { COMMITTEE_MEETING_TYPES, GENERAL_MEETING_TYPES, resolutionMeetings, type ResolutionMeeting } from "@/lib/finance/resolutions";
import { auDate } from "@/lib/onboarding/property-onboarding";
import { forumWordsFor, recoveryStepNeeds, storedResolutionKind, type DebtAuthorityResolution } from "./recovery-gates";
import { readRecoveryRecords, type RecoveryRecordRow } from "./recovery-records-repo";

/** One step's extra fields on the adviser case screen (the client's StepRequirement). */
export interface RecoveryStepRequirement {
  /** Why the step cannot be completed under the building's rules. */
  problem?: string;
  /** The decision to start proceedings: how the screens say it, and the meetings with motions it may be chosen from. */
  authority?: { words: string; meetings: { id: string; label: string; motions: { id: string; label: string }[] }[] };
  /** Where proceedings were started: the options, and the notes advisers are shown (guidance, never applied). */
  forum?: { options: { key: string; words: string }[]; notes: string[] };
  /** What the case records for this step, in words. */
  recorded?: string[];
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
  }
  if (Object.keys(out).length === 0) return null;

  // The meetings the decision may be chosen from: general meetings and/or committee meetings, with their carried motions.
  if (accepted.length > 0) {
    const general = accepted.some((a) => a.meeting === "GENERAL") ? await resolutionMeetings(schemeId, GENERAL_MEETING_TYPES) : [];
    const committee = accepted.some((a) => a.meeting === "COMMITTEE") ? await resolutionMeetings(schemeId, COMMITTEE_MEETING_TYPES) : [];
    const meetings = [...general, ...committee].map((m: ResolutionMeeting) => ({ id: m.id, label: m.label, motions: m.motions }));
    for (const r of Object.values(out)) if (r.authority) r.authority.meetings = meetings;
  }

  // What the case already records, shown on the step that recorded it.
  const records = await readRecoveryRecords(caseId);
  if (records.length > 0) {
    const authorityStep = rules.DEBT_RECOVERY?.authorityToSue?.recordedAtStep;
    const forumStep = rules.DEBT_RECOVERY?.forum?.recordedAtStep;
    for (const rec of records) {
      const step = rec.kind === "AUTHORITY_TO_SUE" ? authorityStep : rec.kind === "PROCEEDINGS_STARTED" ? forumStep : undefined;
      if (!step) continue;
      out[step] = { ...out[step], recorded: [...(out[step]?.recorded ?? []), recordWords(rules, rec)] };
    }
  }
  return out;
}

function recordWords(rules: StatutoryRules, rec: RecoveryRecordRow): string {
  if (rec.kind === "PROCEEDINGS_STARTED") return `Proceedings started in ${forumWordsFor(rules, rec.forum ?? "")} (recorded ${auDate(rec.decidedOn)}).`;
  // The pack's words for the kind of resolution recorded ("a motion carried at a council meeting").
  const how = (rules.DEBT_RECOVERY?.authorityToSue?.accepted.value ?? []).find((a) => storedResolutionKind(a) === rec.resolutionKind)?.words ?? "a resolution";
  return `Decided to start proceedings by ${how}, which took effect on ${auDate(rec.decidedOn)}, for ${money(rec.amount)} owing.`;
}
