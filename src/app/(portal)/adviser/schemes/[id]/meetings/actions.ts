"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { AuthorisationError } from "@/lib/auth/require-membership";
import { requireSchemeAccess } from "@/lib/auth/require-access";
import { assertBelongsTo, assertInScheme, assertOneOf } from "@/lib/auth/scheme-scope";
import {
  getMeetingById,
  updateMeeting,
  deleteMeeting,
} from "@/lib/queries/meetings";
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
  DEFAULT_TIMEZONE,
  type MeetingSetupInput,
} from "@/lib/meetings/setup";

export type MeetingFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

const MEETING_TYPES = ["AGM", "EGM", "SGM", "COMMITTEE", "FIRST_AGM"];
const MOTION_TYPES = ["ORDINARY", "SPECIAL", "UNANIMOUS"];

function validateMeetingForm(formData: FormData) {
  const errors: Record<string, string> = {};

  const title = formData.get("title") as string | null;
  const meetingType = formData.get("meetingType") as string | null;
  const scheduledAt = formData.get("scheduledAt") as string | null;

  if (!title?.trim()) errors.title = "Title is required.";
  if (!meetingType || !MEETING_TYPES.includes(meetingType))
    errors.meetingType = "Select a valid meeting type.";
  if (!scheduledAt) errors.scheduledAt = "Date and time is required.";

  return {
    errors,
    isValid: Object.keys(errors).length === 0,
    data: {
      title: title?.trim() ?? "",
      meetingType: meetingType ?? "AGM",
      scheduledAt: new Date(scheduledAt ?? "").toISOString(),
      location: (formData.get("location") as string)?.trim() || undefined,
      agenda: (formData.get("agenda") as string)?.trim() || undefined,
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

function toIso(value: FormDataEntryValue | null): string {
  if (!value) return "";
  const d = new Date(value as string);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
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
    const input: MeetingSetupInput = {
      schemeId,
      title: ((formData.get("title") as string) ?? "").trim(),
      meetingType: (formData.get("meetingType") as string) ?? "AGM",
      startTime: toIso(formData.get("scheduledAt")),
      endTime: endRaw ? toIso(endRaw) : null,
      timezone: (formData.get("timezone") as string) || DEFAULT_TIMEZONE,
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
    await requireSchemeAccess(schemeId, "governance.manage");

    const { errors, isValid, data } = validateMeetingForm(formData);
    if (!isValid) return { fieldErrors: errors };

    await meetingInScheme(schemeId, meetingId);
    await updateMeeting(schemeId, meetingId, data);
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
    await updateMeeting(schemeId, meetingId, { status: "COMPLETED" });
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
    await requireSchemeAccess(schemeId, "governance.manage");

    await meetingInScheme(schemeId, meetingId);
    await updateMeeting(schemeId, meetingId, { status: "CANCELLED" });
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
