"use server";

import { redirect } from "next/navigation";
import { isTimeZone, localToInstant } from "@/lib/jurisdiction/time-zone";
import { timeZoneOf } from "@/lib/jurisdiction/scheme-time";
import { revalidatePath } from "next/cache";
import { AuthorisationError } from "@/lib/auth/require-membership";
import { requireSchemeAccess } from "@/lib/auth/require-access";
import { assertBelongsTo, assertInScheme, assertOneOf } from "@/lib/auth/scheme-scope";
import {
  getMeetingById,
  updateMeetingWhileStatus,
  deleteMeeting,
} from "@/lib/queries/meetings";
import { canEditDetails } from "@/lib/meetings/lifecycle";
import { db } from "@/prisma/db";
import { recordMeetingEvent } from "@/lib/meetings/events";
import {
  createMotion,
  updateMotion,
  deleteMotion,
  getMotionById,
  MOTION_STATUSES,
} from "@/lib/queries/motions";
import { logActivity } from "@/lib/queries/activity-log";
import {
  getSchemeNameById,
  getMemberEmailsForScheme,
  getSchemeById,
} from "@/lib/queries/schemes";
import { notifyMeetingScheduled } from "@/lib/notifications";
import { getActiveRuleSet } from "@/lib/meetings/rule-set-repo";
import {
  validateMeetingSetup,
  createMeetingWithRuleSnapshot,
  type MeetingSetupInput,
} from "@/lib/meetings/setup";

const BEFORE_NOTICE = ["DRAFT", "SCHEDULED"] as const;
/** Details can change before notice, and while adjourned (a new time and place before the notice is issued again). */
const EDITABLE = ["DRAFT", "SCHEDULED", "ADJOURNED"] as const;
const NOTICE_OUT = "The notice for this meeting has been issued, so its details can no longer be changed here.";

/** The meeting's status moved on while the change was being made: nothing is written. */
class StatusMovedOn extends Error {}

export type MeetingFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

const MEETING_TYPES = ["AGM", "EGM", "SGM", "COMMITTEE", "FIRST_AGM"];
const MOTION_TYPES = ["ORDINARY", "SPECIAL", "UNANIMOUS"];

function validateMeetingForm(formData: FormData, timeZone: string) {
  const errors: Record<string, string> = {};

  const title = formData.get("title") as string | null;
  const meetingType = formData.get("meetingType") as string | null;
  const scheduledAt = formData.get("scheduledAt") as string | null;

  if (!title?.trim()) errors.title = "Title is required.";
  if (!meetingType || !MEETING_TYPES.includes(meetingType))
    errors.meetingType = "Select a valid meeting type.";
  const startsAt = scheduledAt ? localToInstant(timeZone, scheduledAt) : null;
  if (!scheduledAt) errors.scheduledAt = "Date and time is required.";
  else if (!startsAt) errors.scheduledAt = "Enter a valid date and time.";
  const endRaw = String(formData.get("endTime") ?? "").trim();
  const endsAt = endRaw ? localToInstant(timeZone, endRaw) : null;
  if (endRaw && !endsAt) errors.endTime = "Enter a valid end time.";
  else if (startsAt && endsAt && endsAt <= startsAt) errors.endTime = "The meeting must end after it starts.";

  return {
    errors,
    isValid: Object.keys(errors).length === 0,
    data: {
      title: title?.trim() ?? "",
      meetingType: meetingType ?? "AGM",
      scheduledAt: startsAt ?? "",
      // The start time is the meeting time: notices, e-voting and minutes use it.
      startTime: startsAt ?? "",
      endTime: endsAt,
      timezone: timeZone,
      // Blank clears the field (a meeting switched to virtual has no street address).
      location: (formData.get("location") as string)?.trim() || null,
      agenda: (formData.get("agenda") as string)?.trim() || null,
      format: (formData.get("format") as string)?.trim() || null,
      joinUrl: (formData.get("joinUrl") as string)?.trim() || null,
      joinDetails: (formData.get("joinDetails") as string)?.trim() || null,
    },
  };
}

/** Load a meeting and confirm it belongs to the scheme (SEC-004). */
async function meetingInScheme(schemeId: string, meetingId: string) {
  const meeting = await getMeetingById(meetingId);
  assertInScheme(meeting, schemeId, "Meeting");
  return meeting;
}

/** Load a motion and confirm it belongs to the scheme and the meeting (SEC-004). */
async function motionInMeeting(schemeId: string, meetingId: string, motionId: string) {
  const motion = await getMotionById(motionId);
  assertInScheme(motion, schemeId, "Motion");
  assertBelongsTo(motion.meetingId, meetingId, "Motion");
  return motion;
}

/**
 * A datetime-local value ("YYYY-MM-DDTHH:mm") as an instant, read in the
 * meeting's time zone. `new Date(value)` would read it in the server's time
 * zone (UTC), putting a 6 pm meeting at 5 am the next day in Sydney.
 */
function toIso(value: FormDataEntryValue | null, timeZone: string): string {
  if (!value) return "";
  return localToInstant(timeZone, String(value)) ?? "";
}

/** Why the time zone typed on the form cannot be used, or null (blank means the building's). */
function timeZoneFieldProblem(formData: FormData): string | null {
  const chosen = String(formData.get("timezone") ?? "").trim();
  return chosen && !isTimeZone(chosen) ? `${chosen} is not a time zone. Use a name such as Australia/Sydney, or leave it blank for the building's.` : null;
}

/** The meeting's time zone: the one chosen on the form if it is real, else the building's. */
function meetingTimeZone(formData: FormData, buildingTimeZone: string): string {
  const chosen = String(formData.get("timezone") ?? "").trim();
  return isTimeZone(chosen) ? chosen : buildingTimeZone;
}

export async function createMeetingAction(
  schemeId: string,
  _prev: MeetingFormState,
  formData: FormData,
): Promise<MeetingFormState> {
  try {
    const { profile } = await requireSchemeAccess(schemeId, "governance.manage");

    const scheme = await getSchemeById(schemeId);
    if (!scheme) return { error: "Scheme not found." };

    const endRaw = formData.get("endTime");
    // Times on the form are local times in the meeting's time zone (the building's unless another is chosen).
    const zoneProblem = timeZoneFieldProblem(formData);
    if (zoneProblem) return { fieldErrors: { timezone: zoneProblem } };
    const tz = meetingTimeZone(formData, timeZoneOf(scheme));
    const input: MeetingSetupInput = {
      schemeId,
      title: ((formData.get("title") as string) ?? "").trim(),
      meetingType: (formData.get("meetingType") as string) ?? "AGM",
      startTime: toIso(formData.get("scheduledAt"), tz),
      endTime: endRaw ? toIso(endRaw, tz) : null,
      timezone: tz,
      format: (formData.get("format") as string) || null,
      location: ((formData.get("location") as string) ?? "").trim() || null,
      joinUrl: ((formData.get("joinUrl") as string) ?? "").trim() || null,
      joinDetails:
        ((formData.get("joinDetails") as string) ?? "").trim() || null,
    };

    const ruleSet = await getActiveRuleSet(scheme.state);
    const { errors } = validateMeetingSetup(input, ruleSet);
    if (Object.keys(errors).length > 0) return { fieldErrors: errors };

    const meeting = await createMeetingWithRuleSnapshot(input, {
      state: scheme.state,
      actorId: profile.id,
    });

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "MEETING_SCHEDULED",
      entityType: "Meeting",
      entityId: meeting.id,
      metadata: { title: input.title, meetingType: input.meetingType },
    });

    // Send email notification to all scheme members (non-blocking)
    const schemeName = await getSchemeNameById(schemeId);
    const memberEmails = await getMemberEmailsForScheme(schemeId);

    notifyMeetingScheduled({
      recipientEmails: memberEmails,
      schemeName,
      meetingTitle: input.title,
      meetingType: input.meetingType,
      scheduledAt: new Date(input.startTime),
      timeZone: tz,
      location: input.location ?? undefined,
      meetingId: meeting.id,
    }).catch(() => {});

    revalidatePath(`/adviser/schemes/${schemeId}`);
    redirect(`/adviser/schemes/${schemeId}/meetings/${meeting.id}`);
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    if (
      err &&
      typeof err === "object" &&
      "digest" in err &&
      typeof (err as { digest: unknown }).digest === "string" &&
      (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
    ) {
      throw err;
    }
    return { error: "Failed to create meeting. Please try again." };
  }
}

export async function updateMeetingAction(
  schemeId: string,
  meetingId: string,
  _prev: MeetingFormState,
  formData: FormData,
): Promise<MeetingFormState> {
  try {
    const { profile } = await requireSchemeAccess(schemeId, "governance.manage");

    const meeting = await meetingInScheme(schemeId, meetingId);
    if (!canEditDetails(String(meeting.status))) return { error: NOTICE_OUT };
    const zoneProblem = timeZoneFieldProblem(formData);
    if (zoneProblem) return { fieldErrors: { timezone: zoneProblem } };
    // Read the form's times in the time zone chosen on the form (the meeting's, else the building's).
    const tz = meetingTimeZone(formData, isTimeZone(meeting.timezone) ? String(meeting.timezone) : timeZoneOf(await getSchemeById(schemeId)));
    const { errors, isValid, data } = validateMeetingForm(formData, tz);
    // The same place and join-link rules as when the meeting was set up.
    const scheme = await getSchemeById(schemeId);
    const setup = validateMeetingSetup(
      { schemeId, title: data.title, meetingType: data.meetingType, startTime: data.startTime, timezone: tz, format: data.format, location: data.location ?? null, joinUrl: data.joinUrl },
      await getActiveRuleSet(String(scheme?.state ?? "")),
    ).errors;
    if (setup.location) errors.location = setup.location;
    if (setup.joinUrl) errors.joinUrl = setup.joinUrl;
    if (!isValid || setup.location || setup.joinUrl) return { fieldErrors: errors };

    // Only while the details can still change: a notice already issued gives this time and place.
    try {
      await db.transaction(async (tx) => {
        const changed = await updateMeetingWhileStatus(schemeId, meetingId, EDITABLE, data, tx.orm);
        if (changed === 0) throw new StatusMovedOn();
        await recordMeetingEvent(
          { meetingId, actorId: profile.id, eventType: "MEETING_UPDATED", payload: { status: String(meeting.status), startTime: data.startTime, format: data.format, location: data.location } },
          tx.orm,
        );
      });
    } catch (err) {
      if (err instanceof StatusMovedOn) return { error: NOTICE_OUT };
      throw err;
    }
    revalidatePath(`/adviser/schemes/${schemeId}/meetings/${meetingId}`);
    return {};
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to update meeting. Please try again." };
  }
}

export async function deleteMeetingAction(
  schemeId: string,
  meetingId: string,
) {
  try {
    await requireSchemeAccess(schemeId, "governance.manage");

    await meetingInScheme(schemeId, meetingId);
    await deleteMeeting(schemeId, meetingId);
    revalidatePath(`/adviser/schemes/${schemeId}`);
    redirect(`/adviser/schemes/${schemeId}/meetings`);
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    if (
      err &&
      typeof err === "object" &&
      "digest" in err &&
      typeof (err as { digest: unknown }).digest === "string" &&
      (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
    ) {
      throw err;
    }
    return { error: "Failed to delete meeting." };
  }
}

export async function completeMeetingAction(
  schemeId: string,
  meetingId: string,
) {
  try {
    await requireSchemeAccess(schemeId, "governance.manage");

    await meetingInScheme(schemeId, meetingId);
    // Old (SCHEDULED) meetings only: a meeting run through notice, conduct and minutes finishes there.
    const changed = await updateMeetingWhileStatus(schemeId, meetingId, ["SCHEDULED"], { status: "COMPLETED" });
    if (changed === 0) return { error: "Only a scheduled meeting can be marked as completed here." };
    revalidatePath(`/adviser/schemes/${schemeId}/meetings/${meetingId}`);
    return {};
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to complete meeting." };
  }
}

export async function cancelMeetingAction(
  schemeId: string,
  meetingId: string,
) {
  try {
    const { profile } = await requireSchemeAccess(schemeId, "governance.manage");

    const meeting = await meetingInScheme(schemeId, meetingId);
    // The cancellation and its record are written together, or not at all.
    try {
      await db.transaction(async (tx) => {
        const changed = await updateMeetingWhileStatus(schemeId, meetingId, BEFORE_NOTICE, { status: "CANCELLED" }, tx.orm);
        if (changed === 0) throw new StatusMovedOn();
        await recordMeetingEvent({ meetingId, actorId: profile.id, eventType: "MEETING_CANCELLED", payload: { from: String(meeting.status) } }, tx.orm);
      });
    } catch (err) {
      if (err instanceof StatusMovedOn) return { error: "Only a meeting whose notice has not been issued can be cancelled here." };
      throw err;
    }
    revalidatePath(`/adviser/schemes/${schemeId}/meetings/${meetingId}`);
    return {};
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to cancel meeting." };
  }
}

/* ─── Motion actions ─────────────────────────────────────────────── */

export type MotionFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

export async function createMotionAction(
  schemeId: string,
  meetingId: string,
  _prev: MotionFormState,
  formData: FormData,
): Promise<MotionFormState> {
  try {
    const { profile } = await requireSchemeAccess(schemeId, "governance.manage");

    const title = (formData.get("title") as string)?.trim();
    const description = (formData.get("description") as string)?.trim();
    const motionType = formData.get("motionType") as string;

    const errors: Record<string, string> = {};
    if (!title) errors.title = "Title is required.";
    if (!description) errors.description = "Description is required.";
    if (!motionType || !MOTION_TYPES.includes(motionType))
      errors.motionType = "Select a valid motion type.";

    if (Object.keys(errors).length > 0) return { fieldErrors: errors };

    await meetingInScheme(schemeId, meetingId);
    await createMotion({
      schemeId,
      meetingId,
      raisedById: profile.id,
      title,
      description,
      motionType,
    });
    revalidatePath(`/adviser/schemes/${schemeId}/meetings/${meetingId}`);
    return {};
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to create motion. Please try again." };
  }
}

export async function updateMotionStatusAction(
  schemeId: string,
  meetingId: string,
  motionId: string,
  status: string,
  outcome?: string,
) {
  try {
    await requireSchemeAccess(schemeId, "governance.manage");

    assertOneOf(status, MOTION_STATUSES, "motion status");
    await motionInMeeting(schemeId, meetingId, motionId);
    await updateMotion(schemeId, motionId, {
      status,
      outcome: typeof outcome === "string" ? outcome.slice(0, 500) : null,
    });
    revalidatePath(`/adviser/schemes/${schemeId}/meetings/${meetingId}`);
    return {};
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to update motion." };
  }
}

export async function deleteMotionAction(
  schemeId: string,
  meetingId: string,
  motionId: string,
) {
  try {
    await requireSchemeAccess(schemeId, "governance.manage");

    await motionInMeeting(schemeId, meetingId, motionId);
    await deleteMotion(schemeId, motionId);
    revalidatePath(`/adviser/schemes/${schemeId}/meetings/${meetingId}`);
    return {};
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to delete motion." };
  }
}

// No adviser vote action: advisers do not vote on motions (security review
// H1). Owners vote per lot in the owner portal (owner/(scheme)/meetings), and
// committee members vote on committee motions in owner/(scheme)/governance.
