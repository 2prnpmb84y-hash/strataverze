"use server";
/**
 * Information certificate (s 184) and records inspection (s 182) actions.
 * Advisers only: the certificate is issued by the owners corporation through
 * its strata manager.
 */
import { revalidatePath } from "next/cache";
import { AuthorisationError, requireSchemeMembership } from "@/lib/auth/require-membership";
import { logError } from "@/lib/log";
import {
  RecordsError,
  cancelCertificateDraft,
  cancelInspection,
  completeInspection,
  createCertificate,
  createInspection,
  issueCertificate,
  recordFeePaid,
  saveCertificateDraft,
  scheduleInspection,
  type RequesterInput,
} from "@/lib/records/records-store";

export type RecordsFormState = { error?: string; fieldErrors?: Record<string, string>; success?: string; id?: string; values?: Record<string, string> };

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const echo = (f: FormData) => Object.fromEntries([...f.entries()].filter(([, v]) => typeof v === "string")) as Record<string, string>;

function failure(err: unknown, f: FormData | null, what: string): RecordsFormState {
  const values = f ? echo(f) : undefined;
  if (err instanceof RecordsError) return { error: err.message, fieldErrors: err.fieldErrors, values };
  if (err instanceof AuthorisationError) return { error: err.message };
  logError(`[records] ${what} failed:`, err);
  return { error: `Could not ${what}. Try again.`, values };
}

function requester(f: FormData): RequesterInput {
  return {
    requestedOn: text(f, "requestedOn"),
    requesterType: text(f, "requesterType"),
    requesterName: text(f, "requesterName"),
    requesterAddress: text(f, "requesterAddress"),
    authorisedByType: text(f, "authorisedByType") || null,
    authorisedByName: text(f, "authorisedByName") || null,
    authorisedByAddress: text(f, "authorisedByAddress") || null,
  };
}

const certPaths = (schemeId: string, lotId: string) => revalidatePath(`/adviser/schemes/${schemeId}/lots/${lotId}`, "layout");

export async function createCertificateAction(schemeId: string, lotId: string, _prev: RecordsFormState, formData: FormData): Promise<RecordsFormState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);
    const r = await createCertificate({ schemeId, lotId, requester: requester(formData), actorId: profile.id });
    certPaths(schemeId, lotId);
    return { success: "Draft started from StrataVerze's records. Check and complete every item.", id: r.id };
  } catch (err) {
    return failure(err, formData, "start the certificate");
  }
}

export async function saveCertificateAction(schemeId: string, lotId: string, certificateId: string, _prev: RecordsFormState, formData: FormData): Promise<RecordsFormState> {
  try {
    await requireSchemeMembership(schemeId, ["ADVISER"]);
    const itemTexts: Record<string, string> = {};
    for (const [k, v] of formData.entries()) if (k.startsWith("item_") && typeof v === "string") itemTexts[k.slice(5)] = v;
    await saveCertificateDraft({ schemeId, certificateId, requester: requester(formData), itemTexts });
    certPaths(schemeId, lotId);
    return { success: "Draft saved." };
  } catch (err) {
    return failure(err, formData, "save the certificate");
  }
}

export async function issueCertificateAction(schemeId: string, lotId: string, certificateId: string, _prev: RecordsFormState, formData: FormData): Promise<RecordsFormState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);
    const fee = await issueCertificate({ schemeId, certificateId, actorId: profile.id, checkedAll: formData.get("checkedAll") === "on" });
    certPaths(schemeId, lotId);
    return { success: `Issued. Fee due: $${(fee.cents / 100).toFixed(2)}${fee.repeat ? " (a further certificate within the repeat period)" : ""}, collected outside StrataVerze.` };
  } catch (err) {
    return failure(err, null, "issue the certificate");
  }
}

export async function cancelCertificateAction(schemeId: string, lotId: string, certificateId: string): Promise<RecordsFormState> {
  try {
    await requireSchemeMembership(schemeId, ["ADVISER"]);
    await cancelCertificateDraft({ schemeId, certificateId });
    certPaths(schemeId, lotId);
    return { success: "Draft cancelled." };
  } catch (err) {
    return failure(err, null, "cancel the draft");
  }
}

export async function recordFeePaidAction(schemeId: string, kind: "certificate" | "inspection", id: string, _prev: RecordsFormState, formData: FormData): Promise<RecordsFormState> {
  try {
    await requireSchemeMembership(schemeId, ["ADVISER"]);
    if (kind !== "certificate" && kind !== "inspection") return { error: "Not found." };
    await recordFeePaid({ schemeId, kind, id, paidOn: text(formData, "paidOn") });
    revalidatePath(`/adviser/schemes/${schemeId}`, "layout");
    return { success: "Payment recorded." };
  } catch (err) {
    return failure(err, formData, "record the payment");
  }
}

const inspPath = (schemeId: string) => revalidatePath(`/adviser/schemes/${schemeId}/governance/inspections`);

export async function createInspectionAction(schemeId: string, _prev: RecordsFormState, formData: FormData): Promise<RecordsFormState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);
    await createInspection({
      schemeId,
      lotId: text(formData, "lotId"),
      inspectorType: text(formData, "inspectorType"),
      inspectorName: text(formData, "inspectorName"),
      authorisedBy: text(formData, "authorisedBy") || null,
      requestedOn: text(formData, "requestedOn"),
      notes: text(formData, "notes") || null,
      actorId: profile.id,
    });
    inspPath(schemeId);
    return { success: "Request recorded." };
  } catch (err) {
    return failure(err, formData, "record the request");
  }
}

export async function scheduleInspectionAction(schemeId: string, id: string, _prev: RecordsFormState, formData: FormData): Promise<RecordsFormState> {
  try {
    await requireSchemeMembership(schemeId, ["ADVISER"]);
    await scheduleInspection({ schemeId, id, when: text(formData, "when"), place: text(formData, "place"), setByNotice: formData.get("setByNotice") === "on" });
    inspPath(schemeId);
    return { success: "Time and place recorded." };
  } catch (err) {
    return failure(err, formData, "record the time");
  }
}

export async function completeInspectionAction(schemeId: string, id: string, _prev: RecordsFormState, formData: FormData): Promise<RecordsFormState> {
  try {
    await requireSchemeMembership(schemeId, ["ADVISER"]);
    const v = text(formData, "minutes");
    const fee = await completeInspection({ schemeId, id, minutes: /^\d+$/.test(v) ? Number(v) : Number.NaN });
    inspPath(schemeId);
    return { success: `Recorded. Fee due: $${(fee / 100).toFixed(2)} (including GST), collected outside StrataVerze.` };
  } catch (err) {
    return failure(err, formData, "record the inspection");
  }
}

export async function cancelInspectionAction(schemeId: string, id: string): Promise<RecordsFormState> {
  try {
    await requireSchemeMembership(schemeId, ["ADVISER"]);
    await cancelInspection({ schemeId, id });
    inspPath(schemeId);
    return { success: "Cancelled." };
  } catch (err) {
    return failure(err, null, "cancel the inspection");
  }
}
