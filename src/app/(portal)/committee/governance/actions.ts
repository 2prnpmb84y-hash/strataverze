"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemesForCommittee } from "@/lib/queries/schemes";
import { createMeeting } from "@/lib/queries/meetings";

export type CommitteeMeetingFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

const MEETING_TYPES = ["AGM", "SGM", "COMMITTEE"];

export async function createCommitteeMeetingAction(
  _prev: CommitteeMeetingFormState,
  formData: FormData,
): Promise<CommitteeMeetingFormState> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "You must be signed in." };

  const schemes = await getSchemesForCommittee(profile.id);
  if (schemes.length === 0) return { error: "You are not on any scheme committees." };

  const title = (formData.get("title") as string)?.trim();
  const meetingType = formData.get("meetingType") as string | null;
  const scheduledAt = formData.get("scheduledAt") as string | null;
  const location = (formData.get("location") as string)?.trim() || undefined;
  const agenda = (formData.get("agenda") as string)?.trim() || undefined;
  const schemeId = formData.get("schemeId") as string | null;

  const errors: Record<string, string> = {};
  if (!title) errors.title = "Title is required.";
  if (!meetingType || !MEETING_TYPES.includes(meetingType))
    errors.meetingType = "Select a valid meeting type.";
  if (!scheduledAt) errors.scheduledAt = "Date and time is required.";
  if (!schemeId || !schemes.some((s) => s.id === schemeId))
    errors.schemeId = "Select a valid scheme.";

  if (Object.keys(errors).length > 0) return { fieldErrors: errors };

  try {
    await createMeeting({
      schemeId: schemeId!,
      title,
      meetingType: meetingType!,
      scheduledAt: new Date(scheduledAt!).toISOString(),
      location,
      agenda,
    });

    revalidatePath("/committee/governance");
    redirect("/committee/governance");
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
