"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { castVote } from "@/lib/queries/motions";

export async function castVoteAction(motionId: string, voteValue: string) {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "You must be signed in." };

  const allowed = ["FOR", "AGAINST", "ABSTAIN"];
  if (!allowed.includes(voteValue)) {
    return { error: "Invalid vote value." };
  }

  try {
    await castVote({
      motionId,
      profileId: profile.id,
      voteValue,
    });
    revalidatePath("/owner/meetings");
    return {};
  } catch (err) {
    // Unique constraint violation — user already voted on this motion
    if (
      err instanceof Error &&
      (err.message.includes("unique") ||
        err.message.includes("duplicate") ||
        err.message.includes("UNIQUE") ||
        err.message.includes("23505"))
    ) {
      return { error: "You have already voted on this motion." };
    }
    return { error: "Failed to cast vote. Please try again." };
  }
}
