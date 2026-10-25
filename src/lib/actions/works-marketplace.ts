"use server";

/**
 * Works marketplace, stage 1 (25 Oct 2026): owners raise works requests,
 * the committee decides how each is handled by electronic vote, and the
 * committee keeps the building's works settings and preferred contractors.
 * Plan: https://claude.ai/artifact/VAj6SJ5PrsVry3HJ5RAYbF
 */
import { revalidatePath } from "next/cache";
import { AuthorisationError } from "@/lib/auth/require-membership";
import { requireSchemeAccess } from "@/lib/auth/require-access";
import { requireRecentMfa } from "@/lib/auth/mfa-enforcement";
import { recordSecurityEvent } from "@/lib/audit/security-audit";
import { logActivity } from "@/lib/queries/activity-log";
import { uploadErrorMessage } from "@/lib/storage/uploads";
import { logError } from "@/lib/log";
import { checkRequest, getRequest, resubmitRequest, submitRequest, WorksRequestError } from "@/lib/works/requests";
import { proposeRoute, vote, withdraw, WorksDecisionError, decisionsFor } from "@/lib/works/review";
import { checkWorksSettings, PreferredContractorError, removePreferredContractor, saveWorksSettings, setPreferredContractor } from "@/lib/works/settings";
import { notifyDecision, notifyRequestSubmitted, notifySettingsChanged, notifyVoteNeeded } from "@/lib/works/notify";
import { ROUTE_OUTCOMES, type RouteOutcome } from "@/lib/works/decision-rules";

export type WorksFormState = { error?: string; fieldErrors?: Record<string, string>; done?: string; requestId?: string };

function revalidateWorks(schemeId: string, requestId?: string) {
  revalidatePath("/owner/works", "layout");
  revalidatePath(`/adviser/schemes/${schemeId}/works`, "layout");
  if (requestId) revalidatePath(`/owner/works/${requestId}`);
}

function failure(err: unknown, fallback: string): WorksFormState {
  if (err instanceof AuthorisationError) return { error: err.message };
  if (err instanceof WorksRequestError) return { error: err.message, fieldErrors: err.fieldErrors };
  if (err instanceof WorksDecisionError || err instanceof PreferredContractorError) return { error: err.message };
  const upload = uploadErrorMessage(err);
  if (upload) return { fieldErrors: { photos: upload } };
  logError(`[works] ${fallback}`, err);
  return { error: fallback };
}

function requestFields(formData: FormData) {
  return {
    title: formData.get("title"),
    trade: formData.get("trade"),
    location: formData.get("location"),
    description: formData.get("description"),
    isEmergency: formData.get("isEmergency"),
    photoUploadIds: formData.getAll("photoUploadId").map(String).filter(Boolean),
  };
}

// ─── Requests ──────────────────────────────────────────────────────────────

/** An owner or committee member raises a works request for the committee. */
export async function submitWorksRequestAction(schemeId: string, _prev: WorksFormState, formData: FormData): Promise<WorksFormState> {
  try {
    const { profile } = await requireSchemeAccess(schemeId, "works.request");
    const checked = checkRequest(requestFields(formData));
    if (!checked.ok) return { fieldErrors: checked.fieldErrors };
    const r = await submitRequest(schemeId, profile.id, checked.value);
    await logActivity({ schemeId, actorId: profile.id, action: "WORKS_REQUEST_SUBMITTED", entityType: "WorksRequest", entityId: r.id, metadata: { requestNumber: r.requestNumber, trade: checked.value.trade, emergency: checked.value.isEmergency, photos: checked.value.photoUploadIds.length } });
    await notifyRequestSubmitted({ schemeId, requestId: r.id, requestNumber: r.requestNumber, title: checked.value.title, isEmergency: checked.value.isEmergency, raisedById: profile.id });
    revalidateWorks(schemeId, r.id);
    return { done: `Request ${r.requestNumber} has been sent to the committee.${r.photoProblem ? ` ${r.photoProblem}` : ""}`, requestId: r.id };
  } catch (err) {
    return failure(err, "The request could not be sent. Please try again.");
  }
}

/** Whoever raised a returned request changes it and sends it back. */
export async function resubmitWorksRequestAction(schemeId: string, requestId: string, _prev: WorksFormState, formData: FormData): Promise<WorksFormState> {
  try {
    const { profile } = await requireSchemeAccess(schemeId, "works.request");
    const checked = checkRequest(requestFields(formData));
    if (!checked.ok) return { fieldErrors: checked.fieldErrors };
    const r = await resubmitRequest(schemeId, requestId, profile.id, checked.value);
    await logActivity({ schemeId, actorId: profile.id, action: "WORKS_REQUEST_RESUBMITTED", entityType: "WorksRequest", entityId: r.id, metadata: { requestNumber: r.requestNumber } });
    await notifyRequestSubmitted({ schemeId, requestId: r.id, requestNumber: r.requestNumber, title: checked.value.title, isEmergency: checked.value.isEmergency, raisedById: profile.id, resubmitted: true });
    revalidateWorks(schemeId, r.id);
    return { done: `Request ${r.requestNumber} has been sent back to the committee.${r.photoProblem ? ` ${r.photoProblem}` : ""}`, requestId: r.id };
  } catch (err) {
    return failure(err, "The request could not be sent. Please try again.");
  }
}

// ─── The committee's decision ──────────────────────────────────────────────

async function afterSettle(schemeId: string, requestId: string, actorId: string, result: { status: string; applied: boolean }) {
  if (!result.applied || (result.status !== "DECIDED" && result.status !== "NOT_AGREED")) return;
  const request = await getRequest(schemeId, requestId);
  const decision = (await decisionsFor(requestId))[0];
  if (!request || !decision) return;
  await logActivity({
    schemeId,
    actorId,
    action: result.status === "DECIDED" ? "WORKS_DECISION_MADE" : "WORKS_DECISION_NOT_AGREED",
    entityType: "WorksRequest",
    entityId: requestId,
    metadata: { requestNumber: String(request.requestNumber), outcome: String(decision.outcome), votesFor: decision.votes.filter((v) => v.vote === "FOR").length, votesAgainst: decision.votes.filter((v) => v.vote === "AGAINST").length, byDelegation: !!decision.byDelegation },
  });
  await notifyDecision({
    schemeId,
    requestId,
    requestNumber: String(request.requestNumber),
    title: String(request.title),
    outcome: String(decision.outcome) as RouteOutcome,
    status: result.status,
    raisedById: request.raisedById,
    returnReason: request.returnReason ? String(request.returnReason) : null,
    note: decision.note ? String(decision.note) : null,
    byDelegation: !!decision.byDelegation,
  });
}

/** A committee member (or the Adviser, under delegation) proposes how a request is handled. */
export async function proposeWorksRouteAction(schemeId: string, requestId: string, _prev: WorksFormState, formData: FormData): Promise<WorksFormState> {
  try {
    const { profile, roles } = await requireSchemeAccess(schemeId, "works.decide");
    const outcome = String(formData.get("outcome") ?? "");
    const r = await proposeRoute({
      schemeId,
      requestId,
      actor: { profileId: profile.id, roles },
      outcome,
      note: String(formData.get("note") ?? "").slice(0, 2000) || null,
      returnReason: String(formData.get("returnReason") ?? "").slice(0, 2000) || null,
    });
    await logActivity({ schemeId, actorId: profile.id, action: "WORKS_DECISION_PROPOSED", entityType: "WorksRequest", entityId: requestId, metadata: { outcome: r.outcome, decisionId: r.decisionId } });
    if (r.status === "WITHDRAWN") return { error: "This request is no longer waiting for the committee. Reload the page." };
    if (r.status === "OPEN") {
      const request = await getRequest(schemeId, requestId);
      if (request) await notifyVoteNeeded({ schemeId, requestId, requestNumber: String(request.requestNumber), title: String(request.title), outcome: r.outcome, proposedById: profile.id, votedIds: [profile.id] });
    }
    await afterSettle(schemeId, requestId, profile.id, r);
    revalidateWorks(schemeId, requestId);
    const label = ROUTE_OUTCOMES[r.outcome].label;
    return { done: r.status === "DECIDED" ? `Decided: ${label}.` : `Proposed: ${label}. ${r.tally.votesFor} of the votes needed so far; the committee has been asked to vote.` };
  } catch (err) {
    return failure(err, "The decision could not be recorded. Please try again.");
  }
}

/** A committee member votes for or against the open proposal. */
export async function voteWorksDecisionAction(schemeId: string, requestId: string, decisionId: string, _prev: WorksFormState, formData: FormData): Promise<WorksFormState> {
  try {
    const { profile, roles } = await requireSchemeAccess(schemeId, "works.decide");
    const v = String(formData.get("vote") ?? "");
    // The request comes from the decision itself; a mismatched id is refused.
    const r = await vote({ schemeId, decisionId, requestId, actor: { profileId: profile.id, roles }, vote: v, comment: String(formData.get("comment") ?? "").slice(0, 2000) || null });
    await logActivity({ schemeId, actorId: profile.id, action: "WORKS_DECISION_VOTED", entityType: "WorksRequest", entityId: r.requestId, metadata: { decisionId, vote: v } });
    await afterSettle(schemeId, r.requestId, profile.id, r);
    revalidateWorks(schemeId, r.requestId);
    return { done: r.status === "DECIDED" ? "Your vote decided it." : r.status === "NOT_AGREED" ? "Your vote was recorded. The proposal was not agreed." : "Your vote has been recorded." };
  } catch (err) {
    return failure(err, "Your vote could not be recorded. Please try again.");
  }
}

export async function withdrawWorksDecisionAction(schemeId: string, requestId: string, decisionId: string): Promise<WorksFormState> {
  try {
    const { profile, roles } = await requireSchemeAccess(schemeId, "works.decide");
    const r = await withdraw({ schemeId, decisionId, requestId, actor: { profileId: profile.id, roles } });
    await logActivity({ schemeId, actorId: profile.id, action: "WORKS_DECISION_WITHDRAWN", entityType: "WorksRequest", entityId: r.requestId, metadata: { decisionId } });
    revalidateWorks(schemeId, r.requestId);
    return { done: "The proposal has been withdrawn." };
  } catch (err) {
    return failure(err, "The proposal could not be withdrawn.");
  }
}

// ─── Settings ──────────────────────────────────────────────────────────────

/** The committee sets the approval rule, the urgent limit and any Adviser delegation. */
export async function saveWorksSettingsAction(schemeId: string, _prev: WorksFormState, formData: FormData): Promise<WorksFormState> {
  try {
    const { profile } = await requireSchemeAccess(schemeId, "works.settings");
    await requireRecentMfa();
    const checked = checkWorksSettings(Object.fromEntries(formData.entries()));
    if (!checked.ok) return { fieldErrors: checked.fieldErrors };
    const before = await saveWorksSettings(schemeId, profile.id, checked.value);
    const changes = { before: { ...before, updatedAt: undefined }, after: checked.value };
    await logActivity({ schemeId, actorId: profile.id, action: "WORKS_SETTINGS_UPDATED", entityType: "Scheme", entityId: schemeId, metadata: changes });
    await recordSecurityEvent({ action: "works.settings_changed", outcome: "allowed", actorProfileId: profile.id, actorRole: "COMMITTEE", schemeId, resourceType: "WorksSettings", resourceId: schemeId, metadata: changes });
    // Every committee member and the Adviser hear of a change, so one member cannot quietly loosen the rule.
    await notifySettingsChanged({ schemeId, changedById: profile.id, before: changes.before, after: checked.value });
    revalidateWorks(schemeId);
    return { done: "Works settings saved." };
  } catch (err) {
    return failure(err, "The settings could not be saved. Please try again.");
  }
}

export async function setPreferredContractorAction(schemeId: string, _prev: WorksFormState, formData: FormData): Promise<WorksFormState> {
  try {
    const { profile } = await requireSchemeAccess(schemeId, "works.preferred");
    const trade = String(formData.get("trade") ?? "");
    const contractorBusinessId = String(formData.get("contractorBusinessId") ?? "");
    await setPreferredContractor(schemeId, profile.id, trade, contractorBusinessId);
    await logActivity({ schemeId, actorId: profile.id, action: "WORKS_PREFERRED_CONTRACTOR_SET", entityType: "Scheme", entityId: schemeId, metadata: { trade, contractorBusinessId } });
    revalidateWorks(schemeId);
    return { done: `Preferred contractor for ${trade} saved.` };
  } catch (err) {
    return failure(err, "The preferred contractor could not be saved.");
  }
}

export async function removePreferredContractorAction(schemeId: string, trade: string): Promise<WorksFormState> {
  try {
    const { profile } = await requireSchemeAccess(schemeId, "works.preferred");
    if (await removePreferredContractor(schemeId, String(trade ?? ""))) {
      await logActivity({ schemeId, actorId: profile.id, action: "WORKS_PREFERRED_CONTRACTOR_REMOVED", entityType: "Scheme", entityId: schemeId, metadata: { trade } });
    }
    revalidateWorks(schemeId);
    return { done: `Preferred contractor for ${trade} removed.` };
  } catch (err) {
    return failure(err, "The preferred contractor could not be removed.");
  }
}
