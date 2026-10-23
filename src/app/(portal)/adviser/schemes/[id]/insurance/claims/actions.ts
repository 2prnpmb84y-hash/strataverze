"use server";

import { uploadErrorMessage, consumeUpload, verifyUpload } from "@/lib/storage/uploads";
import { recordSecurityEventLater } from "@/lib/audit/security-audit";
import { db } from "@/prisma/db";
import { captureUsageFee } from "@/lib/billing/capture";
import { confirmedCentsFrom, feeErrorMessage } from "@/lib/billing/disclosure";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSchemeMembership, AuthorisationError } from "@/lib/auth/require-membership";
import { resolveDocumentUrl } from "@/lib/queries/document-url";
import { logActivity } from "@/lib/queries/activity-log";
import {
  createClaim,
  updateClaim,
  setClaimStatus,
  recordClaimLodgement,
  recordClaimEvent,
  getClaimById,
  getSchemeClaim,
} from "@/lib/queries/insurance-claims";
import { createInsuranceDocument, getDownloadableInsuranceDocument } from "@/lib/queries/insurance-documents";
import { getSchemePolicy } from "@/lib/queries/insurance";
import { requireSchemeAccess } from "@/lib/auth/require-access";
import { canTransitionClaim, isClaimStatus } from "@/lib/insurance/status";
import { CLAIM_CATEGORIES, DOCUMENT_CATEGORIES } from "@/lib/insurance/constants";

export type ClaimFormState = { error?: string; fieldErrors?: Record<string, string> };

const CATEGORY_SET = new Set<string>(CLAIM_CATEGORIES);
const DOCUMENT_CATEGORY_SET = new Set<string>(DOCUMENT_CATEGORIES);

/** A claim may only be filed against one of the scheme's own policies. */
async function policyProblem(schemeId: string, policyId: string | null): Promise<string | null> {
  if (!policyId) return null;
  return (await getSchemePolicy(schemeId, policyId)) ? null : "Choose a policy of this scheme.";
}

function str(fd: FormData, k: string): string {
  return ((fd.get(k) as string) ?? "").trim();
}
function optStr(fd: FormData, k: string): string | null {
  const v = str(fd, k);
  return v === "" ? null : v;
}
function isoOrNull(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
function boolOrNull(fd: FormData, k: string): boolean | null {
  const v = str(fd, k);
  if (v === "YES") return true;
  if (v === "NO") return false;
  return null;
}
function numOrNull(fd: FormData, k: string): number | null {
  const v = str(fd, k);
  if (!v || Number.isNaN(Number(v))) return null;
  return Number(v);
}
function isRedirect(err: unknown): boolean {
  return (
    !!err &&
    typeof err === "object" &&
    "digest" in err &&
    typeof (err as { digest: unknown }).digest === "string" &&
    (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

function claimFieldsFromForm(fd: FormData) {
  const category = str(fd, "incidentCategory");
  return {
    title: str(fd, "title"),
    policyId: optStr(fd, "policyId"),
    incidentCategory: CATEGORY_SET.has(category) ? category : null,
    incidentDate: isoOrNull(str(fd, "incidentDate")),
    incidentTime: optStr(fd, "incidentTime"),
    discoveredDate: isoOrNull(str(fd, "discoveredDate")),
    incidentLocation: optStr(fd, "incidentLocation"),
    lotReference: optStr(fd, "lotReference"),
    commonProperty: boolOrNull(fd, "commonProperty"),
    individualLot: boolOrNull(fd, "individualLot"),
    description: optStr(fd, "description"),
    damageDetails: optStr(fd, "damageDetails"),
    immediateAction: optStr(fd, "immediateAction"),
    estimatedLoss: numOrNull(fd, "estimatedLoss"),
    reporterType: optStr(fd, "reporterType"),
    reporterName: optStr(fd, "reporterName"),
    contactEmail: optStr(fd, "contactEmail"),
    contactPhone: optStr(fd, "contactPhone"),
    smsUpdates: str(fd, "smsUpdates") === "YES",
    otherParties: optStr(fd, "otherParties"),
  };
}

export async function createClaimAction(
  schemeId: string,
  _prev: ClaimFormState,
  formData: FormData,
): Promise<ClaimFormState> {
  const fields = claimFieldsFromForm(formData);
  const errors: Record<string, string> = {};
  if (!fields.title) errors.title = "A short claim title is required.";
  if (!fields.description) errors.description = "Describe what occurred.";
  if (Object.keys(errors).length > 0) return { fieldErrors: errors };

  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);
    const badPolicy = await policyProblem(schemeId, fields.policyId);
    if (badPolicy) return { fieldErrors: { policyId: badPolicy } };
    const claim = await createClaim({ ...fields, schemeId });
    await recordClaimEvent({
      claimId: claim.id,
      eventType: "CREATED",
      toStatus: "DRAFT",
      actorId: profile.id,
    });
    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "INSURANCE_CLAIM_CREATED",
      entityType: "InsuranceClaim",
      entityId: claim.id,
      metadata: { title: fields.title },
    });
    revalidatePath(`/adviser/schemes/${schemeId}/insurance`);
    redirect(`/adviser/schemes/${schemeId}/insurance/claims/${claim.id}`);
  } catch (err) {
    if (isRedirect(err)) throw err;
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to create the claim. Please try again." };
  }
}

export async function updateClaimAction(
  schemeId: string,
  claimId: string,
  _prev: ClaimFormState,
  formData: FormData,
): Promise<ClaimFormState> {
  const fields = claimFieldsFromForm(formData);
  const errors: Record<string, string> = {};
  if (!fields.title) errors.title = "A short claim title is required.";
  if (Object.keys(errors).length > 0) return { fieldErrors: errors };

  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);
    const badPolicy = await policyProblem(schemeId, fields.policyId);
    if (badPolicy) return { fieldErrors: { policyId: badPolicy } };
    // Scheme-scoped: another scheme's claim id matches nothing (SEC-004).
    const updated = await updateClaim(schemeId, claimId, fields);
    if (!updated) return { error: "Claim not found." };
    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "INSURANCE_CLAIM_UPDATED",
      entityType: "InsuranceClaim",
      entityId: claimId,
    });
    revalidatePath(`/adviser/schemes/${schemeId}/insurance/claims/${claimId}`);
    return {};
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to update the claim. Please try again." };
  }
}

/** Update claim management fields: amounts, assessor, decision, references. */
export async function updateClaimManagementAction(
  schemeId: string,
  claimId: string,
  _prev: ClaimFormState,
  formData: FormData,
): Promise<ClaimFormState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);
    const updated = await updateClaim(schemeId, claimId, {
      insurerClaimRef: optStr(formData, "insurerClaimRef"),
      assessorDetails: optStr(formData, "assessorDetails"),
      contractorDetails: optStr(formData, "contractorDetails"),
      claimedAmount: numOrNull(formData, "claimedAmount"),
      approvedAmount: numOrNull(formData, "approvedAmount"),
      paidAmount: numOrNull(formData, "paidAmount"),
      excessAmount: numOrNull(formData, "excessAmount"),
      settlementDetails: optStr(formData, "settlementDetails"),
      decisionReason: optStr(formData, "decisionReason"),
    });
    if (!updated) return { error: "Claim not found." };
    await recordClaimEvent({
      claimId,
      eventType: "AMOUNT_UPDATED",
      actorId: profile.id,
      note: "Claim management details updated.",
    });
    revalidatePath(`/adviser/schemes/${schemeId}/insurance/claims/${claimId}`);
    return {};
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to update claim details. Please try again." };
  }
}

export async function changeClaimStatusAction(
  schemeId: string,
  claimId: string,
  toStatus: string,
  note?: string,
): Promise<{ error?: string }> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);
    const claim = await getClaimById(claimId);
    if (!claim || claim.schemeId !== schemeId) return { error: "Claim not found." };
    if (!isClaimStatus(toStatus)) return { error: "Invalid status." };
    if (!canTransitionClaim(claim.status, toStatus))
      return { error: `Cannot move a ${claim.status} claim to ${toStatus}.` };

    const closing = toStatus === "CLOSED";
    await setClaimStatus(claimId, toStatus, {
      closedAt: closing ? new Date().toISOString() : undefined,
    });
    await recordClaimEvent({
      claimId,
      eventType: "STATUS_CHANGED",
      fromStatus: claim.status,
      toStatus,
      note: note?.trim() || null,
      actorId: profile.id,
    });
    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "INSURANCE_CLAIM_STATUS_CHANGED",
      entityType: "InsuranceClaim",
      entityId: claimId,
      metadata: { from: claim.status, to: toStatus },
    });
    revalidatePath(`/adviser/schemes/${schemeId}/insurance/claims/${claimId}`);
    return {};
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to change claim status." };
  }
}

/**
 * Record that the claim was actually lodged with the insurer or broker. This is
 * distinct from saving the claim in the app: it captures the real submission
 * date, recipient, channel and reference, and moves the claim to SUBMITTED.
 */
export async function lodgeClaimAction(
  schemeId: string,
  claimId: string,
  _prev: ClaimFormState,
  formData: FormData,
): Promise<ClaimFormState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);
    const claim = await getClaimById(claimId);
    if (!claim || claim.schemeId !== schemeId) return { error: "Claim not found." };
    if (claim.status !== "DRAFT")
      return { error: "Only a draft claim can be recorded as lodged." };

    const lodgedAt = isoOrNull(str(formData, "lodgedAt")) ?? new Date().toISOString();
    // Lodgement, status change and the StrataVerze claim handling fee together.
    await db.transaction(async (tx) => {
      await recordClaimLodgement(
        claimId,
        {
          lodgedAt,
          lodgedChannel: optStr(formData, "lodgedChannel"),
          lodgedRecipient: optStr(formData, "lodgedRecipient"),
          lodgedReference: optStr(formData, "lodgedReference"),
          lodgedById: profile.id,
        },
        tx.orm,
      );
      await setClaimStatus(claimId, "SUBMITTED", {}, tx.orm);
      await captureUsageFee(tx.orm, {
        schemeId,
        code: "CLAIM_HANDLING",
        sourceType: "InsuranceClaim",
        sourceId: claimId,
        actorId: profile.id,
        confirmedCents: confirmedCentsFrom(formData),
      });
    });
    await recordClaimEvent({
      claimId,
      eventType: "LODGED",
      fromStatus: "DRAFT",
      toStatus: "SUBMITTED",
      note: `Lodged with ${optStr(formData, "lodgedRecipient") ?? "insurer/broker"} via ${optStr(formData, "lodgedChannel") ?? "recorded channel"}.`,
      actorId: profile.id,
    });
    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "INSURANCE_CLAIM_LODGED",
      entityType: "InsuranceClaim",
      entityId: claimId,
    });
    revalidatePath(`/adviser/schemes/${schemeId}/insurance/claims/${claimId}`);
    return {};
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    const feeError = feeErrorMessage(err);
    if (feeError) return { error: feeError };
    return { error: "Failed to record lodgement." };
  }
}

export async function addClaimNoteAction(
  schemeId: string,
  claimId: string,
  note: string,
): Promise<{ error?: string }> {
  const trimmed = typeof note === "string" ? note.trim() : "";
  if (!trimmed) return { error: "Note cannot be empty." };
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);
    const claim = await getSchemeClaim(schemeId, claimId);
    if (!claim) return { error: "Claim not found." };
    await recordClaimEvent({
      claimId: claim.id,
      eventType: "NOTE",
      note: trimmed,
      actorId: profile.id,
    });
    revalidatePath(`/adviser/schemes/${schemeId}/insurance/claims/${claimId}`);
    return {};
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to add note." };
  }
}

// ─── Evidence (reuses the insurance_documents store, scoped to the claim) ──

export async function uploadClaimEvidenceAction(
  schemeId: string,
  claimId: string,
  formData: FormData,
): Promise<{ id?: string; error?: string }> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);
    const uploadId = String(formData.get("uploadId") ?? "");
    const category = (formData.get("category") as string) || "CLAIM_EVIDENCE";
    if (!uploadId) return { error: "No file provided." };
    if (!DOCUMENT_CATEGORY_SET.has(category)) return { error: "Invalid document category." };
    // The claim must be this scheme's (SEC-004).
    const claim = await getSchemeClaim(schemeId, claimId);
    if (!claim) return { error: "Claim not found." };
    // What actually arrived in storage, checked (S3).
    let upload;
    try {
      upload = await verifyUpload({ uploadId, schemeId, purpose: "claim_evidence", profileId: profile.id });
    } catch (err) {
      const message = uploadErrorMessage(err);
      if (message) return { error: message };
      throw err;
    }

    // Claimed atomically, so the same upload cannot make two records (S3).
    const doc = await consumeUpload(
      uploadId,
      () =>
        createInsuranceDocument({
          schemeId,
          claimId: claim.id,
          category,
          title: upload.fileName.replace(/\.[^.]+$/, ""),
          fileUrl: upload.path,
          fileName: upload.fileName,
          fileSize: upload.size,
          mimeType: upload.mimeType,
          uploadedBy: profile.id,
        }),
      (d) => `InsuranceDocument:${d.id}`,
    );
    await recordClaimEvent({
      claimId: claim.id,
      eventType: "DOCUMENT_ADDED",
      note: `Evidence added: ${upload.fileName}`,
      actorId: profile.id,
    });
    revalidatePath(`/adviser/schemes/${schemeId}/insurance/claims/${claimId}`);
    return { id: doc.id };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to upload evidence." };
  }
}

/**
 * Short-lived signed URL for a claim's evidence. Takes the document's id,
 * never a path, and signs the record's own stored path once the document is
 * confirmed to be evidence on one of this scheme's claims. Only the adviser
 * claim page lists evidence, so only advisers may sign it.
 */
export async function getClaimDocumentUrlAction(
  schemeId: string,
  documentId: string,
): Promise<{ url?: string; error?: string }> {
  let doc: Awaited<ReturnType<typeof getDownloadableInsuranceDocument>>;
  let actorId: string;
  try {
    actorId = (await requireSchemeAccess(schemeId, "insurance.manage")).profile.id;
    doc = await getDownloadableInsuranceDocument(schemeId, documentId, "manager");
    if (doc && !(doc.claimId && (await getSchemeClaim(schemeId, doc.claimId)))) doc = null;
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    throw err;
  }
  if (!doc) return { error: "Document not found." };
  try {
    await recordSecurityEventLater({
      action: "document.download",
      outcome: "allowed",
      actorProfileId: actorId,
      schemeId,
      resourceType: "InsuranceDocument",
      resourceId: documentId,
      metadata: { kind: "claim_evidence" },
    });
    return { url: await resolveDocumentUrl(String(doc.fileUrl), 600, { schemeId }) };
  } catch {
    return { error: "Failed to generate document URL." };
  }
}
