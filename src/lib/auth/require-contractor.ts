import { and } from "@prisma/orm-postgres/orm-client";
import type { TimestampString } from "@prisma/orm-postgres/target/codec-types";
import { db } from "@/prisma/db";
import { AuthorisationError, requireAuth } from "./require-membership";

/**
 * Verify the signed-in user is an ACTIVE contact of the contractor business.
 * Removed or inactive contacts lose access straight away.
 */
export async function requireActiveContractorContact(contractorBusinessId: string) {
  const profile = await requireAuth();
  if (!contractorBusinessId) {
    throw new AuthorisationError("You do not have access to this contractor business.");
  }
  const contact = await db.orm.public.ContractorContact
    .where((c) =>
      and(
        c.profileId.eq(profile.id),
        c.contractorBusinessId.eq(contractorBusinessId),
        c.status.eq("ACTIVE"),
      ),
    )
    .first();
  if (!contact) {
    throw new AuthorisationError("You do not have access to this contractor business.");
  }
  return { profile, contact };
}

/** RFQ states in which a contractor may still submit a quotation. */
export const QUOTABLE_RFQ_STATUSES = ["ISSUED", "CLARIFICATIONS"] as const;

/**
 * Why this contractor may not quote on this RFQ, or null if they may.
 * The RFQ must be open (issued, before its closing date) and the contractor
 * must hold an invitation they have not declined or had withdrawn.
 */
export function quotationProblem(
  rfq: { status: string; closingDate: string | Date } | null | undefined,
  invitation: { status: string } | null | undefined,
  now: Date = new Date(),
): string | null {
  if (!rfq) return "RFQ not found.";
  if (!(QUOTABLE_RFQ_STATUSES as readonly string[]).includes(rfq.status)) {
    return "This RFQ is not open for quotations.";
  }
  if (new Date(rfq.closingDate).getTime() <= now.getTime()) {
    return "This RFQ has closed.";
  }
  if (!invitation || invitation.status === "DECLINED" || invitation.status === "WITHDRAWN") {
    return "Your business was not invited to quote on this RFQ.";
  }
  return null;
}

/**
 * For a contractor's quote document (works stage 3, 25 Oct 2026): the
 * signed-in person must be an active contact of an approved business that
 * is invited to quote on an open marketplace RFQ of this building.
 */
export async function requireQuotingContractor(schemeId: string) {
  const profile = await requireAuth();
  const refuse = () => new AuthorisationError("Only a contractor invited to quote for this building can upload a quote.");
  const contacts = await db.orm.public.ContractorContact.where((c) => and(c.profileId.eq(profile.id), c.status.eq("ACTIVE"))).limit(50).all();
  const ids = [...new Set(contacts.map((c) => c.contractorBusinessId))];
  if (!ids.length) throw refuse();
  const approved = await db.orm.public.ContractorBusiness.where((b) => and(b.id.in(ids), b.status.eq("APPROVED"), b.deletedAt.isNull())).limit(50).all();
  if (!approved.length) throw refuse();
  const invitations = await db.orm.public.WorksRfqInvitation
    .where((i) => and(i.contractorBusinessId.in(approved.map((b) => b.id)), i.status.in(["PENDING", "ACCEPTED"])))
    .limit(500)
    .all();
  if (!invitations.length) throw refuse();
  const open = await db.orm.public.WorksRfq
    .where((r) => and(r.id.in(invitations.map((i) => i.rfqId)), r.schemeId.eq(schemeId), r.marketplace.eq(true), r.status.eq("QUOTING"), r.quoteClosesAt.gt(new Date().toISOString() as unknown as TimestampString<3>)))
    .first();
  if (!open) throw refuse();
  return { profile };
}

/** Work order states in which its contractor is doing, or has done, the work (works stage 4). */
export const WORKING_ORDER_STATUSES = ["AUTHORISED", "COMPLETION_REVIEW", "COMPLETE"] as const;

/**
 * For a contractor's completion photos and invoice (works stage 4, 25 Oct
 * 2026): the signed-in person must be an active contact of an approved
 * business holding an accepted work order of this building.
 */
export async function requireWorkingContractor(schemeId: string) {
  const profile = await requireAuth();
  const refuse = () => new AuthorisationError("Only the contractor doing work for this building can upload this.");
  const contacts = await db.orm.public.ContractorContact.where((c) => and(c.profileId.eq(profile.id), c.status.eq("ACTIVE"))).limit(50).all();
  const ids = [...new Set(contacts.map((c) => c.contractorBusinessId))];
  if (!ids.length) throw refuse();
  const approved = await db.orm.public.ContractorBusiness.where((b) => and(b.id.in(ids), b.status.eq("APPROVED"), b.deletedAt.isNull())).limit(50).all();
  if (!approved.length) throw refuse();
  const order = await db.orm.public.WorksWorkOrder
    .where((o) => and(o.schemeId.eq(schemeId), o.contractorBusinessId.in(approved.map((b) => b.id)), o.requestId.isNotNull(), o.status.in([...WORKING_ORDER_STATUSES])))
    .first();
  if (!order) throw refuse();
  return { profile };
}
