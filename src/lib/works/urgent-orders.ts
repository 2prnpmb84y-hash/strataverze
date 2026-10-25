/**
 * Urgent work orders (works marketplace stage 2, 25 Oct 2026; plan:
 * https://claude.ai/artifact/VAj6SJ5PrsVry3HJ5RAYbF).
 *
 * When the committee decides a request is urgent, the work order goes
 * straight to the building's preferred contractor for the trade, with the
 * not-to-exceed amount agreed in the decision and no contract. If there is
 * no preferred contractor, or the contractor declines, the committee or the
 * Adviser picks any approved contractor for that order. The contractor
 * accepts or declines in the supplier portal.
 *
 * Every change of state is one UPDATE with its whole filter, and a unique
 * index allows one live order per request, so two people acting at once
 * cannot issue two orders or both answer one. Callers authorise first.
 */
import { and } from "@prisma/orm-postgres/orm-client";
import type { Numeric, TimestampString, Varchar } from "@prisma/orm-postgres/target/codec-types";
import { db } from "@/prisma/db";
import { requestPhotos } from "./requests";

const ts = (v: string) => v as unknown as TimestampString<3>;
const vc = <N extends number>(v: string) => v as unknown as Varchar<N>;

/** Work order states an urgent order passes through here. */
export const LIVE_ORDER_STATUSES = ["AWAITING_ACKNOWLEDGEMENT", "AUTHORISED", "SCHEDULED", "IN_PROGRESS", "COMPLETION_REVIEW", "COMPLETE"] as const;
const isLive = (status: string) => (LIVE_ORDER_STATUSES as readonly string[]).includes(status);

export class UrgentOrderError extends Error {}

function isUniqueViolation(err: unknown): boolean {
  const text = err instanceof Error ? `${err.message} ${JSON.stringify((err as { cause?: unknown }).cause ?? "")} ${String((err as { code?: unknown }).code ?? "")}` : String(err);
  return /23505|unique|duplicate key/i.test(text);
}

/** An order's status for people, in plain words. */
export function orderStatusLabel(status: string): string {
  switch (status) {
    case "AWAITING_ACKNOWLEDGEMENT":
      return "Waiting for the contractor to accept";
    case "AUTHORISED":
      return "Accepted by the contractor";
    case "DECLINED":
      return "Declined by the contractor";
    case "CANCELLED":
      return "Cancelled";
    case "IN_PROGRESS":
      return "Work under way";
    case "COMPLETE":
      return "Complete";
    default:
      return status;
  }
}

/** The urgent decision a request was ordered under (the latest decided one). */
async function urgentDecision(requestId: string) {
  const decided = await db.orm.public.WorksDecision
    .where((d) => and(d.requestId.eq(requestId), d.outcome.eq("URGENT"), d.status.eq("DECIDED")))
    .limit(20)
    .all();
  return decided.sort((a, b) => String(b.decidedAt ?? "").localeCompare(String(a.decidedAt ?? "")))[0] ?? null;
}

/** A request's urgent work orders, newest first. */
export async function ordersForRequest(requestId: string) {
  const rows = await db.orm.public.WorksWorkOrder.where((o) => o.requestId.eq(requestId)).limit(50).all();
  if (!rows.length) return [];
  const businesses = await db.orm.public.ContractorBusiness.where((c) => c.id.in([...new Set(rows.map((r) => r.contractorBusinessId))])).limit(50).all();
  return rows
    .map((o) => {
      const b = businesses.find((x) => x.id === o.contractorBusinessId);
      return {
        id: o.id,
        workOrderNumber: String(o.workOrderNumber),
        status: String(o.status),
        statusLabel: orderStatusLabel(String(o.status)),
        contractorName: String(b?.tradingName || b?.companyName || "Contractor"),
        amountLimit: o.amountLimit != null ? Number(o.amountLimit) : null,
        declineReason: o.declineReason ? String(o.declineReason) : null,
        createdAt: String(o.createdAt),
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Where a request stands for ordering: whether an order can be issued now, and to whom by default. */
export async function orderingState(schemeId: string, requestId: string) {
  const request = await db.orm.public.WorksRequest.where((r) => and(r.id.eq(requestId), r.schemeId.eq(schemeId), r.deletedAt.isNull())).first();
  if (!request) return null;
  const decision = await urgentDecision(requestId);
  const orders = await ordersForRequest(requestId);
  const live = orders.find((o) => isLive(o.status)) ?? null;
  const preferred = request.trade
    ? await db.orm.public.WorksPreferredContractor.where((p) => and(p.schemeId.eq(schemeId), p.trade.eq(request.trade!))).first()
    : null;
  const canIssue = String(request.status) === "PROCUREMENT" && !!request.isEmergency && !!decision && !live;
  return {
    canIssue,
    amount: decision?.amount != null ? Number(decision.amount) : null,
    preferredContractorId: preferred?.contractorBusinessId ?? null,
    orders,
    live,
  };
}

async function nextOrderNumber(schemeId: string): Promise<string> {
  const rows = await db.orm.public.WorksWorkOrder.where((o) => o.schemeId.eq(schemeId)).limit(100000).all();
  const max = rows.reduce((m, r) => Math.max(m, Number(String(r.workOrderNumber).match(/(\d+)$/)?.[1] ?? 0)), 0);
  return `WO-${String(max + 1).padStart(4, "0")}`;
}

export type IssueResult =
  | { issued: true; workOrderId: string; workOrderNumber: string; contractorBusinessId: string }
  | { issued: false; reason: "NO_CONTRACTOR" };

/**
 * Issue the urgent work order for a request the committee decided is urgent.
 * The contractor is the one given, or else the building's preferred
 * contractor for the trade. Without either, nothing is issued and the
 * committee or Adviser is asked to pick one.
 */
export async function issueUrgentOrder(input: { schemeId: string; requestId: string; issuedById: string; contractorBusinessId?: string | null }): Promise<IssueResult> {
  const request = await db.orm.public.WorksRequest.where((r) => and(r.id.eq(input.requestId), r.schemeId.eq(input.schemeId), r.deletedAt.isNull())).first();
  if (!request) throw new UrgentOrderError("Request not found.");
  if (String(request.status) !== "PROCUREMENT" || !request.isEmergency) throw new UrgentOrderError("This request is not waiting for an urgent work order.");
  const decision = await urgentDecision(input.requestId);
  if (!decision || decision.amount == null) throw new UrgentOrderError("The committee has not decided this request is urgent.");
  if ((await ordersForRequest(input.requestId)).some((o) => isLive(o.status))) {
    throw new UrgentOrderError("A work order has already been issued for this request.");
  }

  let contractorBusinessId = input.contractorBusinessId || null;
  if (!contractorBusinessId && request.trade) {
    const preferred = await db.orm.public.WorksPreferredContractor.where((p) => and(p.schemeId.eq(input.schemeId), p.trade.eq(request.trade!))).first();
    contractorBusinessId = preferred?.contractorBusinessId ?? null;
  }
  if (!contractorBusinessId) return { issued: false, reason: "NO_CONTRACTOR" };
  const business = await db.orm.public.ContractorBusiness.where((c) => and(c.id.eq(contractorBusinessId!), c.status.eq("APPROVED"), c.deletedAt.isNull())).first();
  if (!business) {
    if (input.contractorBusinessId) throw new UrgentOrderError("Choose a contractor approved on StrataVerze.");
    // The preferred contractor is no longer approved: ask for another.
    return { issued: false, reason: "NO_CONTRACTOR" };
  }

  const location = request.location ? `\n\nWhere: ${String(request.location)}` : "";
  for (let attempt = 0; attempt < 10; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 10 + Math.floor(Math.random() * 40)));
    const workOrderNumber = await nextOrderNumber(input.schemeId);
    try {
      const order = await db.orm.public.WorksWorkOrder.create({
        schemeId: input.schemeId,
        requestId: input.requestId,
        contractId: null,
        contractorBusinessId: business.id,
        workOrderNumber: vc<30>(workOrderNumber),
        title: vc<300>(String(request.title)),
        description: `${String(request.description ?? "")}${location}`,
        status: "AWAITING_ACKNOWLEDGEMENT",
        amountLimit: decision.amount as unknown as Numeric<12, 2>,
        issuedById: input.issuedById,
      });
      return { issued: true, workOrderId: order.id, workOrderNumber, contractorBusinessId: business.id };
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      // Either the number was taken (try the next) or another order went out
      // for this request at the same moment (stop).
      const live = (await ordersForRequest(input.requestId)).find((o) => isLive(o.status));
      if (live) throw new UrgentOrderError("A work order has just been issued for this request. Reload the page.");
    }
  }
  throw new UrgentOrderError("The work order could not be numbered. Please try again.");
}

/**
 * The contractor accepts or declines an order. Callers check first that the
 * signed-in person is an active contact of the order's contractor business.
 */
export async function respondToOrder(input: { workOrderId: string; contractorBusinessId: string; accept: boolean; reason: string | null; profileId: string }) {
  const order = await db.orm.public.WorksWorkOrder.where((o) => and(o.id.eq(input.workOrderId), o.contractorBusinessId.eq(input.contractorBusinessId))).first();
  if (!order) throw new UrgentOrderError("Work order not found.");
  const reason = input.reason?.trim() || null;
  if (!input.accept && !reason) throw new UrgentOrderError("Say why you cannot take this job, so the committee can arrange someone else.");
  const now = ts(new Date().toISOString());
  const moved = await db.transaction(async (tx) => {
    const n = await tx.orm.public.WorksWorkOrder
      .where((o) => and(o.id.eq(order.id), o.contractorBusinessId.eq(input.contractorBusinessId), o.status.eq("AWAITING_ACKNOWLEDGEMENT")))
      .updateAndCount(input.accept ? { status: "AUTHORISED", acknowledgedAt: now } : { status: "DECLINED", declinedAt: now, declineReason: reason });
    if (n !== 1) return false;
    if (input.accept && order.requestId) {
      await tx.orm.public.WorksRequest.where((r) => and(r.id.eq(order.requestId!), r.status.eq("PROCUREMENT"))).updateAndCount({ status: "DELIVERY" });
    }
    return true;
  });
  if (!moved) throw new UrgentOrderError("This work order has already been answered.");
  return { schemeId: order.schemeId, requestId: order.requestId, workOrderNumber: String(order.workOrderNumber), accepted: input.accept, reason };
}

// ─── The contractor's view ─────────────────────────────────────────────────

/** The contractor businesses the signed-in person is an active contact of. */
export async function myContractorBusinessIds(profileId: string): Promise<string[]> {
  const contacts = await db.orm.public.ContractorContact.where((c) => and(c.profileId.eq(profileId), c.status.eq("ACTIVE"))).limit(50).all();
  return [...new Set(contacts.map((c) => c.contractorBusinessId))];
}

/** Urgent work orders sent to these businesses, newest first. */
export async function ordersForContractor(businessIds: string[]) {
  if (!businessIds.length) return [];
  const rows = await db.orm.public.WorksWorkOrder.where((o) => and(o.contractorBusinessId.in(businessIds), o.requestId.isNotNull())).limit(500).all();
  const schemes = rows.length ? await db.orm.public.Scheme.where((s) => s.id.in([...new Set(rows.map((r) => r.schemeId))])).limit(500).all() : [];
  return rows
    .map((o) => {
      const s = schemes.find((x) => x.id === o.schemeId);
      return {
        id: o.id,
        workOrderNumber: String(o.workOrderNumber),
        title: String(o.title),
        status: String(o.status),
        statusLabel: orderStatusLabel(String(o.status)),
        amountLimit: o.amountLimit != null ? Number(o.amountLimit) : null,
        building: s ? `${String(s.name)}, ${String(s.suburb ?? "")}`.replace(/, $/, "") : "",
        createdAt: String(o.createdAt),
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** One urgent work order as its contractor sees it: full detail and a contact. */
export async function orderForContractor(workOrderId: string, businessIds: string[]) {
  if (!businessIds.length) return null;
  const order = await db.orm.public.WorksWorkOrder.where((o) => and(o.id.eq(workOrderId), o.contractorBusinessId.in(businessIds), o.requestId.isNotNull())).first();
  if (!order || !order.requestId) return null;
  const [scheme, request, issuer] = await Promise.all([
    db.orm.public.Scheme.where((s) => s.id.eq(order.schemeId)).first(),
    db.orm.public.WorksRequest.where((r) => and(r.id.eq(order.requestId!), r.schemeId.eq(order.schemeId))).first(),
    order.issuedById ? db.orm.public.Profile.where((p) => p.id.eq(order.issuedById!)).first() : null,
  ]);
  const photos = await requestPhotos(order.schemeId, order.requestId);
  return {
    id: order.id,
    contractorBusinessId: order.contractorBusinessId,
    workOrderNumber: String(order.workOrderNumber),
    title: String(order.title),
    description: String(order.description ?? ""),
    trade: request?.trade ? String(request.trade) : null,
    location: request?.location ? String(request.location) : null,
    status: String(order.status),
    statusLabel: orderStatusLabel(String(order.status)),
    amountLimit: order.amountLimit != null ? Number(order.amountLimit) : null,
    declineReason: order.declineReason ? String(order.declineReason) : null,
    issuedAt: String(order.createdAt),
    building: scheme ? { name: String(scheme.name), plan: String(scheme.planNumber ?? ""), address: [scheme.address, scheme.suburb, scheme.postcode].filter(Boolean).map(String).join(", ") } : null,
    contact: issuer ? { name: [issuer.firstName, issuer.lastName].filter(Boolean).join(" ") || "The committee", email: issuer.email ? String(issuer.email) : null, phone: issuer.phone ? String(issuer.phone) : null } : null,
    photos,
  };
}
