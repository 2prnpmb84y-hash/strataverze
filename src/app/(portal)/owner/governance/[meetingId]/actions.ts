"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemesForCommittee } from "@/lib/queries/schemes";
import { getMeetingById } from "@/lib/queries/meetings";
import { createMotion, castVote } from "@/lib/queries/motions";

export type MotionFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

/**
 * Validate the current user is a committee member for the meeting's scheme.
 * Returns the profile or null.
 */
async function validateCommitteeMember(meetingId: string) {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const meeting = await getMeetingById(meetingId);
  if (!meeting) return null;

  const schemes = await getSchemesForCommittee(profile.id);
  const hasAccess = schemes.some((s) => s.id === meeting.schemeId);
  if (!hasAccess) return null;

  return { profile, meeting };
}

export async function createCommitteeMotionAction(
  meetingId: string,
  _prev: MotionFormState,
  formData: FormData,
): Promise<MotionFormState> {
  const result = await validateCommitteeMember(meetingId);
  if (!result) return { error: "You must be a committee member to create motions." };

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
  const result = await validateCommitteeMember(meetingId);
  if (!result) return { error: "You must be a committee member to vote." };

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
