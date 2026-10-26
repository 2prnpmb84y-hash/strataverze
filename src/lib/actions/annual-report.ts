"use server";
/** Strata Hub annual report actions (advisers): record an AGM held outside StrataVerze, and the report made. */
import { revalidatePath } from "next/cache";
import { AuthorisationError, requireSchemeMembership } from "@/lib/auth/require-membership";
import { schemeToday } from "@/lib/jurisdiction/scheme-time";
import { logError } from "@/lib/log";
import { AnnualReportError, recordAgmHeld, recordReported, removeRecordedAgm } from "@/lib/compliance/annual-report-store";

export type ReportFormState = { error?: string; fieldErrors?: Record<string, string>; success?: string; values?: Record<string, string> };

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const echo = (f: FormData) => Object.fromEntries([...f.entries()].filter(([, v]) => typeof v === "string")) as Record<string, string>;

function failure(err: unknown, f: FormData): ReportFormState {
  if (err instanceof AnnualReportError) return { error: err.message, fieldErrors: err.fieldErrors, values: echo(f) };
  if (err instanceof AuthorisationError) return { error: err.message };
  logError("[annual report] save failed:", err);
  return { error: "Could not save. Try again.", values: echo(f) };
}

export async function recordAgmHeldAction(schemeId: string, _prev: ReportFormState, formData: FormData): Promise<ReportFormState> {
  try {
    await requireSchemeMembership(schemeId, ["ADVISER"]);
    await recordAgmHeld({ schemeId, agmOn: text(formData, "agmOn"), today: await schemeToday(schemeId) });
    revalidatePath(`/adviser/schemes/${schemeId}/governance`, "layout");
    return { success: "AGM recorded." };
  } catch (err) {
    return failure(err, formData);
  }
}

export async function removeRecordedAgmAction(schemeId: string, _prev: ReportFormState, formData: FormData): Promise<ReportFormState> {
  try {
    await requireSchemeMembership(schemeId, ["ADVISER"]);
    await removeRecordedAgm({ schemeId, agmOn: text(formData, "agmOn") });
    revalidatePath(`/adviser/schemes/${schemeId}/governance`, "layout");
    return { success: "AGM removed." };
  } catch (err) {
    return failure(err, formData);
  }
}

export async function recordReportedAction(schemeId: string, _prev: ReportFormState, formData: FormData): Promise<ReportFormState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);
    await recordReported({
      schemeId,
      agmOn: text(formData, "agmOn"),
      reportedOn: text(formData, "reportedOn"),
      reference: text(formData, "reference") || null,
      actorId: profile.id,
      today: await schemeToday(schemeId),
    });
    revalidatePath(`/adviser/schemes/${schemeId}/governance`, "layout");
    return { success: "Report recorded." };
  } catch (err) {
    return failure(err, formData);
  }
}
