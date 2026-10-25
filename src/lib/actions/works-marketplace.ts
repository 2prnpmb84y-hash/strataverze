"use server";

/**
 * Works marketplace, stage 1 (25 Oct 2026): owners raise works requests,
 * the committee decides how each is handled by electronic vote, and the
 * committee keeps the building's works settings and preferred contractors.
 * Plan: https://claude.ai/artifact/VAj6SJ5PrsVry3HJ5RAYbF
 */
import { revalidatePath } from "next/cache";
import { and } from "@prisma/orm-postgres/orm-client";
import { AuthorisationError } from "@/lib/auth/require-membership";
import { requireSchemeAccess } from "@/lib/auth/require-access";
import { requireRecentMfa } from "@/lib/auth/mfa-enforcement";
import { recordSecurityEvent } from "@/lib/audit/security-audit";
import { logActivity } from "@/lib/queries/activity-log";
import { uploadErrorMessage } from "@/lib/storage/uploads";
import { logError } from "@/lib/log";
import { checkRequest, getRequest, resubmitRequest, submitRequest, WorksRequestError } from "@/lib/works/requests";
import { proposeQuoteApproval, proposeRoute, proposeVariation, vote, withdraw, WorksDecisionError, decisionsFor } from "@/lib/works/review";
import { notifyVariationDecided, notifyVariationVote } from "@/lib/works/notify";
import { checkWorksSettings, PreferredContractorError, removePreferredContractor, saveWorksSettings, setPreferredContractor } from "@/lib/works/settings";
import { notifyInvited, notifyNotSelected, notifyRfqCancelled, notifyQuoteApproved, notifyQuotesIn, notifyQuoteVote, notifyRfqOpened } from "@/lib/works/notify";
import { notifyDecision, notifyNoContractor, notifyOrderAnswered, notifyOrderCancelled, notifyOrderIssued, notifyRequestSubmitted, notifySettingsChanged, notifyVoteNeeded } from "@/lib/works/notify";
import { cancelUrgentOrder, issueUrgentOrder, myContractorBusinessIds, orderingState, respondToOrder, UrgentOrderError } from "@/lib/works/urgent-orders";
import { requireActiveContractorContact } from "@/lib/auth/require-contractor";
import { db } from "@/prisma/db";
import { ROUTE_OUTCOMES, type RouteOutcome } from "@/lib/works/decision-rules";
import { cancelRfq, checkQuote, closeOutQuotes, reopenAfterOrderEnded, declineInvitation, decodeSummary, eligibleBusinesses, invite, issueQuoteOrder, jobForContractor, MarketplaceError, openRfq, parsePostcodes, rfqForRequest, setDeadlines, setInterest, submitQuote, withdrawQuote } from "@/lib/works/marketplace";
import { isWorksTrade } from "@/config/works";
import { getCurrentProfile } from "@/lib/queries/profiles";

export type WorksFormState = { error?: string; fieldErrors?: Record<string, string>; done?: string; requestId?: string };

function revalidateWorks(schemeId: string, requestId?: string) {
  revalidatePath("/owner/works", "layout");
  revalidatePath(`/adviser/schemes/${schemeId}/works`, "layout");
  if (requestId) revalidatePath(`/owner/works/${requestId}`);
}

function failure(err: unknown, fallback: string): WorksFormState {
  if (err instanceof AuthorisationError) return { error: err.message };
  if (err instanceof WorksRequestError) return { error: err.message, fieldErrors: err.fieldErrors };
  if (err instanceof WorksDecisionError || err instanceof PreferredContractorError || err instanceof MarketplaceError || err instanceof UrgentOrderError) return { error: err.message };
  const upload = uploadErrorMessage(err);
  if (upload) return { fieldErrors: { photos: upload } };
  logError(`[works] ${fallback}`, err);
  return { error: fallback };
}

/** Dollars from a form field ("$2,000" or "2000.50"), or null when blank or not a number. */
function parseDollars(value: FormDataEntryValue | null): number | null {
  const v = String(value ?? "").replace(/[$,\s]/g, "");
  if (!v || !/^\d{1,9}(\.\d{1,2})?$/.test(v)) return null;
  return Number(v);
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

async function afterSettle(schemeId: string, requestId: string, decisionId: string, actorId: string, result: { status: string; applied: boolean }) {
  if (!result.applied || (result.status !== "DECIDED" && result.status !== "NOT_AGREED")) return;
  const request = await getRequest(schemeId, requestId);
  const decision = (await decisionsFor(requestId)).find((d) => d.id === decisionId);
  if (!request || !decision) return;
  await logActivity({
    schemeId,
    actorId,
    action: result.status === "DECIDED" ? "WORKS_DECISION_MADE" : "WORKS_DECISION_NOT_AGREED",
    entityType: "WorksRequest",
    entityId: requestId,
    metadata: { requestNumber: String(request.requestNumber), kind: String(decision.kind), outcome: String(decision.outcome), quotationId: decision.quotationId ?? null, votesFor: decision.votes.filter((v) => v.vote === "FOR").length, votesAgainst: decision.votes.filter((v) => v.vote === "AGAINST").length, byDelegation: !!decision.byDelegation },
  });

  // Agreeing extra cost on an invoice (stage 4): the committee and Adviser are told.
  if (decision.kind === "VARIATION") {
    await notifyVariationDecided({ schemeId, requestId, requestNumber: String(request.requestNumber), agreed: result.status === "DECIDED", byDelegation: !!decision.byDelegation });
    return;
  }

  // Approving a quote (stage 3): the work order goes to that contractor.
  if (decision.kind === "QUOTE") {
    if (result.status === "DECIDED" && decision.quotationId) {
      try {
        await sendQuoteOrder(schemeId, requestId, decision.quotationId, actorId, !!decision.byDelegation);
      } catch (err) {
        logError("[works] quote work order not sent:", err);
      }
    }
    return;
  }

  if (result.status === "DECIDED" && String(decision.outcome) === "URGENT") {
    // The decision stands whatever happens here; the committee or the
    // Adviser can send the order from the request page.
    try {
      await sendUrgentOrder(schemeId, requestId, actorId, null);
    } catch (err) {
      logError("[works] urgent order not sent:", err);
    }
  }
  if (result.status === "DECIDED" && String(decision.outcome) === "QUOTES") {
    // Likewise: the committee or the Adviser can open it from the request page.
    try {
      await openForQuotes(schemeId, requestId, actorId, decodeSummary(decision.summary));
    } catch (err) {
      logError("[works] marketplace RFQ not opened:", err);
    }
  }
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
      amount: parseDollars(formData.get("amount")),
      summary: { title: String(formData.get("summaryTitle") ?? "").slice(0, 300), body: String(formData.get("summary") ?? "").slice(0, 5000) },
    });
    await logActivity({ schemeId, actorId: profile.id, action: "WORKS_DECISION_PROPOSED", entityType: "WorksRequest", entityId: requestId, metadata: { outcome: r.outcome, decisionId: r.decisionId } });
    if (r.status === "WITHDRAWN") return { error: "This request is no longer waiting for the committee. Reload the page." };
    if (r.status === "OPEN") {
      const request = await getRequest(schemeId, requestId);
      if (request) await notifyVoteNeeded({ schemeId, requestId, requestNumber: String(request.requestNumber), title: String(request.title), outcome: r.outcome, proposedById: profile.id, votedIds: [profile.id] });
    }
    await afterSettle(schemeId, requestId, r.decisionId, profile.id, r);
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
    // A vote on spending (approving a quote, or extra cost on an invoice) can decide it.
    const target = await db.orm.public.WorksDecision.where((d) => and(d.id.eq(String(decisionId)), d.schemeId.eq(schemeId))).first();
    if (target && (target.kind === "QUOTE" || target.kind === "VARIATION")) await requireRecentMfa();
    const v = String(formData.get("vote") ?? "");
    // The request comes from the decision itself; a mismatched id is refused.
    const r = await vote({ schemeId, decisionId, requestId, actor: { profileId: profile.id, roles }, vote: v, comment: String(formData.get("comment") ?? "").slice(0, 2000) || null });
    await logActivity({ schemeId, actorId: profile.id, action: "WORKS_DECISION_VOTED", entityType: "WorksRequest", entityId: r.requestId, metadata: { decisionId, vote: v } });
    await afterSettle(schemeId, r.requestId, decisionId, profile.id, r);
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

// ─── Urgent work orders (stage 2) ──────────────────────────────────────────

/**
 * Send the urgent order: to the contractor given, or else the preferred one
 * for the trade. With neither, the committee and the Adviser are asked to
 * choose. Errors are logged, never undo the decision that led here.
 */
async function sendUrgentOrder(schemeId: string, requestId: string, actorId: string, contractorBusinessId: string | null) {
  const request = await getRequest(schemeId, requestId);
  if (!request) return null;
  const r = await issueUrgentOrder({ schemeId, requestId, issuedById: actorId, contractorBusinessId });
  if (!r.issued) {
    await logActivity({ schemeId, actorId, action: "WORKS_ORDER_NO_CONTRACTOR", entityType: "WorksRequest", entityId: requestId, metadata: { requestNumber: String(request.requestNumber), trade: request.trade ? String(request.trade) : null } });
    await notifyNoContractor({ schemeId, requestId, requestNumber: String(request.requestNumber), title: String(request.title), trade: request.trade ? String(request.trade) : null });
    return r;
  }
  const state = await orderingState(schemeId, requestId);
  await logActivity({ schemeId, actorId, action: "WORKS_ORDER_ISSUED", entityType: "WorksRequest", entityId: requestId, metadata: { workOrderNumber: r.workOrderNumber, contractorBusinessId: r.contractorBusinessId, amountLimit: state?.amount ?? null, chosen: !!contractorBusinessId } });
  await notifyOrderIssued({ schemeId, workOrderId: r.workOrderId, workOrderNumber: r.workOrderNumber, title: String(request.title), contractorBusinessId: r.contractorBusinessId, amountLimit: state?.amount ?? null });
  return r;
}

/** The committee or the Adviser sends the urgent order to a contractor they choose (none preferred, or the first declined). */
export async function issueUrgentOrderAction(schemeId: string, requestId: string, _prev: WorksFormState, formData: FormData): Promise<WorksFormState> {
  try {
    const { profile } = await requireSchemeAccess(schemeId, "works.decide");
    await requireRecentMfa();
    const contractorBusinessId = String(formData.get("contractorBusinessId") ?? "");
    if (!contractorBusinessId) return { fieldErrors: { contractorBusinessId: "Choose a contractor." } };
    const r = await sendUrgentOrder(schemeId, requestId, profile.id, contractorBusinessId);
    revalidateWorks(schemeId, requestId);
    if (!r || !r.issued) return { error: "The work order could not be sent. Choose a contractor approved on StrataVerze." };
    return { done: `Work order ${r.workOrderNumber} has been sent. The contractor has been emailed.` };
  } catch (err) {
    if (err instanceof UrgentOrderError) return { error: err.message };
    return failure(err, "The work order could not be sent. Please try again.");
  }
}

/** The committee or the Adviser cancels an order the contractor has not answered, so another can go out. */
export async function cancelUrgentOrderAction(schemeId: string, workOrderId: string, _prev: WorksFormState, formData: FormData): Promise<WorksFormState> {
  try {
    const { profile } = await requireSchemeAccess(schemeId, "works.decide");
    await requireRecentMfa();
    const r = await cancelUrgentOrder({ schemeId, workOrderId, reason: String(formData.get("reason") ?? "").slice(0, 2000) || null });
    await logActivity({ schemeId, actorId: profile.id, action: "WORKS_ORDER_CANCELLED", entityType: "WorksRequest", entityId: r.requestId ?? workOrderId, metadata: { workOrderNumber: r.workOrderNumber } });
    await notifyOrderCancelled({ schemeId, workOrderNumber: r.workOrderNumber, contractorBusinessId: r.contractorBusinessId });
    if (r.requestId) {
      try {
        await reopenAfterOrderEnded(r.requestId);
      } catch (err) {
        logError("[works] quotes not reopened:", err);
      }
    }
    if (r.requestId) revalidateWorks(schemeId, r.requestId);
    return { done: `Work order ${r.workOrderNumber} has been cancelled and the contractor told. You can now send it to another contractor.` };
  } catch (err) {
    if (err instanceof UrgentOrderError) return { error: err.message };
    return failure(err, "The work order could not be cancelled. Please try again.");
  }
}

/** The contractor accepts or declines an urgent order (supplier portal). */
export async function respondToWorkOrderAction(workOrderId: string, _prev: WorksFormState, formData: FormData): Promise<WorksFormState> {
  try {
    const order = await db.orm.public.WorksWorkOrder.where((o) => o.id.eq(String(workOrderId))).first();
    if (!order) return { error: "Work order not found." };
    const { profile } = await requireActiveContractorContact(order.contractorBusinessId);
    const accept = String(formData.get("answer") ?? "") === "ACCEPT";
    const r = await respondToOrder({ workOrderId: order.id, contractorBusinessId: order.contractorBusinessId, accept, reason: String(formData.get("reason") ?? "").slice(0, 2000) || null, profileId: profile.id });
    await logActivity({ schemeId: r.schemeId, actorId: profile.id, action: accept ? "WORKS_ORDER_ACCEPTED" : "WORKS_ORDER_DECLINED", entityType: "WorksRequest", entityId: r.requestId ?? order.id, metadata: { workOrderNumber: r.workOrderNumber, reason: r.reason } });
    const business = await db.orm.public.ContractorBusiness.where((c) => c.id.eq(order.contractorBusinessId)).first();
    await notifyOrderAnswered({ schemeId: r.schemeId, requestId: r.requestId, workOrderNumber: r.workOrderNumber, contractorName: String(business?.tradingName || business?.companyName || "The contractor"), accepted: accept, reason: r.reason });
    // A quote's order declined: the quotes go back to the committee.
    if (!accept && r.requestId) {
      try {
        await reopenAfterOrderEnded(r.requestId);
      } catch (err) {
        logError("[works] quotes not reopened:", err);
      }
    }
    // A quote's order accepted: the other quotes were not selected.
    if (accept && r.requestId) {
      try {
        const closed = await closeOutQuotes(r.requestId);
        if (closed) await notifyNotSelected(closed);
      } catch (err) {
        logError("[works] other quotes not closed:", err);
      }
    }
    revalidatePath("/supplier/work-orders", "layout");
    if (r.requestId) revalidateWorks(r.schemeId, r.requestId);
    return { done: accept ? "Accepted. The building has been told." : "Declined. The building has been told, so it can arrange someone else." };
  } catch (err) {
    if (err instanceof UrgentOrderError) return { error: err.message };
    return failure(err, "Your answer could not be recorded. Please try again.");
  }
}

// ─── Marketplace quotes (stage 3) ──────────────────────────────────────────

/** Open the request on the marketplace and tell the contractors who may quote. */
async function openForQuotes(schemeId: string, requestId: string, actorId: string, summary: { title: string; body: string } | null) {
  const request = await getRequest(schemeId, requestId);
  if (!request) return null;
  // Never the owner's own text: only a summary the committee wrote.
  if (!summary?.title.trim() || !summary.body.trim()) throw new MarketplaceError("Write the title and summary contractors will see first.");
  const rfq = await openRfq({ schemeId, requestId, openedById: actorId, summary });
  const businesses = await eligibleBusinesses(rfq);
  await logActivity({ schemeId, actorId, action: "WORKS_RFQ_OPENED", entityType: "WorksRequest", entityId: requestId, metadata: { rfqNumber: String(rfq.rfqNumber), contractorsTold: businesses.length } });
  await notifyRfqOpened({ rfqId: rfq.id, title: String(rfq.title), trade: String(rfq.trade), suburb: rfq.suburb ? String(rfq.suburb) : null, interestClosesAt: String(rfq.interestClosesAt), businessIds: businesses.map((b) => b.id) });
  return rfq;
}

/** After a quote is approved: the work order to its contractor, and everyone told. */
async function sendQuoteOrder(schemeId: string, requestId: string, quotationId: string, actorId: string, byDelegation: boolean) {
  const request = await getRequest(schemeId, requestId);
  if (!request) return;
  const order = await issueQuoteOrder({ schemeId, requestId, quotationId, issuedById: actorId });
  const business = await db.orm.public.ContractorBusiness.where((c) => c.id.eq(order.contractorBusinessId)).first();
  await logActivity({ schemeId, actorId, action: "WORKS_ORDER_ISSUED", entityType: "WorksRequest", entityId: requestId, metadata: { workOrderNumber: order.workOrderNumber, contractorBusinessId: order.contractorBusinessId, amountLimit: order.amountLimit, fromQuote: quotationId } });
  // The contractor sees the committee's title, never the owner's.
  const rfq = await rfqForRequest(schemeId, requestId);
  await notifyOrderIssued({ schemeId, workOrderId: order.workOrderId, workOrderNumber: order.workOrderNumber, title: String(rfq?.title ?? "Works"), contractorBusinessId: order.contractorBusinessId, amountLimit: order.amountLimit });
  await notifyQuoteApproved({ schemeId, requestId, requestNumber: String(request.requestNumber), title: String(request.title), contractorName: String(business?.tradingName || business?.companyName || "the contractor"), amount: order.amountLimit, raisedById: request.raisedById, byDelegation });
}

/** Open a request for quotes when it did not open with the decision (committee or Adviser). */
export async function openForQuotesAction(schemeId: string, requestId: string, _prev: WorksFormState, formData: FormData): Promise<WorksFormState> {
  try {
    const { profile } = await requireSchemeAccess(schemeId, "works.decide");
    const decided = (await decisionsFor(requestId)).find((d) => d.kind === "ROUTE" && d.outcome === "QUOTES" && d.status === "DECIDED");
    if (!decided) return { error: "The committee has not decided to get quotes for this request." };
    // The summary agreed with the decision, or (for an older decision) the one written now.
    const summary = decodeSummary(decided.summary) ?? { title: String(formData.get("summaryTitle") ?? "").slice(0, 300), body: String(formData.get("summary") ?? "").slice(0, 5000) };
    const rfq = await openForQuotes(schemeId, requestId, profile.id, summary);
    revalidateWorks(schemeId, requestId);
    return rfq ? { done: `${String(rfq.rfqNumber)} is open. Contractors in the trade who work in the area have been told.` } : { error: "Request not found." };
  } catch (err) {
    return failure(err, "The request could not be opened for quotes. Please try again.");
  }
}

/** Invite contractors to quote (any committee member or the Adviser). */
export async function inviteContractorsAction(schemeId: string, requestId: string, rfqId: string, _prev: WorksFormState, formData: FormData): Promise<WorksFormState> {
  try {
    const { profile } = await requireSchemeAccess(schemeId, "works.decide");
    const rfq = await rfqForRequest(schemeId, requestId);
    if (!rfq || rfq.id !== rfqId) return { error: "Not found." };
    const limitText = String(formData.get("inviteLimit") ?? "").trim();
    const r = await invite({
      schemeId,
      rfqId,
      businessIds: formData.getAll("businessId").map(String),
      invitedById: profile.id,
      inviteLimit: limitText ? Number(limitText) : null,
      quoteClosesAt: String(formData.get("quoteClosesAt") ?? "").trim() || null,
    });
    await logActivity({ schemeId, actorId: profile.id, action: "WORKS_CONTRACTORS_INVITED", entityType: "WorksRequest", entityId: requestId, metadata: { rfqNumber: r.rfqNumber, invited: r.invited, quoteClosesAt: r.quoteClosesAt } });
    await notifyInvited({ schemeId, rfqId, rfqNumber: r.rfqNumber, title: String(rfq.title), businessIds: r.invited, quoteClosesAt: r.quoteClosesAt });
    revalidateWorks(schemeId, requestId);
    return { done: r.invited.length ? `Invited ${r.invited.length}. They have been emailed.` : "They were already invited." };
  } catch (err) {
    return failure(err, "The invitations could not be sent. Please try again.");
  }
}

/** Change the interest or quote deadline (committee or Adviser). */
export async function setRfqDeadlinesAction(schemeId: string, requestId: string, rfqId: string, _prev: WorksFormState, formData: FormData): Promise<WorksFormState> {
  try {
    const { profile } = await requireSchemeAccess(schemeId, "works.decide");
    const rfq = await rfqForRequest(schemeId, requestId);
    if (!rfq || rfq.id !== rfqId) return { error: "Not found." };
    const interestClosesAt = String(formData.get("interestClosesAt") ?? "").trim() || null;
    const quoteClosesAt = String(formData.get("quoteClosesAt") ?? "").trim() || null;
    const r = await setDeadlines({ schemeId, rfqId, interestClosesAt, quoteClosesAt });
    await logActivity({ schemeId, actorId: profile.id, action: "WORKS_RFQ_DEADLINE_CHANGED", entityType: "WorksRequest", entityId: requestId, metadata: { rfqNumber: r.rfqNumber, interestClosesAt, quoteClosesAt } });
    revalidateWorks(schemeId, requestId);
    return { done: "Deadline changed." };
  } catch (err) {
    return failure(err, "The deadline could not be changed. Please try again.");
  }
}

/** Propose approving a quote (committee member, or the Adviser under delegation). */
export async function proposeQuoteApprovalAction(schemeId: string, requestId: string, quotationId: string, _prev: WorksFormState, formData: FormData): Promise<WorksFormState> {
  try {
    const { profile, roles } = await requireSchemeAccess(schemeId, "works.decide");
    // It can issue a work order at once (a one-member rule, or the Adviser).
    await requireRecentMfa();
    const r = await proposeQuoteApproval({ schemeId, requestId, quotationId, actor: { profileId: profile.id, roles }, note: String(formData.get("note") ?? "").slice(0, 2000) || null });
    await logActivity({ schemeId, actorId: profile.id, action: "WORKS_DECISION_PROPOSED", entityType: "WorksRequest", entityId: requestId, metadata: { kind: "QUOTE", quotationId, decisionId: r.decisionId } });
    if (r.status === "WITHDRAWN") return { error: "This quote can no longer be approved. Reload the page." };
    if (r.status === "OPEN") {
      const request = await getRequest(schemeId, requestId);
      const quote = await db.orm.public.WorksQuotation.where((q) => q.id.eq(quotationId)).first();
      const business = quote ? await db.orm.public.ContractorBusiness.where((c) => c.id.eq(quote.contractorBusinessId)).first() : null;
      if (request && quote) await notifyQuoteVote({ schemeId, requestId, requestNumber: String(request.requestNumber), contractorName: String(business?.tradingName || business?.companyName || "a contractor"), amount: Number(quote.totalAmount), proposedById: profile.id });
    }
    await afterSettle(schemeId, requestId, r.decisionId, profile.id, r);
    revalidateWorks(schemeId, requestId);
    return { done: r.status === "DECIDED" ? "Approved. The work order has gone to the contractor." : "Proposed. The committee has been asked to vote." };
  } catch (err) {
    return failure(err, "The proposal could not be recorded. Please try again.");
  }
}

/**
 * Propose agreeing an invoice that is more than its work order allowed
 * (works stage 4). The committee votes under the building's rule.
 */
export async function proposeVariationAction(schemeId: string, requestId: string, invoiceId: string, _prev: WorksFormState, formData: FormData): Promise<WorksFormState> {
  try {
    const { profile, roles } = await requireSchemeAccess(schemeId, "works.decide");
    // Agreeing extra spending can decide it at once (a one-member rule, or the Adviser).
    await requireRecentMfa();
    const r = await proposeVariation({ schemeId, requestId, invoiceId, actor: { profileId: profile.id, roles }, note: String(formData.get("note") ?? "").slice(0, 2000) || null });
    await logActivity({ schemeId, actorId: profile.id, action: "WORKS_DECISION_PROPOSED", entityType: "WorksRequest", entityId: requestId, metadata: { kind: "VARIATION", invoiceId, decisionId: r.decisionId, total: r.total, limit: r.limit } });
    if (r.status === "WITHDRAWN") return { error: "This invoice has changed or moved on. Reload the page." };
    if (r.status === "OPEN") {
      const request = await getRequest(schemeId, requestId);
      const invoice = await db.orm.public.WorksInvoice.where((w) => w.id.eq(invoiceId)).first();
      const business = invoice ? await db.orm.public.ContractorBusiness.where((c) => c.id.eq(invoice.contractorBusinessId)).first() : null;
      if (request) await notifyVariationVote({ schemeId, requestId, requestNumber: String(request.requestNumber), contractorName: String(business?.tradingName || business?.companyName || "the contractor"), total: r.total, limit: r.limit, proposedById: profile.id });
    }
    await afterSettle(schemeId, requestId, r.decisionId, profile.id, r);
    revalidateWorks(schemeId, requestId);
    return { done: r.status === "DECIDED" ? "Agreed. The invoice can now be sent for payment approval." : r.status === "NOT_AGREED" ? "Not agreed." : "Proposed. The committee has been asked to vote." };
  } catch (err) {
    return failure(err, "The proposal could not be recorded. Please try again.");
  }
}

// The contractor's side. Each action resolves the person's businesses, then
// checks they are an active contact of the business the job is for.

async function contractorFor(rfqId: string) {
  const profile = await getCurrentProfile();
  if (!profile) throw new AuthorisationError("Please sign in.");
  const ids = await myContractorBusinessIds(profile.id);
  const job = await jobForContractor(String(rfqId), ids);
  if (!job) throw new MarketplaceError("Job not found.");
  await requireActiveContractorContact(job.businessId);
  return { profile, ids, job };
}

/** Express interest in a job, or withdraw it. */
export async function setJobInterestAction(rfqId: string, interested: boolean): Promise<WorksFormState> {
  try {
    const { profile, ids } = await contractorFor(rfqId);
    await setInterest({ rfqId: String(rfqId), businessIds: ids, profileId: profile.id, interested: !!interested });
    revalidatePath("/supplier/quotes", "layout");
    return { done: interested ? "Interest recorded. If the committee invites you, you will be emailed." : "Interest withdrawn." };
  } catch (err) {
    return failure(err, "Your interest could not be recorded. Please try again.");
  }
}

/** Decline an invitation to quote. */
export async function declineJobInvitationAction(rfqId: string, _prev: WorksFormState, formData: FormData): Promise<WorksFormState> {
  try {
    const { ids } = await contractorFor(rfqId);
    const r = await declineInvitation({ rfqId: String(rfqId), businessIds: ids, reason: String(formData.get("reason") ?? "").slice(0, 2000) || null });
    revalidatePath("/supplier/quotes", "layout");
    if (r.requestId) revalidateWorks(r.schemeId, r.requestId);
    return { done: "Declined. The building has been told." };
  } catch (err) {
    return failure(err, "Your answer could not be recorded. Please try again.");
  }
}

/** Submit or change a quote. */
export async function submitJobQuoteAction(rfqId: string, _prev: WorksFormState, formData: FormData): Promise<WorksFormState> {
  try {
    const { profile, ids, job } = await contractorFor(rfqId);
    const checked = checkQuote(Object.fromEntries(formData.entries()));
    if (!checked.ok) return { fieldErrors: checked.fieldErrors };
    const first = !job.quote || job.quote.status !== "SUBMITTED";
    const r = await submitQuote({ rfqId: String(rfqId), businessIds: ids, profileId: profile.id, quote: checked.value });
    await logActivity({ schemeId: r.schemeId, actorId: profile.id, action: "WORKS_QUOTE_SUBMITTED", entityType: "WorksRequest", entityId: r.requestId ?? String(rfqId), metadata: { rfqNumber: r.rfqNumber, total: checked.value.total, changed: !first } });
    // When this quote completes the set, tell the committee straight away.
    if (first && r.requestId) {
      const invitations = await db.orm.public.WorksRfqInvitation.where((i) => and(i.rfqId.eq(String(rfqId)), i.status.in(["PENDING", "ACCEPTED"]))).limit(100).all();
      const quotes = await db.orm.public.WorksQuotation.where((q) => and(q.rfqId.eq(String(rfqId)), q.status.eq("SUBMITTED"))).limit(100).all();
      if (invitations.length && invitations.every((i) => quotes.some((q) => q.contractorBusinessId === i.contractorBusinessId))) {
        await notifyQuotesIn({ schemeId: r.schemeId, requestId: r.requestId, rfqNumber: r.rfqNumber, quotes: quotes.length, allIn: true });
      }
    }
    revalidatePath("/supplier/quotes", "layout");
    if (r.requestId) revalidateWorks(r.schemeId, r.requestId);
    return { done: first ? "Quote submitted. The committee will compare quotes after the deadline." : "Quote updated." };
  } catch (err) {
    return failure(err, "Your quote could not be saved. Please try again.");
  }
}

/** Withdraw a quote before the deadline. */
export async function withdrawJobQuoteAction(rfqId: string): Promise<WorksFormState> {
  try {
    const { ids } = await contractorFor(rfqId);
    await withdrawQuote({ rfqId: String(rfqId), businessIds: ids });
    revalidatePath("/supplier/quotes", "layout");
    return { done: "Quote withdrawn." };
  } catch (err) {
    return failure(err, "Your quote could not be withdrawn. Please try again.");
  }
}

/** A contractor's trades and the postcodes they work in. */
export async function saveServiceAreaAction(businessId: string, _prev: WorksFormState, formData: FormData): Promise<WorksFormState> {
  try {
    const { profile } = await requireActiveContractorContact(String(businessId));
    const trades = [...new Set(formData.getAll("trade").map(String).filter(isWorksTrade))];
    if (!trades.length) return { fieldErrors: { trade: "Choose at least one kind of work." } };
    const postcodes = parsePostcodes(formData.get("postcodes"));
    if (!postcodes.ok) return { fieldErrors: { postcodes: postcodes.error } };
    if (!postcodes.value.length) return { fieldErrors: { postcodes: "List at least one postcode you work in." } };
    await db.orm.public.ContractorBusiness.where((c) => c.id.eq(String(businessId))).updateAndCount({ tradeCategories: trades, servicePostcodes: postcodes.value });
    await recordSecurityEvent({ action: "contractor.service_area_changed", outcome: "allowed", actorProfileId: profile.id, actorRole: "SUPPLIER", resourceType: "ContractorBusiness", resourceId: String(businessId), metadata: { trades, postcodes: postcodes.value.length } });
    revalidatePath("/supplier", "layout");
    return { done: `Saved: ${trades.length} kind${trades.length === 1 ? "" : "s"} of work, ${postcodes.value.length} postcode${postcodes.value.length === 1 ? "" : "s"}.` };
  } catch (err) {
    return failure(err, "Your trades and service area could not be saved. Please try again.");
  }
}

/** Send the work order for an approved quote when it did not go out with the decision (committee or Adviser). */
export async function sendQuoteOrderAction(schemeId: string, requestId: string): Promise<WorksFormState> {
  try {
    const { profile } = await requireSchemeAccess(schemeId, "works.decide");
    await requireRecentMfa();
    const accepted = (await decisionsFor(requestId)).find((d) => d.kind === "QUOTE" && d.status === "DECIDED" && d.quotationId);
    const rfq = await rfqForRequest(schemeId, requestId);
    const quote = rfq ? await db.orm.public.WorksQuotation.where((q) => and(q.rfqId.eq(rfq.id), q.status.eq("ACCEPTED"))).first() : null;
    if (!accepted || !quote) return { error: "No approved quote is waiting for its work order." };
    await sendQuoteOrder(schemeId, requestId, quote.id, profile.id, !!accepted.byDelegation);
    revalidateWorks(schemeId, requestId);
    return { done: "The work order has gone to the contractor." };
  } catch (err) {
    return failure(err, "The work order could not be sent. Please try again.");
  }
}

/** Take a request off the marketplace (committee or Adviser): it goes back to the committee to decide again. */
export async function cancelRfqAction(schemeId: string, requestId: string, rfqId: string, _prev: WorksFormState, formData: FormData): Promise<WorksFormState> {
  try {
    const { profile } = await requireSchemeAccess(schemeId, "works.decide");
    await requireRecentMfa();
    const rfq = await rfqForRequest(schemeId, requestId);
    if (!rfq || rfq.id !== rfqId) return { error: "Not found." };
    const r = await cancelRfq({ schemeId, rfqId, reason: String(formData.get("reason") ?? "").slice(0, 2000) || null });
    await logActivity({ schemeId, actorId: profile.id, action: "WORKS_RFQ_CANCELLED", entityType: "WorksRequest", entityId: requestId, metadata: { rfqNumber: r.rfqNumber } });
    await notifyRfqCancelled({ schemeId, title: r.title, businessIds: r.businessIds });
    revalidateWorks(schemeId, requestId);
    return { done: `${r.rfqNumber} has been taken off the marketplace. The request is back with the committee to decide again.` };
  } catch (err) {
    return failure(err, "The request could not be taken off the marketplace. Please try again.");
  }
}

