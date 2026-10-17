"use server";

import { revalidatePath } from "next/cache";
import { requireSchemeMembership, AuthorisationError } from "@/lib/auth/require-membership";
import { getMeetingById } from "@/lib/queries/meetings";
import { createMotion, castVote } from "@/lib/queries/motions";

export type MotionFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

/**
 * Validate the current user has OWNER or COMMITTEE membership for the meeting's scheme.
 * Returns the profile and meeting, or throws AuthorisationError.
 */
async function validateMeetingAccess(meetingId: string) {
  const meeting = await getMeetingById(meetingId);
  if (!meeting) return null;

  const { profile } = await requireSchemeMembership(meeting.schemeId, ["OWNER", "COMMITTEE"]);

  return { profile, meeting };
}

export async function createCommitteeMotionAction(
  meetingId: string,
  _prev: MotionFormState,
  formData: FormData,
): Promise<MotionFormState> {
  let result;
  try {
    result = await validateMeetingAccess(meetingId);
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    throw err;
  }
  if (!result) return { error: "Meeting not found." };

  const { profile, meeting } = result;

  if (meeting.status !== "SCHEDULED") {
    return { error: "Motions can only be added to scheduled meetings." };
  }

  const title = (formData.get("title") as string)?.trim();
  const description = (formData.get("description") as string)?.trim();

  const errors: Record<string, string> = {};
  if (!title) errors.title = "Title is required.";
  if (!description) errors.description = "Description is required.";

  if (Object.keys(errors).length > 0) return { fieldErrors: errors };

  try {
    await createMotion({
      schemeId: meeting.schemeId,
      meetingId,
      raisedById: profile.id,
      title,
      description,
      motionType: "ORDINARY",
    });
    revalidatePath(`/owner/governance/${meetingId}`);
    return {};
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
    return { error: "Failed to create motion. Please try again." };
  }
}

export async function castCommitteeVoteAction(
  meetingId: string,
  motionId: string,
  voteType: string,
) {
  let result;
  try {
    result = await validateMeetingAccess(meetingId);
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    throw err;
  }
  if (!result) return { error: "Meeting not found." };

  const { profile } = result;

  try {
    await castVote({
      motionId,
      profileId: profile.id,
      voteValue: voteType,
    });
    revalidatePath(`/owner/governance/${meetingId}`);
    return {};
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
    return { error: "Failed to cast vote. You may have already voted." };
  }
}
