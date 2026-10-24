import { and } from "@prisma/orm-postgres/orm-client";
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
