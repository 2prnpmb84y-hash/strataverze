/**
 * General meeting resolutions (server side): finding the carried motions a
 * decision can rely on, and checking a chosen meeting and motion.
 */
import { db } from "@/prisma/db";
import { formatDateIn, isTimeZone, storedDayIn } from "@/lib/jurisdiction/time-zone";
import { schemeTimeZone } from "@/lib/jurisdiction/scheme-time";
import { and } from "@prisma/orm-postgres/orm-client";
import { isHeldMeeting } from "@/lib/meetings/lifecycle";

export const GENERAL_MEETING_TYPES = ["AGM", "EGM", "SGM", "FIRST_AGM"];

export interface ResolutionMeeting {
  id: string;
  label: string;
  meetingType: string;
  motions: { id: string; label: string }[];
}

const carried = (a: { status: string; outcome: string | null }) => a.status === "CARRIED" || a.outcome === "RESOLVED";

/** General meetings of the scheme with their carried motions, newest first. `types` narrows to AGMs, for example. */
export async function resolutionMeetings(schemeId: string, types: string[] = GENERAL_MEETING_TYPES): Promise<ResolutionMeeting[]> {
  const meetings = await db.orm.public.Meeting
    .where((m) => and(m.schemeId.eq(schemeId), m.meetingType.in(types)))
    .orderBy((m) => m.scheduledAt.desc())
    .limit(100)
    .all();
  if (meetings.length === 0) return [];
  const tz = await schemeTimeZone(schemeId);
  const items = await db.orm.public.AgendaItem
    .where((a) => a.meetingId.in(meetings.map((m) => m.id)))
    .orderBy((a) => a.position.asc())
    .limit(5000)
    .all();
  return meetings
    .map((m) => ({
      id: m.id,
      meetingType: m.meetingType,
      // The meeting's date in its own time zone (the building's if none is recorded).
      label: `${m.title} (${formatDateIn(isTimeZone(m.timezone) ? String(m.timezone) : tz, String(m.scheduledAt))})`,
      motions: items.filter((a) => a.meetingId === m.id && carried(a)).map((a) => ({ id: a.id, label: `${a.position}. ${a.title}` })),
    }))
    .filter((m) => m.motions.length > 0);
}

/** Null when the meeting is a general meeting of the scheme and the motion was carried at it; otherwise why not. */
export async function generalMeetingResolutionProblem(
  schemeId: string,
  meetingId: string | null,
  motionId: string | null,
  types: string[] = GENERAL_MEETING_TYPES,
): Promise<string | null> {
  if (!meetingId || !motionId) return "Choose the general meeting and the motion carried at it.";
  const meeting = await db.orm.public.Meeting.where((m) => m.id.eq(meetingId)).first();
  if (!meeting || meeting.schemeId !== schemeId || !types.includes(meeting.meetingType)) {
    return types.length === 2 && types.includes("AGM") ? "Choose an annual general meeting of this scheme." : "Choose a general meeting of this scheme.";
  }
  const motion = await db.orm.public.AgendaItem.where((a) => a.id.eq(motionId)).first();
  if (!motion || motion.meetingId !== meeting.id) return "Choose a motion from that meeting.";
  if (!carried(motion)) return "That motion was not carried, so it cannot be relied on.";
  return null;
}

/** The kind of resolution a decision needs (a pack's `LateChargeResolution`): any carried motion at a general meeting, or one recorded as a category. */
export interface ResolutionKind {
  kind: "GENERAL_MEETING" | "ORDINARY" | "SPECIAL";
  /** "special resolution" */
  words: string;
}

/**
 * Null when the motion was carried at a general meeting of the scheme and,
 * for an ORDINARY or SPECIAL kind, is recorded as that category
 * (`agenda_items.resolution_category`); otherwise why not (VIC, ACT and WA
 * stage 2, PR 5). A motion with no category recorded is refused for a kind
 * that names one, rather than taken to be it.
 */
export async function resolutionOfKindProblem(schemeId: string, meetingId: string | null, motionId: string | null, kind: ResolutionKind): Promise<string | null> {
  const problem = await generalMeetingResolutionProblem(schemeId, meetingId, motionId);
  if (problem || kind.kind === "GENERAL_MEETING") return problem;
  const motion = await db.orm.public.AgendaItem.where((a) => a.id.eq(motionId!)).first();
  if (motion?.resolutionCategory !== kind.kind) return `That motion is not recorded as a ${kind.words}. Choose a motion carried as a ${kind.words}.`;
  return null;
}

/** The day a meeting was held, in its own time zone (the building's if none is recorded), or null if it is not found. */
export async function meetingDay(schemeId: string, meetingId: string): Promise<string | null> {
  const meeting = await db.orm.public.Meeting.where((m) => m.id.eq(meetingId)).first();
  if (!meeting || meeting.schemeId !== schemeId) return null;
  const tz = isTimeZone(meeting.timezone) ? String(meeting.timezone) : await schemeTimeZone(schemeId);
  return storedDayIn(tz, meeting.scheduledAt) || null;
}

/**
 * The day a resolution was decided, for a decision that relies on it (the
 * late charge waiver; VIC, ACT and WA stage 2, PR 8b-i, Matthew Wrigley's
 * decision D20 of 29 Oct 2026): where the motion was decided later (a
 * pending resolution), the day it took effect, or null while it has not; for
 * any other motion, the day its meeting was held (meetingDay). Reached only
 * from the waiver, which NSW and Queensland packs never offer.
 */
export async function resolutionDay(schemeId: string, meetingId: string, motionId: string): Promise<string | null> {
  const pending = await db.orm.public.PendingResolution.where((p) => p.agendaItemId.eq(motionId)).first();
  if (pending) {
    if (pending.schemeId !== schemeId || pending.meetingId !== meetingId) return null;
    return pending.status === "CARRIED" && pending.effectiveOn ? String(pending.effectiveOn).slice(0, 10) : null;
  }
  return meetingDay(schemeId, meetingId);
}

/** Committee meetings (the WA council, the ACT executive committee). */
export const COMMITTEE_MEETING_TYPES = ["COMMITTEE"];

/**
 * A resolution a debt recovery decision may rely on (VIC, ACT and WA stage 2,
 * PR 9a; a pack's DebtAuthorityResolution): a motion carried at a general
 * meeting or a committee meeting, of any kind or recorded as an ORDINARY or
 * SPECIAL resolution.
 */
export interface AuthorityResolutionKind {
  meeting: "GENERAL" | "COMMITTEE";
  kind: "ANY" | "ORDINARY" | "SPECIAL";
  words: string;
}

/**
 * The resolution among `accepted` that the chosen meeting and motion are, with
 * the day it took effect, or why it cannot be relied on (VIC, ACT and WA
 * stage 2, PR 9a). A general meeting's motion is checked as
 * generalMeetingResolutionProblem (any kind) or resolutionOfKindProblem (an
 * ORDINARY or SPECIAL kind) check it; a committee meeting's motion must be
 * carried at that meeting of the scheme, and only any kind is supported. The
 * day is resolutionDay's: a resolution still pending (a voting period) is
 * refused until it is carried and has taken effect. Read only for a pack with
 * DEBT_RECOVERY.authorityToSue; NSW and Queensland never reach it. The
 * meeting must not be deleted and must have been held (isHeldMeeting: under
 * way, minutes being prepared or published, or completed), so a motion of a
 * cancelled, adjourned or not yet held meeting is refused (review M1). A
 * special resolution decided later (Victoria's interim special resolution,
 * PR 9c) counts only once carried and taken effect as a special resolution,
 * on or before the building's day (interimSpecialProblem).
 */
export async function authorityResolution(
  schemeId: string,
  meetingId: string | null,
  motionId: string | null,
  accepted: readonly AuthorityResolutionKind[],
): Promise<{ problem: string } | { problem: null; resolution: AuthorityResolutionKind; decidedOn: string; meetingId: string; itemId: string }> {
  const words = accepted.map((a) => a.words).join(" or ");
  if (accepted.length === 0) return { problem: "No resolution can decide this for this building." };
  if (!meetingId || !motionId) return { problem: `Choose the meeting and the motion carried at it: ${words}.` };
  const meeting = await db.orm.public.Meeting.where((m) => m.id.eq(meetingId)).first();
  if (!meeting || meeting.schemeId !== schemeId || meeting.deletedAt) return { problem: "Choose a meeting of this scheme." };
  if (!isHeldMeeting(meeting.status)) return { problem: "That meeting has not been held, or was cancelled or adjourned, so its motions cannot be relied on." };
  const at = GENERAL_MEETING_TYPES.includes(meeting.meetingType) ? "GENERAL" : COMMITTEE_MEETING_TYPES.includes(meeting.meetingType) ? "COMMITTEE" : null;
  const candidates = accepted.filter((a) => a.meeting === at);
  if (candidates.length === 0) return { problem: `Choose ${words}.` };
  let first: string | null = null;
  for (const c of candidates) {
    let problem: string | null;
    if (c.meeting === "GENERAL") {
      problem = await generalMeetingResolutionProblem(schemeId, meetingId, motionId);
      if (problem === null && c.kind !== "ANY") {
        // As resolutionOfKindProblem checks it, with "an" before a vowel ("an ordinary resolution", PR 9b).
        const motion = await db.orm.public.AgendaItem.where((a) => a.id.eq(motionId)).first();
        const kindWords = c.words.replace(/^an? /, "");
        const article = /^[aeiou]/i.test(kindWords) ? "an" : "a";
        const category = motion?.resolutionCategory;
        // A special resolution decided later (Victoria's interim special resolution, PR 9c) counts only through its pending resolution.
        const interim = c.kind === "SPECIAL" && category === "INTERIM_SPECIAL";
        if (category !== c.kind && !interim) problem = `That motion is not recorded as ${article} ${kindWords}. Choose a motion carried as ${article} ${kindWords}.`;
        else if (c.kind === "SPECIAL") problem = await interimSpecialProblem(schemeId, motionId, interim);
      }
    } else if (c.kind !== "ANY") {
      problem = "A committee resolution of a particular kind cannot be checked yet, so it cannot be relied on.";
    } else {
      const motion = await db.orm.public.AgendaItem.where((a) => a.id.eq(motionId)).first();
      problem = !motion || motion.meetingId !== meeting.id ? "Choose a motion from that meeting." : !carried(motion) ? "That motion was not carried, so it cannot be relied on." : null;
    }
    if (problem === null) {
      const decidedOn = await resolutionDay(schemeId, meetingId, motionId);
      if (!decidedOn) return { problem: "That resolution has not taken effect yet, so it cannot be relied on." };
      return { problem: null, resolution: c, decidedOn, meetingId, itemId: motionId };
    }
    first ??= problem;
  }
  return { problem: first ?? `Choose ${words}.` };
}

/**
 * Why a motion relied on as a special resolution is refused for being decided
 * later and not yet taken effect as one (VIC stage 2, PR 9c; review L3), or
 * null. A motion with a pending resolution of any kind counts as special only
 * once that is CARRIED, takes effect as SPECIAL and took effect on or before
 * the building's day (the day of the decision). A motion recorded as an
 * interim special resolution with no pending resolution is refused. Read only
 * for a pack that accepts a special resolution for a debt recovery decision
 * (Victoria); the ACT and Western Australia accept none, and NSW and
 * Queensland never come here.
 */
async function interimSpecialProblem(schemeId: string, motionId: string, recordedInterim: boolean): Promise<string | null> {
  const pending = await db.orm.public.PendingResolution.where((p) => p.agendaItemId.eq(motionId)).first();
  const refused = "That motion was decided later and has not taken effect as a special resolution, so it cannot be relied on.";
  if (!pending) return recordedInterim ? refused : null;
  const effectiveOn = pending.effectiveOn ? String(pending.effectiveOn).slice(0, 10) : "";
  if (pending.status !== "CARRIED" || pending.takesEffectAs !== "SPECIAL" || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveOn)) return refused;
  const { schemeToday } = await import("@/lib/jurisdiction/scheme-time");
  return effectiveOn <= (await schemeToday(schemeId)) ? null : "That resolution has not taken effect yet, so it cannot be relied on.";
}

/** Null when the chosen meeting and motion are a resolution among `accepted` that has taken effect; otherwise why not. */
export async function authorityResolutionProblem(
  schemeId: string,
  meetingId: string | null,
  motionId: string | null,
  accepted: readonly AuthorityResolutionKind[],
): Promise<string | null> {
  return (await authorityResolution(schemeId, meetingId, motionId, accepted)).problem;
}
