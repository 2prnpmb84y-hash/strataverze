import { forbidden } from "@/lib/finance/access-denied";
import { recordSecurityEventLater } from "@/lib/audit/security-audit";
import type { NextRequest } from "next/server";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { generateOwnerStatementPdf } from "@/lib/pdf/generate";
import { canReadLotDocuments } from "@/lib/finance/finance-access";
import { ISO_DAY, notFound, pdfResponse, signIn, UUID } from "@/lib/pdf/response";

/** An owner levy statement PDF (?schemeId=&lotId=&startDate=&endDate=). */
export async function GET(request: NextRequest) {
  const profile = await getCurrentProfile();
  if (!profile) return signIn();
  const q = request.nextUrl.searchParams;
  const schemeId = q.get("schemeId") ?? "";
  const lotId = q.get("lotId") ?? "";
  const startDate = q.get("startDate") || undefined;
  const endDate = q.get("endDate") || undefined;
  if (!UUID.test(schemeId) || !UUID.test(lotId) || (startDate && !ISO_DAY.test(startDate)) || (endDate && !ISO_DAY.test(endDate))) return notFound();
  if (!(await canReadLotDocuments(profile, schemeId, lotId))) {
    return forbidden({ schemeId, actorId: profile.id, entityType: "Lot", entityId: lotId, what: "Owner statement PDF" });
  }
  const pdf = await generateOwnerStatementPdf({ schemeId, lotId, startDate, endDate, actorId: profile.id });
  if (pdf) {
    await recordSecurityEventLater({
      action: "export.pdf",
      outcome: "allowed",
      actorProfileId: profile.id,
      schemeId,
      resourceType: "Lot",
      resourceId: lotId,
      metadata: { kind: "owner_statement" },
    });
  }
  return pdf ? pdfResponse(pdf) : notFound();
}
