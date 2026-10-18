import { notFound } from "next/navigation";
import { getSchemeById } from "@/lib/queries/schemes";
import { getLotDetail } from "@/lib/queries/lots";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getDocumentsForScheme } from "@/lib/queries/documents";
import { resolveDocumentUrl } from "@/lib/queries/document-url";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { LotForm } from "../lot-form";
import { DeleteLotButton } from "./delete-lot-button";
import { OwnerAssignment } from "./owner-assignment";
import { LotDetailTabs } from "./lot-detail-tabs";
import { LotFinancials } from "./lot-financials";
import { LotDocuments } from "./lot-documents";
import { connection } from "next/server";

export default async function LotDetailPage({
  params,
}: {
  params: Promise<{ id: string; lotId: string }>;
}) {
  await connection();
  const { id, lotId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();

  const isAdviser = scheme.memberships.some(
    (m) => m.profileId === profile.id && m.role === "ADVISER",
  );
  if (!isAdviser) notFound();

  const lot = await getLotDetail(lotId);
  if (!lot || lot.schemeId !== id) notFound();

  const documents = await getDocumentsForScheme(id);

  const lotTypeLabel =
    lot.lotType.charAt(0) + lot.lotType.slice(1).toLowerCase();

  return (
    <div className="max-w-5xl">
      <PageHeader
        title={`Lot ${lot.lotNumber}${lot.unitNumber ? ` / Unit ${lot.unitNumber}` : ""}`}
        description={`${scheme.name} · ${scheme.planNumber}`}
        backHref={`/adviser/schemes/${id}?tab=lots`}
        backLabel="Strata Roll"
      />

      <LotDetailTabs>
        {{
          /* ── Details tab ────────────────────────────────── */
          details: (
            <div className="space-y-6">
              {/* Two-column layout: Lot info + Property details */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Lot information */}
                <Card>
                  <CardHeader title="Lot Information" />
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                    <DetailRow label="Strata Plan" value={scheme.planNumber} />
                    <DetailRow label="Lot Number" value={lot.lotNumber} />
                    <DetailRow
                      label="Unit Number"
                      value={lot.unitNumber ?? "—"}
                    />
                    <DetailRow label="Lot Type" value={lotTypeLabel} />
                    <DetailRow
                      label="Unit of Entitlement"
                      value={String(lot.entitlement)}
                    />
                    <DetailRow
                      label="Floor Area"
                      value={
                        lot.floorArea ? `${lot.floorArea} m²` : "—"
                      }
                    />
                  </dl>
                </Card>

                {/* Property address */}
                <Card>
                  <CardHeader title="Property Address" />
                  <dl className="grid grid-cols-1 gap-y-3 text-sm">
                    <DetailRow label="Street" value={scheme.address} />
                    <DetailRow label="Suburb" value={scheme.suburb} />
                    <DetailRow
                      label="State / Postcode"
                      value={`${scheme.state} ${scheme.postcode}`}
                    />
                    {scheme.folio && (
                      <DetailRow label="Folio" value={scheme.folio} />
                    )}
                  </dl>
                </Card>
              </div>

              {/* Owner information */}
              <Card>
                <CardHeader
                  title="Owner Information"
                  description={
                    lot.isCommitteeMember
                      ? "Committee member"
                      : undefined
                  }
                  action={
                    lot.isCommitteeMember ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-600">
                        <span className="h-1.5 w-1.5 rounded-full bg-primary-400" />
                        Committee
                      </span>
                    ) : undefined
                  }
                />
                {lot.owners.length === 0 ? (
                  <p className="text-sm text-ink-muted">
                    No owners assigned to this lot.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {lot.owners.map((owner) => (
                      <div
                        key={owner.membershipId}
                        className="rounded-[var(--radius-card)] border border-line p-4"
                      >
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                          <DetailRow
                            label="Owner Name"
                            value={
                              `${owner.firstName} ${owner.lastName}`.trim() ||
                              "—"
                            }
                          />
                          <DetailRow label="Email" value={owner.email} />
                          <DetailRow
                            label="Phone"
                            value={owner.phone ?? "—"}
                          />
                          <DetailRow
                            label="Owner Since"
                            value={new Date(
                              owner.startDate,
                            ).toLocaleDateString("en-AU", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                            })}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Owner assignment */}
                <div className="mt-6 pt-6 border-t border-line">
                  <h3 className="text-sm font-medium text-ink mb-3">
                    Manage Owners
                  </h3>
                  <OwnerAssignment
                    schemeId={id}
                    lotId={lotId}
                    owners={lot.owners.map((o) => ({
                      id: o.membershipId,
                      profile: {
                        id: o.profileId,
                        firstName: o.firstName,
                        lastName: o.lastName,
                        email: o.email,
                      },
                    }))}
                  />
                </div>
              </Card>

              {/* Financial snapshot */}
              <Card>
                <CardHeader title="Financial Snapshot" />
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                  <SnapshotStat
                    label="Opening"
                    value={lot.financials.opening}
                  />
                  <SnapshotStat
                    label="+Annual"
                    value={lot.financials.annual}
                  />
                  <SnapshotStat
                    label="+Special"
                    value={lot.financials.special}
                  />
                  <SnapshotStat
                    label="~Paid"
                    value={lot.financials.paid}
                    className="text-green-600"
                  />
                  <SnapshotStat
                    label="~Closing"
                    value={lot.financials.closing}
                    className="font-semibold"
                  />
                  <SnapshotStat
                    label="Interest"
                    value={lot.financials.interestPaid}
                  />
                </div>
              </Card>
            </div>
          ),

          /* ── Financials tab ─────────────────────────────── */
          financials: (
            <LotFinancials
              financials={lot.financials}
              levyHistory={lot.levyHistory.map((lh) => ({
                ...lh,
                dueDate: String(lh.dueDate),
                paidAt: lh.paidAt ? String(lh.paidAt) : null,
              }))}
            />
          ),

          /* ── Documents tab ──────────────────────────────── */
          documents: (
            <LotDocuments
              documents={await Promise.all(
                documents.map(async (d) => ({
                  id: d.id,
                  title: d.title,
                  category: d.category,
                  fileName: d.fileName,
                  fileSize: d.fileSize,
                  createdAt: String(d.createdAt),
                  fileUrl: await resolveDocumentUrl(d.fileUrl),
                })),
              )}
            />
          ),

          /* ── Settings tab ───────────────────────────────── */
          settings: (
            <div className="space-y-6">
              <div>
                <h2 className="font-heading font-semibold text-ink mb-4">
                  Edit Lot Details
                </h2>
                <LotForm
                  mode="edit"
                  schemeId={id}
                  lotId={lotId}
                  defaults={{
                    lotNumber: lot.lotNumber,
                    unitNumber: lot.unitNumber,
                    entitlement: lot.entitlement,
                    floorArea: lot.floorArea,
                    lotType: lot.lotType,
                  }}
                />
              </div>

              <Card className="border-red-200">
                <CardHeader
                  title="Danger Zone"
                  description="Irreversible actions for this lot."
                />
                <DeleteLotButton
                  schemeId={id}
                  lotId={lotId}
                  lotNumber={lot.lotNumber}
                />
              </Card>
            </div>
          ),
        }}
      </LotDetailTabs>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-ink-muted text-xs mb-0.5">{label}</dt>
      <dd className="text-ink font-medium">{value}</dd>
    </div>
  );
}

function SnapshotStat({
  label,
  value,
  className,
}: {
  label: string;
  value: number;
  className?: string;
}) {
  return (
    <div className="text-center">
      <p className="text-xs text-ink-muted mb-0.5">{label}</p>
      <p className={`text-sm tabular-nums ${className ?? "text-ink"}`}>
        {value.toLocaleString("en-AU", {
          style: "currency",
          currency: "AUD",
          minimumFractionDigits: 2,
        })}
      </p>
    </div>
  );
}
