import type { NextRequest } from "next/server";
import { db } from "@/prisma/db";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { generateLevyNoticePdf } from "@/lib/pdf/generate";
import { canReadLotDocuments } from "@/lib/finance/finance-access";
import { forbidden } from "@/lib/finance/access-denied";
import { notFound, pdfResponse, signIn, UUID } from "@/lib/pdf/response";

/** The PDF of an issued levy notice (for the scheme's finance team or the lot's owner). */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ noticeId: string }> }) {
  const profile = await getCurrentProfile();
  if (!profile) return signIn();
  const { noticeId } = await params;
  if (!UUID.test(noticeId)) return notFound();
  const notice = await db.orm.public.LevyNotice.where((n) => n.id.eq(noticeId)).first();
  if (!notice || notice.status === "DRAFT") return notFound();
  if (!(await canReadLotDocuments(profile, notice.schemeId, notice.lotId))) {
    return forbidden({ schemeId: notice.schemeId, actorId: profile.id, entityType: "LevyNotice", entityId: notice.id, what: "Levy notice PDF" });
  }
  const pdf = await generateLevyNoticePdf(noticeId, profile.id);
  return pdf ? pdfResponse(pdf) : notFound();
}
