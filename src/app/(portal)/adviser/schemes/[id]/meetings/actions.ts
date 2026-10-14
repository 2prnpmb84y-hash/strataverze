"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/queries/profiles";
import {
  createMeeting,
  updateMeeting,
  deleteMeeting,
} from "@/lib/queries/meetings";
import {
  createMotion,
  updateMotion,
  deleteMotion,
  castVote,
} from "@/lib/queries/motions";
import { logActivity } from "@/lib/queries/activity-log";

export type MeetingFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

const MEETING_TYPES = ["AGM", "SGM", "COMMITTEE"];
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

export async function createMeetingAction(
  schemeId: string,
  _prev: MeetingFormState,
  formData: FormData,
): Promise<MeetingFormState> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "You must be signed in." };

  const { errors, isValid, data } = validateMeetingForm(formData);
  if (!isValid) return { fieldErrors: errors };

  try {
    const meeting = await createMeeting({ ...data, schemeId });

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "MEETING_SCHEDULED",
      entityType: "Meeting",
      entityId: meeting.id,
      metadata: { title: data.title, meetingType: data.meetingType },
    });

    revalidatePath(`/adviser/schemes/${schemeId}`);
    redirect(`/adviser/schemes/${schemeId}/meetings/${meeting.id}`);
  } catch (err) {
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
  const profile = await getCurrentProfile();
  if (!profile) return { error: "You must be signed in." };

  const { errors, isValid, data } = validateMeetingForm(formData);
  if (!isValid) return { fieldErrors: errors };

  try {
    await updateMeeting(meetingId, data);
    revalidatePath(`/adviser/schemes/${schemeId}/meetings/${meetingId}`);
    return {};
  } catch {
    return { error: "Failed to update meeting. Please try again." };
  }
}

export async function deleteMeetingAction(
  schemeId: string,
  meetingId: string,
) {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "You must be signed in." };

  try {
    await deleteMeeting(meetingId);
    revalidatePath(`/adviser/schemes/${schemeId}`);
    redirect(`/adviser/schemes/${schemeId}`);
  } catch (err) {
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
  const profile = await getCurrentProfile();
  if (!profile) return { error: "You must be signed in." };

  try {
    await updateMeeting(meetingId, { status: "COMPLETED" });
    revalidatePath(`/adviser/schemes/${schemeId}/meetings/${meetingId}`);
    return {};
  } catch {
    return { error: "Failed to complete meeting." };
  }
}

export async function cancelMeetingAction(
  schemeId: string,
  meetingId: string,
) {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "You must be signed in." };

  try {
    await updateMeeting(meetingId, { status: "CANCELLED" });
    revalidatePath(`/adviser/schemes/${schemeId}/meetings/${meetingId}`);
    return {};
  } catch {
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
  const profile = await getCurrentProfile();
  if (!profile) return { error: "You must be signed in." };

  const title = (formData.get("title") as string)?.trim();
  const description = (formData.get("description") as string)?.trim();
  const motionType = formData.get("motionType") as string;

  const errors: Record<string, string> = {};
  if (!title) errors.title = "Title is required.";
  if (!description) errors.description = "Description is required.";
  if (!motionType || !MOTION_TYPES.includes(motionType))
    errors.motionType = "Select a valid motion type.";

  if (Object.keys(errors).length > 0) return { fieldErrors: errors };

  try {
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
  } catch {
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
  const profile = await getCurrentProfile();
  if (!profile) return { error: "You must be signed in." };

  try {
    await updateMotion(motionId, { status, outcome: outcome ?? null });
    revalidatePath(`/adviser/schemes/${schemeId}/meetings/${meetingId}`);
    return {};
  } catch {
    return { error: "Failed to update motion." };
  }
}

export async function deleteMotionAction(
  schemeId: string,
  meetingId: string,
  motionId: string,
) {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "You must be signed in." };

  try {
    await deleteMotion(motionId);
    revalidatePath(`/adviser/schemes/${schemeId}/meetings/${meetingId}`);
    return {};
  } catch {
    return { error: "Failed to delete motion." };
  }
}

export async function castVoteAction(
  schemeId: string,
  meetingId: string,
  motionId: string,
  voteValue: string,
) {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "You must be signed in." };

  try {
    await castVote({
      motionId,
      profileId: profile.id,
      voteValue,
    });
    revalidatePath(`/adviser/schemes/${schemeId}/meetings/${meetingId}`);
    return {};
  } catch {
    return { error: "Failed to cast vote. You may have already voted." };
  }
}
