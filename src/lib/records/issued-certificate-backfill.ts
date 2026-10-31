/**
 * The backfill for certificates issued before migration 20261126 (server
 * side): each issued certificate with no issued_content keeps what its PDF
 * reads now, from the building's current pack and details, in the current
 * layout, with the SHA-256 of that PDF. That is what the PDF has shown since
 * it was issued only if the pack's certificate wording and the building's
 * name, plan number and lot number have not changed since. It is marked
 * BACKFILL, with the day and the pack it was kept under, and the certificate
 * page says it was reconstructed, so it is never taken for content kept at
 * issue.
 *
 * A certificate whose recorded rule pack (rule_pack, the pack it was issued
 * under) is not the pack it would be kept under is listed with both labels,
 * and is not written unless `allowPackMismatch` is given: its wording may
 * differ from what was issued.
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
import { certificateDocument, certificateFileStem, keepCertificate, type IssuedCertificateContent } from "./issued-certificate";

export interface BackfilledCertificate {
  id: string;
  schemeId: string;
  number: number;
  /** The pack recorded on the row when it was issued. */
  rulePack: string | null;
  /** The pack its content would be kept under (the building's current pack). */
  keptUnder: string;
  /** Whether those two are the same pack and version. */
  packMatches: boolean;
  content: IssuedCertificateContent;
  written: boolean;
}

export class BackfillPackMismatchError extends Error {
  constructor(readonly mismatched: BackfilledCertificate[]) {
    super(
      `Not written: ${mismatched.map((m) => `certificate ${m.number} (${m.id}) was issued under ${m.rulePack ?? "no recorded rule pack"}, and would be kept under ${m.keptUnder}`).join("; ")}. Check each against the certificate given, then run again with --allow-pack-mismatch.`,
    );
    this.name = "BackfillPackMismatchError";
  }
}

export async function backfillIssuedCertificateContent(options: { apply: boolean; allowPackMismatch?: boolean; now?: Date }): Promise<BackfilledCertificate[]> {
  const now = options.now ?? new Date();
  const rows = await db.orm.public.SaleCertificate.where((x) => and(x.status.eq("ISSUED"), x.issuedContent.isNull())).orderBy((x) => x.number.asc()).limit(500).all();
  const out: BackfilledCertificate[] = [];
  for (const cert of rows) {
    const [scheme, lot] = await Promise.all([db.orm.public.Scheme.where((s) => s.id.eq(cert.schemeId)).first(), db.orm.public.Lot.where((l) => l.id.eq(cert.lotId)).first()]);
    if (!scheme || !lot) throw new Error(`Certificate ${cert.id}: its building or lot was not found.`);
    const { rules, label } = rulesForState(scheme.state);
    const today = todayIn(timeZoneOf(scheme), now);
    const content = await keepCertificate(certificateDocument({ cert, rules, scheme, lot, today }), { source: "BACKFILL", rulePack: cert.rulePack ?? null, keptOn: today, keptUnder: label, fileStem: certificateFileStem(rules) });
    out.push({ id: cert.id, schemeId: cert.schemeId, number: cert.number, rulePack: cert.rulePack ?? null, keptUnder: label, packMatches: cert.rulePack === label, content, written: false });
  }
  if (!options.apply) return out;
  // Nothing is written while any certificate's pack differs, unless that is allowed.
  const mismatched = out.filter((o) => !o.packMatches);
  if (mismatched.length && !options.allowPackMismatch) throw new BackfillPackMismatchError(mismatched);
  for (const o of out) {
    const n = await db.orm.public.SaleCertificate.where((x) => and(x.id.eq(o.id), x.status.eq("ISSUED"), x.issuedContent.isNull())).updateAndCount({ issuedContent: o.content as unknown as never });
    o.written = n === 1;
  }
  return out;
}
