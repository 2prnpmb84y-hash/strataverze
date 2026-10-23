"use server";

import { revalidatePath } from "next/cache";
import { AuthorisationError } from "@/lib/auth/require-membership";
import { requireSchemeAccess } from "@/lib/auth/require-access";
import { assertBelongsTo, assertInScheme, assertOneOf } from "@/lib/auth/scheme-scope";
import type { Capability } from "@/config/permissions";
import { getMeetingById } from "@/lib/queries/meetings";
import { createMotion, castVote, getMotionById, VOTE_VALUES } from "@/lib/queries/motions";

export type MotionFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

/** Meeting statuses in which no further committee business can happen. */
const CLOSED_MEETING_STATUSES = ["CANCELLED", "COMPLETED", "PUBLISHED"];

/**
 * Validate the current user holds the capability on the meeting's scheme.
 * Committee business is committee-only (security review F6, F8): plain
 * owners cannot raise or vote on committee motions.
 * Returns the profile and meeting, or throws AuthorisationError.
 */
async function validateMeetingAccess(meetingId: string, capability: Capability) {
  const meeting = await getMeetingById(meetingId);
  if (!meeting) return null;

  const { profile } = await requireSchemeAccess(meeting.schemeId, capability);

  return { profile, meeting };
}

export async function createCommitteeMotionAction(
  meetingId: string,
  _prev: MotionFormState,
  formData: FormData,
): Promise<MotionFormState> {
  let result;
  try {
    result = await validateMeetingAccess(meetingId, "governance.committee");
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
    result = await validateMeetingAccess(meetingId, "governance.vote.committee");
    // The motion must belong to this meeting (and so this scheme), be open,
    // and the vote must be one of the allowed values (F6).
    assertOneOf(voteType, VOTE_VALUES, "vote value");
    if (result) {
      const motion = await getMotionById(motionId);
      assertInScheme(motion, result.meeting.schemeId, "Motion");
      assertBelongsTo(motion.meetingId, meetingId, "Motion");
      if (motion.status !== "OPEN") return { error: "This motion is not open for voting." };
      if (CLOSED_MEETING_STATUSES.includes(result.meeting.status))
        return { error: "This meeting is closed." };
    }
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
