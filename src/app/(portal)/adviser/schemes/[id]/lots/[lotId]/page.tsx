import { notFound } from "next/navigation";
import { getSchemeById } from "@/lib/queries/schemes";
import { getLotDetail } from "@/lib/queries/lots";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getDocumentsForScheme } from "@/lib/queries/documents";
import { resolveDocumentUrl } from "@/lib/queries/document-url";
import {
  getLotDetailExtended,
  getTenantsForLot,
  getPropertyManager,
  getDeliveryPreferences,
  getDebtCollection,
} from "@/lib/queries/lot-workflows";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LotForm } from "../lot-form";
import { DeleteLotButton } from "./delete-lot-button";
import { formatLotLabel } from "@/lib/format";
import { OwnerAssignment } from "./owner-assignment";
import { LotDetailTabs } from "./lot-detail-tabs";
import { LotFinancials } from "./lot-financials";
import { LotDocuments } from "./lot-documents";
import { DebtCollectionSection } from "./debt-collection-section";
import { TenancyDetails } from "./tenancy-details";
import { LotActionButtons } from "./lot-action-buttons";
import { connection } from "next/server";
import {
  FileText,
  Award,
} from "lucide-react";

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

  const [lotDetailExt, tenants, propertyManager, deliveryPrefs, debtCollection, documents] =
    await Promise.all([
      getLotDetailExtended(lotId),
      getTenantsForLot(lotId),
      getPropertyManager(lotId),
      getDeliveryPreferences(lotId),
      getDebtCollection(lotId),
      getDocumentsForScheme(id),
    ]);

  // Find the operating bank account for this scheme
  const operatingAccount = scheme.bankAccounts?.find(
    (ba: { isOperating: boolean; isActive: boolean }) => ba.isOperating && ba.isActive,
  ) ?? scheme.bankAccounts?.[0] ?? null;

  const _lotTypeLabel =
    lot.lotType.charAt(0) + lot.lotType.slice(1).toLowerCase();

  // Build owner display name
  const ownerName =
    lot.owners.length > 0
      ? `${lot.owners[0].firstName} ${lot.owners[0].lastName}`.trim()
      : "No owner assigned";

  return (
    <div className="max-w-5xl">
      <PageHeader
        title={`${formatLotLabel(lot.lotNumber)}${lot.unitNumber ? ` / Unit ${lot.unitNumber}` : ""}`}
        description={`${scheme.name} · ${scheme.planNumber}`}
        backHref={`/adviser/schemes/${id}/lots`}
        backLabel="Strata Roll"
      />

      {/* Action buttons row */}
      <div className="flex flex-wrap gap-2 mb-6">
        <Button variant="secondary" className="text-xs h-9 px-4">
          <FileText size={14} />
          Strata Report
        </Button>
        <Button variant="secondary" className="text-xs h-9 px-4">
          <Award size={14} />
          Info Certificate
        </Button>
        <LotActionButtons schemeId={id} lotId={lotId} deliveryPrefs={deliveryPrefs} />
      </div>

      <LotDetailTabs>
        {{
          /* ── Details tab ────────────────────────────────── */
          details: (
            <div className="space-y-6">
              {/* Bank Account / Reconciliation section */}
              <Card>
                <CardHeader title="Bank Account" />
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div>
                    <dl className="text-sm space-y-2">
                      <DetailRow label="BSB" value={operatingAccount?.bsb ?? "—"} />
                      <DetailRow label="Account" value={operatingAccount?.accountNumber ?? "—"} />
                      {operatingAccount?.bankName && (
                        <DetailRow label="Bank" value={operatingAccount.bankName} />
                      )}
                    </dl>
                  </div>
                  <div>
                    <div className="h-32 flex items-center justify-center rounded-[var(--radius-card)] bg-muted text-xs text-ink-muted">
                      Reconciliation chart coming soon
                    </div>
                  </div>
                </div>
              </Card>

              {/* S/Plan details + Owner Information */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* S/Plan Details */}
                <Card>
                  <CardHeader title="S/Plan Details" />
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                    <DetailRow label="S/Plan" value={scheme.planNumber} />
                    <DetailRow label="Lot" value={lot.lotNumber} />
                    <DetailRow
                      label="Unit"
                      value={lot.unitNumber ?? "—"}
                    />
                    <DetailRow
                      label="Street No"
                      value={lot.streetNo ?? "—"}
                    />
                    <DetailRow
                      label="Street Name"
                      value={lot.streetName ?? scheme.address ?? "—"}
                    />
                    <DetailRow
                      label="Suburb"
                      value={lot.suburb ?? scheme.suburb ?? "—"}
                    />
                    <DetailRow
                      label="Accessory Unit"
                      value={lot.accessoryUnit ?? "—"}
                    />
                    <DetailRow
                      label="UOF"
                      value={lot.uof ?? String(lot.entitlement)}
                    />
                    <DetailRow
                      label="CRN"
                      value={lot.crn ?? "—"}
                    />
                  </dl>
                </Card>

                {/* Owner Information */}
                <Card>
                  <CardHeader
                    title="Owner Information"
                    action={
                      lotDetailExt?.isCommitteeMember ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-mint-soft px-2.5 py-1 text-xs font-medium text-turquoise">
                          <span className="h-1.5 w-1.5 rounded-full bg-turquoise" />
                          Committee
                        </span>
                      ) : undefined
                    }
                  />
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                    <DetailRow label="Owner Name" value={ownerName} />
                    <DetailRow
                      label="Phone"
                      value={lotDetailExt?.ownerPhone ?? lot.owners[0]?.phone ?? "—"}
                    />
                    <DetailRow
                      label="Mobile"
                      value={lotDetailExt?.ownerMobile ?? "—"}
                    />
                    <DetailRow
                      label="Contact Name"
                      value={lotDetailExt?.contactName ?? "—"}
                    />
                    <DetailRow
                      label="Address"
                      value={lotDetailExt?.ownerAddress ?? "—"}
                    />
                    <DetailRow
                      label="Email"
                      value={lotDetailExt?.ownerEmail ?? lot.owners[0]?.email ?? "—"}
                    />
                    {lotDetailExt?.isCommitteeMember !== undefined && (
                      <DetailRow
                        label="Committee Member"
                        value={lotDetailExt.isCommitteeMember ? "Yes" : "No"}
                      />
                    )}
                    <DetailRow
                      label="Paid to Date"
                      value={
                        lotDetailExt?.paidToDate
                          ? new Date(lotDetailExt.paidToDate).toLocaleDateString("en-AU")
                          : "—"
                      }
                    />
                    <DetailRow
                      label="Last Settled"
                      value={
                        lotDetailExt?.lastSettled
                          ? new Date(lotDetailExt.lastSettled).toLocaleDateString("en-AU")
                          : "—"
                      }
                    />
                  </dl>

                  {/* Action row: Change Owner, PoA, Proxy, Delivery */}
                  <div className="mt-4 pt-4 border-t border-line">
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
              </div>

              {/* Debt Collection */}
              <DebtCollectionSection
                schemeId={id}
                lotId={lotId}
                debtCollection={
                  debtCollection
                    ? {
                        stage: debtCollection.stage,
                        notes: debtCollection.notes,
                        excludeFromCollection: debtCollection.excludeFromCollection,
                        hasPaymentPlan: debtCollection.hasPaymentPlan,
                        buildingDebtCollection: debtCollection.buildingDebtCollection,
                      }
                    : null
                }
              />

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

          /* ── Tenancy tab ────────────────────────────────── */
          tenancy: (
            <TenancyDetails
              schemeId={id}
              lotId={lotId}
              tenants={tenants.map((t) => ({
                tenantNumber: Number(t.tenantNumber),
                isOwnerOccupier: Boolean(t.isOwnerOccupier),
                isFormalTenant: Boolean(t.isFormalTenant),
                dateReceived: t.dateReceived ? String(t.dateReceived) : null,
                deliveryBy: String(t.deliveryBy ?? "EMAIL"),
                salutation: t.salutation as string | null,
                name: t.name as string | null,
                contactName: t.contactName as string | null,
                mobile: t.mobile as string | null,
                email: t.email as string | null,
                leaseStart: t.leaseStart ? String(t.leaseStart) : null,
                leaseExpiry: t.leaseExpiry ? String(t.leaseExpiry) : null,
                notes: t.notes as string | null,
              }))}
              propertyManager={
                propertyManager
                  ? {
                      agentName: propertyManager.agentName,
                      company: propertyManager.company,
                      address: propertyManager.address,
                      agentEmail: propertyManager.agentEmail,
                      phone: propertyManager.phone,
                      fax: propertyManager.fax,
                      email: propertyManager.email,
                    }
                  : null
              }
            />
          ),

          /* ── Documents tab ──────────────────────────────── */
          documents: (
            <LotDocuments
              documents={await Promise.all(
                documents.map(async (d) => ({
                  id: String(d.id),
                  title: String(d.title),
                  category: String(d.category ?? ""),
                  fileName: String(d.fileName ?? ""),
                  fileSize: Number(d.fileSize ?? 0),
                  createdAt: String(d.createdAt),
                  fileUrl: await resolveDocumentUrl(String(d.fileUrl)).catch(() => ""),
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
