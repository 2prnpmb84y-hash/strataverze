import { forbidden } from "@/lib/finance/access-denied";
import { recordSecurityEventLater } from "@/lib/audit/security-audit";
import type { NextRequest } from "next/server";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { generateCommitteePackPdf } from "@/lib/pdf/generate";
import { canReadCommitteeReports } from "@/lib/finance/finance-access";
import { ISO_DAY, notFound, pdfResponse, signIn, UUID } from "@/lib/pdf/response";

/** The committee financial report PDF (?schemeId=&startDate=&endDate=&year=). */
export async function GET(request: NextRequest) {
  const profile = await getCurrentProfile();
  if (!profile) return signIn();
  const q = request.nextUrl.searchParams;
  const schemeId = q.get("schemeId") ?? "";
  const startDate = q.get("startDate") ?? "";
  const endDate = q.get("endDate") ?? "";
  const financialYear = Number(q.get("year"));
  if (!UUID.test(schemeId) || !ISO_DAY.test(startDate) || !ISO_DAY.test(endDate) || !Number.isInteger(financialYear)) return notFound();
  if (!(await canReadCommitteeReports(profile, schemeId))) {
    return forbidden({ schemeId, actorId: profile.id, entityType: "Scheme", entityId: schemeId, what: "Committee pack PDF" });
  }
  const pdf = await generateCommitteePackPdf({ schemeId, startDate, endDate, financialYear, actorId: profile.id });
  if (pdf) {
    await recordSecurityEventLater({
      action: "export.pdf",
      outcome: "allowed",
      actorProfileId: profile.id,
      schemeId,
      resourceType: "Scheme",
      resourceId: schemeId,
      metadata: { kind: "committee_pack" },
    });
  }
  return pdf ? pdfResponse(pdf) : notFound();
}
