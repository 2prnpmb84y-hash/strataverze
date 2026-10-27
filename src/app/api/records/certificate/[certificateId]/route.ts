import type { NextRequest } from "next/server";
import { and } from "@prisma/orm-postgres/orm-client";
import { db } from "@/prisma/db";
import { forbidden } from "@/lib/finance/access-denied";
import { recordSecurityEventLater } from "@/lib/audit/security-audit";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { rulesForScheme } from "@/lib/jurisdiction/scheme-rules";
import { schemeToday } from "@/lib/jurisdiction/scheme-time";
import { formatLotLabel } from "@/lib/format";
import { renderCertificatePdf } from "@/lib/pdf/certificate";
import type { CertificateItem } from "@/lib/records/certificate-draft";
import { notFound, pdfResponse, signIn, UUID } from "@/lib/pdf/response";
import { needRule } from "@/config/statutory";

/** A certificate (NSW s 184, Queensland body corporate certificate) as a PDF (?schemeId=), for the scheme's advisers. */
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
  const c = needRule(rules, "CERTIFICATE");
  const types = c.requesterTypes as Readonly<Record<string, string>>;
  const day = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v ?? "")).slice(0, 10);
  const bytes = await renderCertificatePdf({
    schemeName: String(scheme?.name ?? ""),
    planNumber: scheme?.planNumber ? String(scheme.planNumber) : null,
    planLabel: rules.TERMINOLOGY.planLabel,
    planRowLabel: c.planRowLabel,
    title: c.title,
    section: c.section,
    number: cert.number,
    draft: cert.status !== "ISSUED",
    certificateDate: cert.certificateDate ? day(cert.certificateDate) : null,
    lotNumber: formatLotLabel(String(lot?.lotNumber ?? "")),
    requester: { type: types[cert.requesterType] ?? cert.requesterType, name: cert.requesterName, address: cert.requesterAddress },
    authorisedBy: cert.authorisedByType ? { type: types[cert.authorisedByType] ?? cert.authorisedByType, name: String(cert.authorisedByName ?? ""), address: String(cert.authorisedByAddress ?? "") } : null,
    ownersCorporation: rules.TERMINOLOGY.ownersCorporation,
    items: cert.items as unknown as CertificateItem[],
    execution: c.execution,
    executionLines: c.executionLines,
    conclusiveNote: c.conclusiveNote,
    form: c.form,
    follows: c.follows,
    preparedOn: cert.certificateDate ? day(cert.certificateDate) : today,
  });
  await recordSecurityEventLater({ action: "export.pdf", outcome: "allowed", actorProfileId: profile.id, schemeId, resourceType: "Lot", resourceId: cert.lotId, metadata: { kind: "information_certificate" } });
  const fileStem = rules.FEATURES.bodyCorporateCertificate ? "body-corporate-certificate" : "information-certificate";
  return pdfResponse({ bytes, fileName: `${fileStem}-${cert.number}${cert.status === "ISSUED" ? "" : "-draft"}.pdf` });
}
