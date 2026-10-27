import type { NextRequest } from "next/server";
import { forbidden } from "@/lib/finance/access-denied";
import { recordSecurityEventLater } from "@/lib/audit/security-audit";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { and } from "@prisma/orm-postgres/orm-client";
import { canReadLotDocuments, canReadSchemeFinance } from "@/lib/finance/finance-access";
import { ownerMaySeeRequest } from "@/lib/debt-recovery/payment-plan-requests";
import { rulesForScheme } from "@/lib/jurisdiction/scheme-rules";
import { schemeTimeZone } from "@/lib/jurisdiction/scheme-time";
import { storedDayIn } from "@/lib/jurisdiction/time-zone";
import { db } from "@/prisma/db";
import { generatePaymentPlanReplyPdf } from "@/lib/pdf/generate-payment-plan";
import { notFound, pdfResponse, signIn, UUID } from "@/lib/pdf/response";

/** The written reply to a payment plan request (?schemeId=), for the adviser and the lot's owner. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ requestId: string }> }) {
  const profile = await getCurrentProfile();
  if (!profile) return signIn();
  const { requestId } = await params;
  const schemeId = request.nextUrl.searchParams.get("schemeId") ?? "";
  if (!UUID.test(schemeId) || !UUID.test(requestId)) return notFound();
  const row = await db.orm.public.PaymentPlanRequest.where((r) => r.id.eq(requestId)).first();
  if (!row || row.schemeId !== schemeId) return notFound();
  let allowed = await canReadLotDocuments(profile, schemeId, row.lotId);
  if (allowed && !(await canReadSchemeFinance(profile, schemeId))) {
    // An owner of the lot sees only requests made in their own ownership, not the previous owner's.
    const m = await db.orm.public.SchemeMembership.where((x) => and(x.schemeId.eq(schemeId), x.profileId.eq(profile.id), x.lotId.eq(row.lotId), x.role.eq("OWNER"))).first();
    allowed = !!m && ownerMaySeeRequest(row, { profileId: profile.id, ownerSince: storedDayIn(await schemeTimeZone(schemeId), m.startDate) });
  }
  if (!allowed) {
    return forbidden({ schemeId, actorId: profile.id, entityType: "Lot", entityId: row.lotId, what: "Payment plan reply PDF" });
  }
  if (!(await rulesForScheme(schemeId)).rules.FEATURES.statutoryPaymentPlans) return notFound();
  const pdf = await generatePaymentPlanReplyPdf(schemeId, requestId);
  if (!pdf) return notFound();
  await recordSecurityEventLater({
    action: "export.pdf",
    outcome: "allowed",
    actorProfileId: profile.id,
    schemeId,
    resourceType: "PaymentPlanRequest",
    resourceId: requestId,
    metadata: { kind: "payment_plan_reply" },
  });
  return pdfResponse(pdf);
}
