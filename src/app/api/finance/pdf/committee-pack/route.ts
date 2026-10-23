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
  if (!(await canReadCommitteeReports(profile, schemeId))) return notFound();
  const pdf = await generateCommitteePackPdf({ schemeId, startDate, endDate, financialYear, actorId: profile.id });
  return pdf ? pdfResponse(pdf) : notFound();
}
