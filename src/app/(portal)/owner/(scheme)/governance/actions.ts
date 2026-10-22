"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSchemeMembership, AuthorisationError } from "@/lib/auth/require-membership";
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

export type CommitteeMeetingFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

function toIso(value: FormDataEntryValue | null): string {
  if (!value) return "";
  const d = new Date(value as string);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

export async function createCommitteeMeetingAction(
  _prev: CommitteeMeetingFormState,
  formData: FormData,
): Promise<CommitteeMeetingFormState> {
  const schemeId = formData.get("schemeId") as string | null;
  if (!schemeId) return { fieldErrors: { schemeId: "Select a valid scheme." } };

  let profileId: string;
  let state: string;
  try {
    const { profile } = await requireSchemeMembership(schemeId, [
      "OWNER",
      "COMMITTEE",
    ]);
    profileId = profile.id;
    const scheme = await getSchemeById(schemeId);
    if (!scheme) return { error: "Scheme not found." };
    state = scheme.state;
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    throw err;
  }

  const endRaw = formData.get("endTime");
  const input: MeetingSetupInput = {
    schemeId,
    title: ((formData.get("title") as string) ?? "").trim(),
    meetingType: (formData.get("meetingType") as string) || "COMMITTEE",
    startTime: toIso(formData.get("scheduledAt")),
    endTime: endRaw ? toIso(endRaw) : null,
    timezone: (formData.get("timezone") as string) || DEFAULT_TIMEZONE,
    format: (formData.get("format") as string) || null,
    location: ((formData.get("location") as string) ?? "").trim() || null,
    joinUrl: ((formData.get("joinUrl") as string) ?? "").trim() || null,
    joinDetails: ((formData.get("joinDetails") as string) ?? "").trim() || null,
  };

  const ruleSet = await getActiveRuleSet(state);
  const { errors } = validateMeetingSetup(input, ruleSet);
  if (Object.keys(errors).length > 0) return { fieldErrors: errors };

  try {
    const meeting = await createMeetingWithRuleSnapshot(input, {
      state,
      actorId: profileId,
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

    revalidatePath("/owner/governance");
    redirect("/owner/governance");
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
