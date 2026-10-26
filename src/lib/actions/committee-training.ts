"use server";
/**
 * Committee training actions: the adviser records a member's appointment,
 * completion or exemption; a committee member records their own completion.
 */
import { revalidatePath } from "next/cache";
import { AuthorisationError, requireSchemeMembership } from "@/lib/auth/require-membership";
import { schemeToday, schemeTimeZone } from "@/lib/jurisdiction/scheme-time";
import { storedDayIn } from "@/lib/jurisdiction/time-zone";
import { logError } from "@/lib/log";
import { TrainingError, recordOwnCompletion, saveCommitteeTraining } from "@/lib/governance/committee-training-store";

export type TrainingFormState = { error?: string; fieldErrors?: Record<string, string>; success?: string; values?: Record<string, string> };
const echo = (f: FormData) => Object.fromEntries([...f.entries()].filter(([, v]) => typeof v === "string")) as Record<string, string>;

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

function failure(err: unknown): TrainingFormState {
  if (err instanceof TrainingError) return { error: err.message, fieldErrors: err.fieldErrors };
  if (err instanceof AuthorisationError) return { error: err.message };
  logError("[committee training] save failed:", err);
  return { error: "Could not save. Try again." };
}

export async function saveCommitteeTrainingAction(schemeId: string, profileId: string, _prev: TrainingFormState, formData: FormData): Promise<TrainingFormState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);
    await saveCommitteeTraining({
      schemeId,
      profileId,
      appointedOn: text(formData, "appointedOn"),
      completedOn: text(formData, "completedOn") || null,
      exemption: text(formData, "exemption") || null,
      note: text(formData, "note") || null,
      actorId: profile.id,
      today: await schemeToday(schemeId),
    });
    revalidatePath(`/adviser/schemes/${schemeId}/members`, "layout");
    return { success: "Saved." };
  } catch (err) {
    return { ...failure(err), values: echo(formData) };
  }
}

export async function recordMyTrainingAction(schemeId: string, _prev: TrainingFormState, formData: FormData): Promise<TrainingFormState> {
  try {
    const { profile, membership } = await requireSchemeMembership(schemeId, ["COMMITTEE"]);
    const [today, tz] = await Promise.all([schemeToday(schemeId), schemeTimeZone(schemeId)]);
    await recordOwnCompletion({
      schemeId,
      profileId: profile.id,
      completedOn: text(formData, "completedOn"),
      today,
      defaultAppointedOn: storedDayIn(tz, membership.startDate),
    });
    revalidatePath("/owner/governance");
    return { success: "Thank you. Your training is recorded. It is recommended that you give a copy of your certificate to the secretary." };
  } catch (err) {
    return { ...failure(err), values: echo(formData) };
  }
}
