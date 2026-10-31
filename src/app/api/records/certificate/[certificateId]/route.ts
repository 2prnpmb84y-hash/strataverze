import { NextResponse, type NextRequest } from "next/server";
import { and } from "@prisma/orm-postgres/orm-client";
import { db } from "@/prisma/db";
import { forbidden } from "@/lib/finance/access-denied";
import { recordSecurityEventLater } from "@/lib/audit/security-audit";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { rulesForScheme } from "@/lib/jurisdiction/scheme-rules";
import { schemeToday } from "@/lib/jurisdiction/scheme-time";
import { logError } from "@/lib/log";
import { renderCertificatePdf } from "@/lib/pdf/certificate";
import { PdfFontsUnavailableError } from "@/lib/pdf/document";
import { NO_STORE } from "@/lib/http/no-store";
import { certificateDocument, certificateFileStem, keptContent, renderKeptCertificate } from "@/lib/records/issued-certificate";
import { certificateOffered } from "@/lib/records/offered";
import { notFound, pdfResponse, signIn, UUID } from "@/lib/pdf/response";

/**
 * A certificate (NSW s 184, Queensland body corporate certificate) as a PDF
 * (?schemeId=), for the scheme's advisers. An issued certificate is drawn
 * from what it kept when it was issued (issued_content), in the layout and
 * fonts it was issued with, never from the current pack, so it opens even if
 * the building's pack has since changed. A draft, and a certificate issued
 * before migration 20261126, are drawn from the building's current pack and
 * details.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ certificateId: string }> }) {
  const profile = await getCurrentProfile();
  if (!profile) return signIn();
  const { certificateId } = await params;
  const schemeId = request.nextUrl.searchParams.get("schemeId") ?? "";
  if (!UUID.test(schemeId) || !UUID.test(certificateId)) return notFound();
  const cert = await db.orm.public.SaleCertificate.where((c) => c.id.eq(certificateId)).first();
  if (!cert || cert.schemeId !== schemeId || cert.status === "CANCELLED") return notFound();
  const adviser = await db.orm.public.SchemeMembership.where((m) => and(m.schemeId.eq(schemeId), m.profileId.eq(profile.id), m.role.eq("ADVISER"), m.isActive.eq(true))).first();
  if (!adviser) return forbidden({ schemeId, actorId: profile.id, entityType: "Lot", entityId: cert.lotId, what: "Information certificate PDF" });
  const audit = () => recordSecurityEventLater({ action: "export.pdf", outcome: "allowed", actorProfileId: profile.id, schemeId, resourceType: "Lot", resourceId: cert.lotId, metadata: { kind: "information_certificate" } });

  const kept = cert.status === "ISSUED" ? keptContent(cert.issuedContent) : null;
  if (kept) {
    let pdf: Awaited<ReturnType<typeof renderKeptCertificate>>;
    try {
      pdf = await renderKeptCertificate(kept);
    } catch (err) {
      if (!(err instanceof PdfFontsUnavailableError)) throw err;
      logError(`[certificate] issued certificate ${cert.id}: PDF refused, its fonts are not available`, err);
      return new NextResponse("This certificate's PDF cannot be produced: the fonts it was issued in are not available. Nothing about the certificate has changed. Try again later.", { status: 503, headers: NO_STORE });
    }
    // Still given, as it is drawn from what was issued, but never unseen.
    if (!pdf.matches) logError(`[certificate] issued certificate ${cert.id}: the PDF no longer matches the one issued`, { issued: kept.pdfSha256, now: pdf.sha256, layout: kept.layout });
    await audit();
    return pdfResponse({ bytes: pdf.bytes, fileName: `${kept.fileStem}-${cert.number}.pdf` });
  }

  const [{ rules }, scheme, lot, today] = await Promise.all([
    rulesForScheme(schemeId),
    db.orm.public.Scheme.where((s) => s.id.eq(schemeId)).first(),
    db.orm.public.Lot.where((l) => l.id.eq(cert.lotId)).first(),
    schemeToday(schemeId),
  ]);
  if (!certificateOffered(rules.FEATURES)) return notFound();
  const bytes = await renderCertificatePdf(certificateDocument({ cert, rules, scheme, lot, today }));
  await audit();
  return pdfResponse({ bytes, fileName: `${certificateFileStem(rules)}-${cert.number}${cert.status === "ISSUED" ? "" : "-draft"}.pdf` });
}
