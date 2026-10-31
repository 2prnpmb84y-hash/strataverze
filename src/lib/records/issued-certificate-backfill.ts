/**
 * The backfill for certificates issued before migration 20261126 (server
 * side): each issued certificate with no issued_content keeps what its PDF
 * reads now, from the building's current pack and details, which is what
 * the PDF has shown since it was issued unless the pack's certificate
 * wording or the building's name, plan number or lot number has changed
 * since. It is marked BACKFILL, with the day and the pack it was kept under,
 * so it is never taken for content kept at issue.
 *
 * Run only with Matthew Wrigley's approval, after a rehearsal, by
 * scripts/backfill-issued-certificate-content.ts. A dry run (`apply: false`)
 * writes nothing and returns what would be kept. A row is written only while
 * it is still issued and still has no issued_content.
 */
import { and } from "@prisma/orm-postgres/orm-client";
import { db } from "@/prisma/db";
import { rulesForState } from "@/lib/jurisdiction/scheme-rules";
import { timeZoneOf } from "@/lib/jurisdiction/scheme-time";
import { todayIn } from "@/lib/jurisdiction/time-zone";
import { certificateDocument, issuedCertificateContent, type IssuedCertificateContent } from "./issued-certificate";

export interface BackfilledCertificate {
  id: string;
  schemeId: string;
  number: number;
  /** The pack recorded on the row when it was issued. */
  rulePack: string | null;
  content: IssuedCertificateContent;
  written: boolean;
}

export async function backfillIssuedCertificateContent(options: { apply: boolean; now?: Date }): Promise<BackfilledCertificate[]> {
  const now = options.now ?? new Date();
  const rows = await db.orm.public.SaleCertificate.where((x) => and(x.status.eq("ISSUED"), x.issuedContent.isNull())).orderBy((x) => x.number.asc()).limit(500).all();
  const out: BackfilledCertificate[] = [];
  for (const cert of rows) {
    const [scheme, lot] = await Promise.all([db.orm.public.Scheme.where((s) => s.id.eq(cert.schemeId)).first(), db.orm.public.Lot.where((l) => l.id.eq(cert.lotId)).first()]);
    if (!scheme || !lot) throw new Error(`Certificate ${cert.id}: its building or lot was not found.`);
    const { rules, label } = rulesForState(scheme.state);
    const today = todayIn(timeZoneOf(scheme), now);
    const content = issuedCertificateContent(certificateDocument({ cert, rules, scheme, lot, today }), { source: "BACKFILL", rulePack: cert.rulePack ?? null, keptOn: today, keptUnder: label });
    let written = false;
    if (options.apply) {
      const n = await db.orm.public.SaleCertificate.where((x) => and(x.id.eq(cert.id), x.status.eq("ISSUED"), x.issuedContent.isNull())).updateAndCount({ issuedContent: content as unknown as never });
      written = n === 1;
    }
    out.push({ id: cert.id, schemeId: cert.schemeId, number: cert.number, rulePack: cert.rulePack ?? null, content, written });
  }
  return out;
}
