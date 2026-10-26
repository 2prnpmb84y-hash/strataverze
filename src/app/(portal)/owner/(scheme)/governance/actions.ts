"use server";

import { redirect } from "next/navigation";
import { isTimeZone, localToInstant } from "@/lib/jurisdiction/time-zone";
import { timeZoneOf } from "@/lib/jurisdiction/scheme-time";
import { revalidatePath } from "next/cache";
import { AuthorisationError } from "@/lib/auth/require-membership";
import { requireSchemeAccess } from "@/lib/auth/require-access";
import {
  getSchemeNameById,
  getMemberEmailsForScheme,
  getSchemeById,
} from "@/lib/queries/schemes";
import { notifyMeetingScheduled } from "@/lib/notifications";
import { getActiveRuleSet } from "@/lib/meetings/rule-set-repo";
import { UnsupportedJurisdictionError } from "@/config/statutory";
import {
  validateMeetingSetup,
  createMeetingWithRuleSnapshot,
  type MeetingSetupInput,
} from "@/lib/meetings/setup";

export type CommitteeMeetingFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

/**
 * A datetime-local value ("YYYY-MM-DDTHH:mm") as an instant, read in the
 * meeting's time zone. `new Date(value)` would read it in the server's time
 * zone (UTC), putting a 6 pm meeting at 5 am the next day in Sydney.
 */
function toIso(value: FormDataEntryValue | null, timeZone: string): string {
  if (!value) return "";
  return localToInstant(timeZone, String(value)) ?? "";
}

/** The meeting's time zone: the one chosen on the form if it is real, else the building's. */
function meetingTimeZone(formData: FormData, buildingTimeZone: string): string {
  const chosen = String(formData.get("timezone") ?? "").trim();
  return isTimeZone(chosen) ? chosen : buildingTimeZone;
}

export async function createCommitteeMeetingAction(
  _prev: CommitteeMeetingFormState,
  formData: FormData,
): Promise<CommitteeMeetingFormState> {
  const schemeId = formData.get("schemeId") as string | null;
  if (!schemeId) return { fieldErrors: { schemeId: "Select a valid scheme." } };

  let profileId: string;
  let state: string;
  let buildingTimeZone: string;
  try {
    // Committee only (security review F9): plain owners cannot convene meetings here.
    const { profile } = await requireSchemeAccess(schemeId, "governance.committee");
    profileId = profile.id;
    const scheme = await getSchemeById(schemeId);
    if (!scheme) return { error: "Scheme not found." };
    state = scheme.state;
    buildingTimeZone = timeZoneOf(scheme);
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    throw err;
  }

  const endRaw = formData.get("endTime");
  // Times on the form are local times in the meeting's time zone (the building's unless another is chosen).
  const tz = meetingTimeZone(formData, buildingTimeZone);
  const input: MeetingSetupInput = {
    schemeId,
    title: ((formData.get("title") as string) ?? "").trim(),
    meetingType: (formData.get("meetingType") as string) || "COMMITTEE",
    startTime: toIso(formData.get("scheduledAt"), tz),
    endTime: endRaw ? toIso(endRaw, tz) : null,
    timezone: tz,
    format: (formData.get("format") as string) || null,
    location: ((formData.get("location") as string) ?? "").trim() || null,
    joinUrl: ((formData.get("joinUrl") as string) ?? "").trim() || null,
    joinDetails: ((formData.get("joinDetails") as string) ?? "").trim() || null,
  };

  let ruleSet;
  try {
    ruleSet = await getActiveRuleSet(state);
  } catch (err) {
    if (err instanceof UnsupportedJurisdictionError) return { error: err.message };
    throw err;
  }
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
      timeZone: tz,
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
