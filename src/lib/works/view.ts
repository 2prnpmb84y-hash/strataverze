/**
 * What a works request page shows, and what the viewer may do on it
 * (server side, 25 Oct 2026). The page authorises first; this only works
 * out the viewer's choices from their roles on the building.
 */
import { and } from "@prisma/orm-postgres/orm-client";
import { db } from "@/prisma/db";
import { getWorksSettings } from "./settings";
import { committeeMembers, decisionsFor } from "./review";
import { requestPhotos } from "./requests";
import { ROUTE_OUTCOMES, isRouteOutcome, requestStatusLabel, tally, votesSentence } from "./decision-rules";

export interface DecisionVoteView {
  voterName: string;
  vote: "FOR" | "AGAINST";
  comment: string | null;
  at: string;
}

export interface DecisionView {
  id: string;
  outcome: string;
  outcomeLabel: string;
  note: string | null;
  proposedByName: string;
  status: string;
  byDelegation: boolean;
  required: number;
  votesSentence: string;
  votes: DecisionVoteView[];
  createdAt: string;
  decidedAt: string | null;
}

export interface RequestViewer {
  isCommitteeMember: boolean;
  isAdviser: boolean;
  isRaiser: boolean;
  /** Propose a decision now (committee member, or the Adviser under delegation). */
  canPropose: boolean;
  /** Vote on the open decision now. */
  canVote: boolean;
  /** Withdraw the open decision (whoever proposed it). */
  canWithdraw: boolean;
  /** Change a returned request and send it again (whoever raised it). */
  canResubmit: boolean;
  /** Why the Adviser cannot decide, when they cannot. */
  adviserNote: string | null;
}

const AWAITING = ["SUBMITTED", "UNDER_REVIEW"];

async function names(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map();
  const rows = await db.orm.public.Profile.where((p) => p.id.in(unique)).limit(500).all();
  return new Map(rows.map((p) => [p.id, [p.firstName, p.lastName].filter(Boolean).join(" ") || "A member"]));
}

export async function loadRequestView(schemeId: string, requestId: string, viewer: { profileId: string; roles: readonly string[] }) {
  const request = await db.orm.public.WorksRequest.where((r) => and(r.id.eq(requestId), r.schemeId.eq(schemeId), r.deletedAt.isNull())).first();
  if (!request) return null;

  const [members, decisions, settings, photos] = await Promise.all([
    committeeMembers(schemeId),
    decisionsFor(requestId),
    getWorksSettings(schemeId),
    requestPhotos(schemeId, requestId),
  ]);
  const who = await names([request.raisedById, ...decisions.flatMap((d) => [d.proposedById, ...d.votes.map((v) => v.voterId)])]);

  const decisionViews: DecisionView[] = decisions.map((d) => {
    const required = Number(d.requiredVotes);
    const t = tally(required, Number(d.committeeSize), d.votes);
    const outcome = String(d.outcome);
    return {
      id: d.id,
      outcome,
      outcomeLabel: isRouteOutcome(outcome) ? ROUTE_OUTCOMES[outcome].label : outcome,
      note: d.note ? String(d.note) : null,
      proposedByName: who.get(d.proposedById) ?? "A member",
      status: String(d.status),
      byDelegation: !!d.byDelegation,
      required,
      votesSentence: d.status === "WITHDRAWN" ? "Withdrawn." : d.byDelegation && d.status === "DECIDED" ? "Decided by the Adviser under the building's delegation." : votesSentence(t, required),
      votes: d.votes.map((v) => ({ voterName: who.get(v.voterId) ?? "A member", vote: v.vote === "AGAINST" ? "AGAINST" : "FOR", comment: v.comment ? String(v.comment) : null, at: String(v.createdAt) })),
      createdAt: String(d.createdAt),
      decidedAt: d.decidedAt ? String(d.decidedAt) : null,
    };
  });

  const open = decisions.find((d) => d.status === "OPEN") ?? null;
  const isCommitteeMember = members.includes(viewer.profileId);
  const isAdviser = viewer.roles.includes("ADVISER");
  const isRaiser = request.raisedById === viewer.profileId;
  const awaiting = AWAITING.includes(String(request.status));
  const mayDecide = isCommitteeMember || (isAdviser && settings.adviserMayDecide);

  const can: RequestViewer = {
    isCommitteeMember,
    isAdviser,
    isRaiser,
    canPropose: awaiting && !open && mayDecide,
    canVote: !!open && isCommitteeMember && !open.votes.some((v) => v.voterId === viewer.profileId),
    canWithdraw: !!open && open.proposedById === viewer.profileId,
    canResubmit: isRaiser && request.status === "DRAFT" && !!request.returnReason,
    adviserNote:
      isAdviser && !isCommitteeMember && !settings.adviserMayDecide
        ? "The committee decides works requests. The building has not delegated these decisions to the Adviser."
        : null,
  };

  return {
    request: {
      id: request.id,
      requestNumber: String(request.requestNumber),
      title: String(request.title),
      trade: request.trade ? String(request.trade) : null,
      location: request.location ? String(request.location) : null,
      description: String(request.description ?? ""),
      isEmergency: !!request.isEmergency,
      status: String(request.status),
      statusLabel: requestStatusLabel({ status: String(request.status), isEmergency: !!request.isEmergency, returnReason: request.returnReason ? String(request.returnReason) : null }),
      returnReason: request.returnReason ? String(request.returnReason) : null,
      raisedByName: who.get(request.raisedById) ?? "A member",
      submittedAt: request.submittedAt ? String(request.submittedAt) : null,
      createdAt: String(request.createdAt),
    },
    photos,
    decisions: decisionViews,
    openDecisionId: open?.id ?? null,
    committeeSize: members.length,
    settings,
    can,
  };
}

export type RequestView = NonNullable<Awaited<ReturnType<typeof loadRequestView>>>;
