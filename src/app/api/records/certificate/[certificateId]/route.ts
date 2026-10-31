import type { NextRequest } from "next/server";
import { and } from "@prisma/orm-postgres/orm-client";
import { db } from "@/prisma/db";
import { forbidden } from "@/lib/finance/access-denied";
import { recordSecurityEventLater } from "@/lib/audit/security-audit";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { rulesForScheme } from "@/lib/jurisdiction/scheme-rules";
import { schemeToday } from "@/lib/jurisdiction/scheme-time";
import { renderCertificatePdf } from "@/lib/pdf/certificate";
import { issuedOrCurrentDocument } from "@/lib/records/issued-certificate";
import { notFound, pdfResponse, signIn, UUID } from "@/lib/pdf/response";

/**
 * A certificate (NSW s 184, Queensland body corporate certificate) as a PDF
 * (?schemeId=), for the scheme's advisers. An issued certificate is laid out
 * from what it kept when it was issued (issued_content), never from the
 * current pack; a draft, and a certificate issued before migration 20261126,
 * from the building's current pack and details.
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
  const [{ rules }, scheme, lot, today] = await Promise.all([
    rulesForScheme(schemeId),
    db.orm.public.Scheme.where((s) => s.id.eq(schemeId)).first(),
    db.orm.public.Lot.where((l) => l.id.eq(cert.lotId)).first(),
    schemeToday(schemeId),
  ]);
  if (!rules.FEATURES.strataInformationCertificate && !rules.FEATURES.bodyCorporateCertificate) return notFound();
  // An issued certificate reads as it did on the day it was issued; a draft follows the current pack.
  const { document } = issuedOrCurrentDocument({ cert, rules, scheme, lot, today });
  const bytes = await renderCertificatePdf(document);
  await recordSecurityEventLater({ action: "export.pdf", outcome: "allowed", actorProfileId: profile.id, schemeId, resourceType: "Lot", resourceId: cert.lotId, metadata: { kind: "information_certificate" } });
  const fileStem = rules.FEATURES.bodyCorporateCertificate ? "body-corporate-certificate" : "information-certificate";
  return pdfResponse({ bytes, fileName: `${fileStem}-${cert.number}${cert.status === "ISSUED" ? "" : "-draft"}.pdf` });
}
