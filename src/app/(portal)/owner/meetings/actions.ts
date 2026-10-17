"use server";

import { revalidatePath } from "next/cache";
import { requireAuth, AuthorisationError } from "@/lib/auth/require-membership";
import { castVote } from "@/lib/queries/motions";

export async function castVoteAction(motionId: string, voteValue: string) {
  let profile;
  try {
    profile = await requireAuth();
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    throw err;
  }

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
