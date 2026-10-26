import { notFound } from "next/navigation";
import { connection } from "next/server";
import { db } from "@/prisma/db";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemeById } from "@/lib/queries/schemes";
import { rulesForScheme } from "@/lib/jurisdiction/scheme-rules";
import { schemeToday } from "@/lib/jurisdiction/scheme-time";
import { cancelCertificateAction, recordFeePaidAction, refreshCertificateAction, saveCertificateAction } from "@/lib/actions/records";
import { requesterFields } from "@/lib/records/requester-fields";
import type { CertificateItem } from "@/lib/records/certificate-draft";
import { formatLotLabel } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { StatusChip } from "@/components/ui/status-chip";
import { CertificateEditor, ConfirmButton, RecordsForm } from "@/components/records/records-forms";

const day = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v ?? "")).slice(0, 10);

export default async function CertificatePage({ params }: { params: Promise<{ id: string; lotId: string; certificateId: string }> }) {
  await connection();
  const { id, lotId, certificateId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) return null;
  const scheme = await getSchemeById(id);
  if (!scheme) notFound();
  if (!scheme.memberships.some((m) => m.profileId === profile.id && m.role === "ADVISER")) notFound();
  const cert = await db.orm.public.SaleCertificate.where((c) => c.id.eq(certificateId)).first();
  if (!cert || cert.schemeId !== id || cert.lotId !== lotId) notFound();
  const [lot, { rules }, today] = await Promise.all([db.orm.public.Lot.where((l) => l.id.eq(lotId)).first(), rulesForScheme(id), schemeToday(id)]);
  const c = rules.SALE_CERTIFICATE;
  const items = cert.items as unknown as CertificateItem[];
  const toComplete = items.filter((i) => /check and complete/i.test(i.text)).map((i) => i.no);
  const pdf = `/api/records/certificate/${cert.id}?schemeId=${id}`;
  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        title={`${c.title} ${cert.number}: ${formatLotLabel(String(lot?.lotNumber ?? ""))}`}
        description={`Requested by ${cert.requesterName}, received ${day(cert.requestedOn)}.`}
        backHref={`/adviser/schemes/${id}/lots/${lotId}/certificates`}
        backLabel="Certificates"
      />
      {cert.status === "DRAFT" && (
        <>
          <Card>
            <CardHeader
              title="Check and complete every item"
              description={`Figures from the records as at ${day(cert.draftedOn)}${day(cert.draftedOn) < today ? " (refresh them before issuing)" : ""}. ${toComplete.length ? `Items still to complete: ${toComplete.join(", ")}.` : "Every item has been completed. Check them once more before issuing."} Issuing dates the certificate today (${today}), fixes its items and records the fee due.`}
              action={<StatusChip status="Draft" variant="warning" />}
            />
            <CertificateEditor
              action={saveCertificateAction.bind(null, id, lotId, cert.id)}
              requesterFields={requesterFields({ requesterTypes: c.requesterTypes, today, values: { ...cert, requestedOn: day(cert.requestedOn) } })}
              items={items}
            />
            <p className="mt-3 text-xs text-ink-muted">
              StrataVerze lays the certificate out itself, following the items of the {c.form}. Check it against the current approved form.{" "}
              <a className="underline" href={c.helpUrl} target="_blank" rel="noreferrer">
                The approved form
              </a>
            </p>
          </Card>
          <Card>
            <CardHeader title="More" />
            <div className="flex flex-wrap items-center gap-3">
              <ConfirmButton
                label="Refresh figures from the records"
                confirmText="Replace items 3, 4, 6, 11 to 14, 18 and 19 with today's figures? Your other items are kept."
                act={refreshCertificateAction.bind(null, id, lotId, cert.id)}
              />
              <a href={pdf} target="_blank" rel="noreferrer" className="text-sm text-turquoise underline">
                Preview (PDF, marked draft)
              </a>
              <ConfirmButton label="Cancel draft" confirmText="Cancel this draft?" act={cancelCertificateAction.bind(null, id, lotId, cert.id)} />
            </div>
          </Card>
        </>
      )}
      {cert.status !== "DRAFT" && (
        <Card>
          <CardHeader
            title={cert.status === "ISSUED" ? `Issued ${day(cert.certificateDate)}` : "Cancelled draft"}
            action={<StatusChip status={cert.status === "ISSUED" ? "Issued" : "Cancelled"} variant={cert.status === "ISSUED" ? "success" : "default"} />}
          />
          {cert.status === "ISSUED" && (
            <div className="space-y-3 text-sm">
              <a href={pdf} target="_blank" rel="noreferrer" className="text-turquoise underline">
                Certificate (PDF)
              </a>
              <p>
                Fee: ${((cert.feeCents ?? 0) / 100).toFixed(2)}
                {cert.feeRepeat ? " (a further certificate within the repeat period)" : ""}. {cert.feePaidOn ? `Paid ${day(cert.feePaidOn)}.` : "Not yet recorded as paid (collected outside StrataVerze)."}
              </p>
              <p className="text-xs text-ink-muted">{c.execution}. {c.conclusiveNote}</p>
              {!cert.feePaidOn && (
                <RecordsForm action={recordFeePaidAction.bind(null, id, "certificate", cert.id)} submitLabel="Record payment" fields={[{ name: "paidOn", label: "Date the fee was paid", type: "date", max: today, defaultValue: today }]} />
              )}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
