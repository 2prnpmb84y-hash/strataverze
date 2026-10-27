import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { db } from "@/prisma/db";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemeById } from "@/lib/queries/schemes";
import { rulesForScheme } from "@/lib/jurisdiction/scheme-rules";
import { schemeToday } from "@/lib/jurisdiction/scheme-time";
import { createCertificateAction } from "@/lib/actions/records";
import { requesterFields } from "@/lib/records/requester-fields";
import { formatLotLabel } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { StatusChip } from "@/components/ui/status-chip";
import { RecordsForm } from "@/components/records/records-forms";
import { needRule } from "@/config/statutory";

const day = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v ?? "")).slice(0, 10);

/** The Info Certificate button on a lot: the lot's information certificates (s 184), and a new one. */
export default async function LotCertificatesPage({ params }: { params: Promise<{ id: string; lotId: string }> }) {
  await connection();
  const { id, lotId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) return null;
  const scheme = await getSchemeById(id);
  if (!scheme) notFound();
  if (!scheme.memberships.some((m) => m.profileId === profile.id && m.role === "ADVISER")) notFound();
  const lot = await db.orm.public.Lot.where((l) => l.id.eq(lotId)).first();
  if (!lot || lot.schemeId !== id) notFound();
  const [{ rules }, today, certificates] = await Promise.all([
    rulesForScheme(id),
    schemeToday(id),
    db.orm.public.SaleCertificate.where((c) => c.lotId.eq(lotId)).orderBy((c) => c.number.desc()).limit(200).all(),
  ]);
  if (!rules.FEATURES.strataInformationCertificate) notFound();
  const c = needRule(rules, "SALE_CERTIFICATE");
  const base = `/adviser/schemes/${id}/lots/${lotId}/certificates`;
  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader title={`${c.title}: ${formatLotLabel(String(lot.lotNumber))}`} description={`${c.section}. ${c.form}.`} backHref={`/adviser/schemes/${id}/lots/${lotId}`} backLabel="Lot" />
      <Card>
        <CardHeader title="Certificates for this lot" />
        {certificates.length === 0 ? (
          <p className="text-sm text-ink-muted">None yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-muted border-b border-line">
                  <th className="py-2 pr-3">No.</th>
                  <th className="py-2 pr-3">Requested by</th>
                  <th className="py-2 pr-3">Received</th>
                  <th className="py-2 pr-3">Issued</th>
                  <th className="py-2 pr-3 text-right">Fee</th>
                  <th className="py-2 pr-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {certificates.map((x) => (
                  <tr key={x.id} className="border-b border-line last:border-0">
                    <td className="py-2 pr-3">
                      <Link className="text-turquoise underline" href={`${base}/${x.id}`}>
                        {x.number}
                      </Link>
                    </td>
                    <td className="py-2 pr-3">{x.requesterName}</td>
                    <td className="py-2 pr-3 tabular-nums">{day(x.requestedOn)}</td>
                    <td className="py-2 pr-3 tabular-nums">{x.certificateDate ? day(x.certificateDate) : ""}</td>
                    <td className="py-2 pr-3 tabular-nums text-right">{x.feeCents != null ? `$${(x.feeCents / 100).toFixed(2)}${x.feePaidOn ? " paid" : " due"}` : ""}</td>
                    <td className="py-2 pr-3">
                      <StatusChip status={x.status === "ISSUED" ? "Issued" : x.status === "DRAFT" ? "Draft" : "Cancelled"} variant={x.status === "ISSUED" ? "success" : x.status === "DRAFT" ? "warning" : "default"} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Card>
        <CardHeader
          title="New certificate"
          description={`StrataVerze drafts each item from its records; you check and complete every item before issuing. Fee: $${(c.feeCents / 100).toFixed(2)}, or $${(c.repeatFeeCents / 100).toFixed(2)} for a further certificate for the lot within ${c.repeatWithinMonths} months (${c.feeSource}). It is recorded on issue and collected outside StrataVerze.`}
        />
        <RecordsForm action={createCertificateAction.bind(null, id, lotId)} fields={requesterFields({ requesterTypes: c.requesterTypes, today })} submitLabel="Start draft" doneHrefPrefix={`${base}/`} />
      </Card>
    </div>
  );
}
