/**
 * The committee's review of a works request (server side, 25 Oct 2026).
 *
 * A committee member proposes how the request is handled (urgent, quotes,
 * return or decline). The proposal counts as their vote for it, and it is
 * decided once enough members vote for it under the building's rule (an
 * urgent route needs any one member), or fails once enough vote against.
 * Where the building delegates to the Adviser, the Adviser's decision is
 * made at once and recorded as made under the delegation.
 *
 * Every change of state is one UPDATE with its whole filter (a decision
 * still OPEN, a request still awaiting review), so two people acting at
 * once cannot both decide it. Callers authorise first (works.decide).
 */
import { and } from "@prisma/orm-postgres/orm-client";
import type { Numeric, TimestampString } from "@prisma/orm-postgres/target/codec-types";
import { db } from "@/prisma/db";
import { getWorksSettings } from "./settings";
import { encodeSummary, quoteApprovalProblem } from "./marketplace";
import { isRouteOutcome, ROUTE_OUTCOMES, tally, votesRequired, type RouteOutcome } from "./decision-rules";

const ts = (v: string) => v as unknown as TimestampString<3>;
const money = (v: number) => v.toFixed(2) as unknown as Numeric<12, 2>;
const AWAITING = ["SUBMITTED", "UNDER_REVIEW"];

export class WorksDecisionError extends Error {}

/** The building's committee: active committee members, one entry per person. */
export async function committeeMembers(schemeId: string): Promise<string[]> {
  const rows = await db.orm.public.SchemeMembership
    .where((m) => and(m.schemeId.eq(schemeId), m.role.eq("COMMITTEE"), m.isActive.eq(true)))
    .limit(200)
    .all();
  return [...new Set(rows.map((r) => r.profileId))];
}

export type Actor = { profileId: string; roles: readonly string[] };

/** The request's open decision, of any kind (a route, or approving a quote). */
export async function openDecision(requestId: string) {
  return db.orm.public.WorksDecision.where((d) => and(d.requestId.eq(requestId), d.status.eq("OPEN"))).first();
}

/** True for a Postgres unique violation, wherever the driver puts the code. */
function isUniqueViolation(err: unknown): boolean {
  const text = err instanceof Error ? `${err.message} ${JSON.stringify((err as { cause?: unknown }).cause ?? "")} ${String((err as { code?: unknown }).code ?? "")}` : String(err);
  return /23505|unique|duplicate key/i.test(text);
}

/** Thrown inside a transaction to undo it; never reaches the caller. */
class Undo extends Error {}

/** An open proposal can be withdrawn by anyone on the committee (or the Adviser) after this long. */
export const STALE_PROPOSAL_DAYS = 7;

/**
 * Propose how a request is handled. Returns the decision and where it stands
 * (it may be decided at once: an urgent route, a one-member rule, or the
 * Adviser under delegation).
 */
export async function proposeRoute(input: { schemeId: string; requestId: string; actor: Actor; outcome: string; note: string | null; returnReason?: string | null; amount?: number | null; summary?: { title: string; body: string } | null }) {
  if (!isRouteOutcome(input.outcome)) throw new WorksDecisionError("Choose how the request is handled.");
  const outcome: RouteOutcome = input.outcome;
  // An urgent order carries the most it may cost (works stage 2).
  const amount = outcome === "URGENT" ? input.amount ?? null : null;
  if (outcome === "URGENT" && (amount == null || !Number.isFinite(amount) || amount <= 0 || amount > 999_999_999)) {
    throw new WorksDecisionError("Give the most the urgent work may cost, in dollars.");
  }
  if (outcome === "RETURN" && !input.returnReason?.trim()) throw new WorksDecisionError("Say what the owner needs to add.");
  if (outcome === "DECLINE" && !input.note?.trim()) throw new WorksDecisionError("Give the reason for declining. The owner is told it.");
  // What contractors see before they are invited (works stage 3).
  const summary = outcome === "QUOTES" ? input.summary ?? null : null;
  if (outcome === "QUOTES" && (!summary?.title.trim() || !summary.body.trim())) {
    throw new WorksDecisionError("Write the title and summary contractors will see. Leave out names and unit numbers.");
  }
  const request = await db.orm.public.WorksRequest.where((r) => and(r.id.eq(input.requestId), r.schemeId.eq(input.schemeId), r.deletedAt.isNull())).first();
  if (!request) throw new WorksDecisionError("Request not found.");
  if (!AWAITING.includes(String(request.status))) throw new WorksDecisionError("This request is not waiting for the committee.");
  if (await openDecision(input.requestId)) throw new WorksDecisionError("A decision on this request is already open. Vote on it, or withdraw it first.");

  const members = await committeeMembers(input.schemeId);
  const isMember = members.includes(input.actor.profileId);
  const isAdviser = input.actor.roles.includes("ADVISER");
  const settings = await getWorksSettings(input.schemeId);
  let rule: string;
  let required: number;
  let byDelegation = false;
  if (isMember) {
    // Any one member may order urgent works once the building has set an
    // urgent spending limit, and only for an amount
    // within the limit. Over it, or with no limit set, it needs the usual rule.
    const withinUrgentLimit = outcome === "URGENT" && settings.urgentLimit != null && amount != null && amount <= settings.urgentLimit;
    const r = votesRequired(settings.approvalRule, members.length, { urgent: withinUrgentLimit });
    if (!r) throw new WorksDecisionError("The building has no committee members to decide.");
    rule = r.rule;
    required = r.required;
  } else if (isAdviser && settings.adviserMayDecide) {
    if (amount != null && settings.adviserLimit != null && amount > settings.adviserLimit) {
      throw new WorksDecisionError(`That is over the most the committee lets the Adviser approve ($${settings.adviserLimit.toLocaleString("en-AU")}). The committee decides this one.`);
    }
    rule = "DELEGATED";
    required = 1;
    byDelegation = true;
  } else if (isAdviser) {
    throw new WorksDecisionError("The committee decides this. The building has not delegated works decisions to the Adviser.");
  } else {
    throw new WorksDecisionError("Only the committee can decide this.");
  }

  // For a return, the note is what the owner is asked to add; it is shown to them.
  const note = (outcome === "RETURN" ? input.returnReason?.trim() : input.note?.trim()) || null;
  let decision;
  try {
    decision = await db.transaction(async (tx) => {
      // First, and with its whole filter: the request must still be waiting.
      // This takes the request's row lock, so a decision being applied at the
      // same moment either finishes first (and this finds nothing) or waits.
      const waiting = await tx.orm.public.WorksRequest
        .where((r) => and(r.id.eq(input.requestId), r.schemeId.eq(input.schemeId), r.status.in(AWAITING)))
        .updateAndCount({ status: "UNDER_REVIEW" });
      if (waiting !== 1) throw new Undo("not waiting");
      const d = await tx.orm.public.WorksDecision.create({
        schemeId: input.schemeId,
        requestId: input.requestId,
        kind: "ROUTE",
        outcome,
        note,
        proposedById: input.actor.profileId,
        rule,
        requiredVotes: required,
        committeeSize: members.length,
        status: "OPEN",
        byDelegation,
        amount: amount == null ? null : money(amount),
        summary: summary ? encodeSummary(summary.title, summary.body) : null,
      });
      await tx.orm.public.WorksDecisionVote.create({ decisionId: d.id, voterId: input.actor.profileId, vote: "FOR", comment: null });
      return d;
    });
  } catch (err) {
    if (err instanceof Undo) throw new WorksDecisionError("This request is no longer waiting for the committee. Reload the page.");
    // The one-open-decision index: someone else proposed at the same moment.
    if (isUniqueViolation(err)) throw new WorksDecisionError("Someone else has just proposed a decision on this request. Reload the page to vote on it.");
    throw err;
  }
  const settled = await settle(decision.id);
  return { decisionId: decision.id, requestId: input.requestId, outcome, ...settled };
}

async function loadDecision(schemeId: string, decisionId: string, requestId?: string) {
  const decision = await db.orm.public.WorksDecision.where((d) => and(d.id.eq(decisionId), d.schemeId.eq(schemeId))).first();
  // A request id given with the decision must be the decision's own.
  if (!decision || (requestId !== undefined && decision.requestId !== requestId)) throw new WorksDecisionError("Decision not found.");
  return decision;
}

/** Vote on an open decision. Committee members only, once each. */
export async function vote(input: { schemeId: string; decisionId: string; requestId?: string; actor: Actor; vote: string; comment: string | null }) {
  if (input.vote !== "FOR" && input.vote !== "AGAINST") throw new WorksDecisionError("Vote for or against.");
  const decision = await loadDecision(input.schemeId, input.decisionId, input.requestId);
  if (decision.status !== "OPEN") throw new WorksDecisionError("This decision has already been settled.");
  const members = await committeeMembers(input.schemeId);
  if (!members.includes(input.actor.profileId)) throw new WorksDecisionError("Only committee members vote.");
  // The unique index on (decision, voter) is what stops a second vote made at the same moment.
  const already = await db.orm.public.WorksDecisionVote.where((v) => and(v.decisionId.eq(decision.id), v.voterId.eq(input.actor.profileId))).first();
  if (already) throw new WorksDecisionError("You have already voted on this decision.");
  try {
    await db.transaction(async (tx) => {
      // Lock the decision while it is still open, so it cannot be settled or
      // withdrawn between this check and the vote being stored.
      const open = await tx.orm.public.WorksDecision.where((d) => and(d.id.eq(decision.id), d.status.eq("OPEN"))).updateAndCount({ status: "OPEN" });
      if (open !== 1) throw new Undo("settled");
      await tx.orm.public.WorksDecisionVote.create({ decisionId: decision.id, voterId: input.actor.profileId, vote: input.vote, comment: input.comment?.trim() || null });
    });
  } catch (err) {
    if (err instanceof Undo) throw new WorksDecisionError("This decision has already been settled.");
    if (isUniqueViolation(err)) throw new WorksDecisionError("You have already voted on this decision.");
    throw err;
  }
  return { requestId: String(decision.requestId), ...(await settle(decision.id)) };
}

/**
 * Withdraw an open decision; the request goes back to waiting. Whoever
 * proposed it can at any time. Anyone on the committee, or the Adviser, can
 * once its proposer has left the committee or it has been open for
 * STALE_PROPOSAL_DAYS, so a proposal nobody can settle does not block the
 * request for good.
 */
export async function withdraw(input: { schemeId: string; decisionId: string; requestId?: string; actor: Actor }) {
  const decision = await loadDecision(input.schemeId, input.decisionId, input.requestId);
  if (decision.status !== "OPEN") throw new WorksDecisionError("This decision has already been settled.");
  if (!(await mayWithdraw(input.schemeId, decision, input.actor))) {
    throw new WorksDecisionError(`Only the member who proposed it can withdraw it, until it has been open ${STALE_PROPOSAL_DAYS} days.`);
  }
  const done = await db.transaction(async (tx) => {
    const n = await tx.orm.public.WorksDecision
      .where((d) => and(d.id.eq(decision.id), d.status.eq("OPEN")))
      .updateAndCount({ status: "WITHDRAWN", decidedAt: ts(new Date().toISOString()) });
    if (n !== 1) return false;
    await tx.orm.public.WorksRequest
      .where((r) => and(r.id.eq(decision.requestId), r.status.eq("UNDER_REVIEW")))
      .updateAndCount({ status: "SUBMITTED" });
    return true;
  });
  if (!done) throw new WorksDecisionError("This decision has already been settled.");
  return { status: "WITHDRAWN" as const, requestId: String(decision.requestId) };
}

/** Whether this person may withdraw this open decision now (see withdraw). */
export async function mayWithdraw(schemeId: string, decision: { proposedById: string; createdAt: unknown }, actor: Actor): Promise<boolean> {
  if (decision.proposedById === actor.profileId) return true;
  const members = await committeeMembers(schemeId);
  const onCommittee = members.includes(actor.profileId);
  const isAdviser = actor.roles.includes("ADVISER");
  if (!onCommittee && !isAdviser) return false;
  const proposerLeft = !members.includes(decision.proposedById);
  const ageDays = (Date.now() - new Date(String(decision.createdAt)).getTime()) / 86_400_000;
  return proposerLeft || ageDays >= STALE_PROPOSAL_DAYS;
}

/**
 * Settle a decision if its votes now decide it. Marking it DECIDED (or
 * NOT_AGREED) and applying the outcome to the request happen in one
 * transaction, each with its whole filter: the decision must still be open
 * and the request still waiting for the committee. If the request has moved
 * on (another decision got there first), nothing is applied and the decision
 * is withdrawn. Safe to call more than once.
 */
export async function settle(decisionId: string): Promise<{ status: string; tally: ReturnType<typeof tally>; applied: boolean }> {
  const decision = await db.orm.public.WorksDecision.where((d) => d.id.eq(decisionId)).first();
  if (!decision) throw new WorksDecisionError("Decision not found.");
  const votes = await db.orm.public.WorksDecisionVote.where((v) => v.decisionId.eq(decisionId)).limit(500).all();
  const t = tally(Number(decision.requiredVotes), Number(decision.committeeSize), votes);
  if (decision.status !== "OPEN" || t.status === "OPEN") return { status: String(decision.status), tally: t, applied: false };

  if (decision.kind === "QUOTE") return settleQuote(decision, t);

  const now = new Date().toISOString();
  const outcome = String(decision.outcome) as RouteOutcome;
  const o = ROUTE_OUTCOMES[outcome];
  const returnReason = outcome === "RETURN" ? String(decision.note ?? "") || "The committee asked for more detail." : null;
  try {
    await db.transaction(async (tx) => {
      const claimed = await tx.orm.public.WorksDecision
        .where((d) => and(d.id.eq(decisionId), d.status.eq("OPEN")))
        .updateAndCount({ status: t.status, decidedAt: ts(now) });
      if (claimed !== 1) throw new Undo("already settled");
      if (t.status === "NOT_AGREED") {
        await tx.orm.public.WorksRequest
          .where((r) => and(r.id.eq(decision.requestId), r.status.eq("UNDER_REVIEW")))
          .updateAndCount({ status: "SUBMITTED" });
        return;
      }
      const applied = await tx.orm.public.WorksRequest
        .where((r) => and(r.id.eq(decision.requestId), r.schemeId.eq(decision.schemeId), r.status.in(AWAITING)))
        .updateAndCount({
          status: o.status,
          ...(outcome === "URGENT" ? { isEmergency: true, isUrgent: true } : {}),
          returnReason: outcome === "RETURN" ? returnReason : null,
          closedAt: outcome === "DECLINE" ? ts(now) : null,
        });
      if (applied !== 1) throw new Undo("request moved on");
      await tx.orm.public.WorksRequestReview.create({
        requestId: decision.requestId,
        reviewerId: decision.proposedById,
        outcome: o.review,
        procurementRoute: o.procurementRoute,
        comments: decision.note ?? null,
        returnReason,
      });
    });
  } catch (err) {
    if (!(err instanceof Undo)) throw err;
    if (err.message === "request moved on") {
      // The request is no longer waiting: this decision can no longer apply.
      await db.orm.public.WorksDecision.where((d) => and(d.id.eq(decisionId), d.status.eq("OPEN"))).updateAndCount({ status: "WITHDRAWN", decidedAt: ts(now) });
      return { status: "WITHDRAWN", tally: t, applied: false };
    }
    const fresh = await db.orm.public.WorksDecision.where((d) => d.id.eq(decisionId)).first();
    return { status: String(fresh?.status ?? t.status), tally: t, applied: false };
  }
  return { status: t.status, tally: t, applied: true };
}

/** A request's decisions with their votes, newest first. */
export async function decisionsFor(requestId: string) {
  const decisions = await db.orm.public.WorksDecision.where((d) => d.requestId.eq(requestId)).orderBy((d) => d.createdAt.desc()).limit(50).all();
  if (!decisions.length) return [];
  const votes = await db.orm.public.WorksDecisionVote.where((v) => v.decisionId.in(decisions.map((d) => d.id))).limit(2000).all();
  return decisions.map((d) => ({ ...d, votes: votes.filter((v) => v.decisionId === d.id) }));
}

/** Open decisions in the building a member has not voted on yet. */
export async function awaitingMyVote(schemeId: string, profileId: string) {
  const open = await db.orm.public.WorksDecision.where((d) => and(d.schemeId.eq(schemeId), d.status.eq("OPEN"))).limit(200).all();
  if (!open.length) return [];
  const mine = await db.orm.public.WorksDecisionVote.where((v) => and(v.decisionId.in(open.map((d) => d.id)), v.voterId.eq(profileId))).limit(200).all();
  return open.filter((d) => !mine.some((v) => v.decisionId === d.id));
}

// ─── Approving a quote (works stage 3) ─────────────────────────────────────

/**
 * Propose approving a marketplace quote. A committee member's proposal
 * counts as their vote and needs the building's usual rule; the Adviser may
 * decide it under a delegation, up to the Adviser's limit. Over $30,000 at
 * least two quotes are needed (SSMA s 102).
 */
export async function proposeQuoteApproval(input: { schemeId: string; requestId: string; quotationId: string; actor: Actor; note: string | null }) {
  const check = await quoteApprovalProblem(input.quotationId);
  if (!check.quote || check.schemeId !== input.schemeId || check.requestId !== input.requestId) throw new WorksDecisionError("Quote not found.");
  if (check.problem) throw new WorksDecisionError(check.problem);
  if (await openDecision(input.requestId)) throw new WorksDecisionError("A decision on this request is already open. Vote on it, or withdraw it first.");
  const members = await committeeMembers(input.schemeId);
  const isMember = members.includes(input.actor.profileId);
  const settings = await getWorksSettings(input.schemeId);
  let rule: string;
  let required: number;
  let byDelegation = false;
  if (isMember) {
    const r = votesRequired(settings.approvalRule, members.length);
    if (!r) throw new WorksDecisionError("The building has no committee members to decide.");
    rule = r.rule;
    required = r.required;
  } else if (input.actor.roles.includes("ADVISER") && settings.adviserMayDecide) {
    if (settings.adviserLimit != null && check.quote.total > settings.adviserLimit) {
      throw new WorksDecisionError(`That is over the most the committee lets the Adviser approve ($${settings.adviserLimit.toLocaleString("en-AU")}). The committee decides this one.`);
    }
    rule = "DELEGATED";
    required = 1;
    byDelegation = true;
  } else {
    throw new WorksDecisionError("Only the committee can approve a quote.");
  }
  let decision;
  try {
    decision = await db.transaction(async (tx) => {
      const d = await tx.orm.public.WorksDecision.create({
        schemeId: input.schemeId,
        requestId: input.requestId,
        kind: "QUOTE",
        outcome: "APPROVE",
        note: input.note?.trim() || null,
        proposedById: input.actor.profileId,
        rule,
        requiredVotes: required,
        committeeSize: members.length,
        status: "OPEN",
        byDelegation,
        amount: money(check.quote!.total),
        quotationId: input.quotationId,
      });
      await tx.orm.public.WorksDecisionVote.create({ decisionId: d.id, voterId: input.actor.profileId, vote: "FOR", comment: null });
      return d;
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new WorksDecisionError("Someone else has just proposed approving a quote. Reload the page to vote on it.");
    throw err;
  }
  const settled = await settle(decision.id);
  return { decisionId: decision.id, requestId: input.requestId, ...settled };
}

/**
 * Settle a QUOTE decision: in one transaction, mark it decided, accept the
 * quote (still submitted, the two-quote rule still met), decline any quote
 * accepted before (a re-award after a decline), mark the RFQ awarded and the
 * request approved. If anything has moved on, nothing is applied and the
 * decision is withdrawn. The work order is issued by the caller.
 */
async function settleQuote(decision: { id: string; requestId: string; quotationId?: string | null; amount?: unknown }, t: ReturnType<typeof tally>): Promise<{ status: string; tally: ReturnType<typeof tally>; applied: boolean }> {
  const now = new Date().toISOString();
  try {
    await db.transaction(async (tx) => {
      const claimed = await tx.orm.public.WorksDecision.where((d) => and(d.id.eq(decision.id), d.status.eq("OPEN"))).updateAndCount({ status: t.status, decidedAt: ts(now) });
      if (claimed !== 1) throw new Undo("already settled");
      if (t.status === "NOT_AGREED") return;
      if (!decision.quotationId) throw new Undo("request moved on");
      const check = await quoteApprovalProblem(decision.quotationId);
      if (check.problem || !check.quote) throw new Undo("request moved on");
      // Only the quote as it was when proposed: the same total the committee voted on.
      if (decision.amount == null) throw new Undo("request moved on");
      const accepted = await tx.orm.public.WorksQuotation
        .where((q) => and(q.id.eq(decision.quotationId!), q.status.eq("SUBMITTED"), q.totalAmount.eq(decision.amount as unknown as Numeric<12, 2>)))
        .updateAndCount({ status: "ACCEPTED" });
      if (accepted !== 1) throw new Undo("request moved on");
      await tx.orm.public.WorksQuotation.where((q) => and(q.rfqId.eq(check.quote!.rfqId), q.status.eq("ACCEPTED"), q.id.neq(decision.quotationId!))).updateAndCount({ status: "DECLINED" });
      const awarded = await tx.orm.public.WorksRfq.where((r) => and(r.id.eq(check.quote!.rfqId), r.status.in(["QUOTING", "CLOSED"]))).updateAndCount({ status: "AWARDED", closedAt: ts(now) });
      if (awarded !== 1) throw new Undo("request moved on");
      const request = await tx.orm.public.WorksRequest
        .where((r) => and(r.id.eq(decision.requestId), r.status.in(["PROCUREMENT", "APPROVAL"])))
        .updateAndCount({ status: "APPROVAL" });
      if (request !== 1) throw new Undo("request moved on");
    });
  } catch (err) {
    if (!(err instanceof Undo)) throw err;
    if (err.message === "request moved on") {
      await db.orm.public.WorksDecision.where((d) => and(d.id.eq(decision.id), d.status.eq("OPEN"))).updateAndCount({ status: "WITHDRAWN", decidedAt: ts(now) });
      return { status: "WITHDRAWN", tally: t, applied: false };
    }
    const fresh = await db.orm.public.WorksDecision.where((d) => d.id.eq(decision.id)).first();
    return { status: String(fresh?.status ?? t.status), tally: t, applied: false };
  }
  return { status: t.status, tally: t, applied: true };
}

