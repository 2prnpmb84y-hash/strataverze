import type { NextRequest } from "next/server";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { generateStatutoryPackPdf } from "@/lib/pdf/generate";
import { canReadCommitteeReports } from "@/lib/finance/finance-access";
import { forbidden } from "@/lib/finance/access-denied";
import { notFound, pdfResponse, signIn, UUID } from "@/lib/pdf/response";

/** The financial statements PDF for a year (?schemeId=&year=): the locked copy once adopted. */
export async function GET(request: NextRequest) {
  const profile = await getCurrentProfile();
  if (!profile) return signIn();
  const q = request.nextUrl.searchParams;
  const schemeId = q.get("schemeId") ?? "";
  const financialYear = Number(q.get("year"));
  if (!UUID.test(schemeId) || !Number.isInteger(financialYear) || financialYear < 2000 || financialYear > 2100) return notFound();
  if (!(await canReadCommitteeReports(profile, schemeId))) {
    return forbidden({ schemeId, actorId: profile.id, entityType: "Scheme", entityId: schemeId, what: "Statutory statements PDF" });
  }
  const pdf = await generateStatutoryPackPdf({ schemeId, financialYear, actorId: profile.id });
  return pdf ? pdfResponse(pdf) : notFound();
}
