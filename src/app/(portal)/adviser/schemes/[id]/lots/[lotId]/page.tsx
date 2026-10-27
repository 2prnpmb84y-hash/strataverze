import { notFound } from "next/navigation";
import { timeZoneOf } from "@/lib/jurisdiction/scheme-time";
import { schemeToday } from "@/lib/jurisdiction/scheme-time";
import { getSchemeById } from "@/lib/queries/schemes";
import { rulesForState } from "@/lib/jurisdiction/scheme-rules";
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
import { RollOwnerName } from "./roll-owner-name";
import { ChangeOwnerButton } from "@/components/lots/change-owner-button";
import { connection } from "next/server";
import { loadLotLevyView } from "@/lib/levies/lot-levy-view";
import { LevyNoticesView } from "@/components/levies/levy-notices-view";
import { StatementView } from "@/components/levies/statement-view";
import { lotEntitlementProblem, onLotEntitlementWords, separateEntitlement } from "@/lib/jurisdiction/building-data";
import { BuildingDataNotice } from "../../_sections/building-data-notice";
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

  const lotLabel = `${formatLotLabel(lot.lotNumber)}${lot.unitNumber ? ` (Unit ${lot.unitNumber})` : ""}`;
  const [lotDetailExt, tenants, propertyManager, deliveryPrefs, debtCollection, documents, ownerView] =
    await Promise.all([
      getLotDetailExtended(lotId),
      getTenantsForLot(lotId),
      getPropertyManager(lotId),
      getDeliveryPreferences(lotId),
      getDebtCollection(lotId),
      getDocumentsForScheme(id),
      // What the lot's owner sees for this lot in the owner portal (read only here).
      loadLotLevyView(id, lotId, lotLabel, rulesForState(scheme.state).rules.TERMINOLOGY),
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
  // The certificate the building's pack has (stage 2, step 9), named as the pack names its button.
  const packRules = rulesForState(scheme.state).rules;
  const certificateButton = packRules.FEATURES.strataInformationCertificate || packRules.FEATURES.bodyCorporateCertificate ? packRules.CERTIFICATE?.buttonLabel : undefined;
  // The lot's entitlements as the pack names them, and a second schedule's
  // (Queensland's interest schedule) if the pack has one (stage 2, step 10).
  const entitlementWords = onLotEntitlementWords(packRules);
  const separate = separateEntitlement(packRules);
  const lotDataProblem = lotEntitlementProblem(packRules, lot);

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
        {certificateButton && (
          <Button variant="secondary" className="text-xs h-9 px-4" href={`/adviser/schemes/${id}/lots/${lotId}/certificates`}>
            <Award size={14} />
            {certificateButton}
          </Button>
        )}
        <LotActionButtons schemeId={id} lotId={lotId} deliveryPrefs={deliveryPrefs} />
        <ChangeOwnerButton
          schemeId={id}
          lotId={lotId}
          lotLabel={lotLabel}
          currentOwner={lotDetailExt?.rollOwnerName ?? (lot.owners.length > 0 ? ownerName : null)}
          today={await schemeToday(id)}
        />
      </div>

      <BuildingDataNotice problems={lotDataProblem ? [lotDataProblem] : []} />

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
                      label="Unit No."
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
                      label={entitlementWords.label ?? "Unit Entitlement"}
                      value={String(lot.entitlement)}
                    />
                    {separate && (
                      <DetailRow
                        label={separate.label}
                        value={lot.interestScheduleEntitlement != null ? String(lot.interestScheduleEntitlement) : "Not recorded"}
                      />
                    )}
                    <DetailRow
                      label="UOF"
                      value={lot.uof ?? "—"}
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
                    <RollOwnerName schemeId={id} lotId={lotId} value={lotDetailExt?.rollOwnerName ?? null} />
                    <DetailRow label="Owner Account" value={ownerName} />
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
                    label="Brought forward"
                    value={lot.financials.opening}
                  />
                  <SnapshotStat
                    label="+Levies"
                    value={lot.financials.annual}
                  />
                  <SnapshotStat
                    label="+Special"
                    value={lot.financials.special}
                  />
                  <SnapshotStat
                    label="+Interest charged"
                    value={lot.financials.interest}
                  />
                  <SnapshotStat
                    label="−Paid"
                    value={lot.financials.paid}
                    className="text-green-600"
                  />
                  <SnapshotStat
                    label="=Owing"
                    value={lot.financials.closing}
                    className="font-semibold"
                  />
                </div>
              </Card>
            </div>
          ),

          /* ── Financials tab ─────────────────────────────── */
          financials: (
            <LotFinancials
              timeZone={timeZoneOf(scheme)}
              financials={lot.financials}
              levyHistory={lot.levyHistory.map((lh) => ({
                ...lh,
                dueDate: String(lh.dueDate),
                paidAt: lh.paidAt ? String(lh.paidAt) : null,
              }))}
            />
          ),

          /* ── Owner's view tab ───────────────────────────── */
          owner: (
            <div className="space-y-6">
              <p className="text-sm text-ink-muted">
                What the owner of this lot sees in their portal: their levies and their statement. Read only.
              </p>
              <Card>
                <CardHeader title="Owner details" description="As recorded for this lot." />
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <DetailRow label="Owner name (strata roll)" value={lotDetailExt?.rollOwnerName ?? "—"} />
                  <DetailRow
                    label="Owner account"
                    value={lot.owners.length ? lot.owners.map((o) => `${o.firstName} ${o.lastName}`.trim() || o.email).join(", ") : "No owner account yet"}
                  />
                  <DetailRow label="Email" value={lotDetailExt?.ownerEmail ?? lot.owners[0]?.email ?? "—"} />
                  <DetailRow label="Phone" value={lotDetailExt?.ownerPhone ?? lot.owners[0]?.phone ?? "—"} />
                  <DetailRow label="Mobile" value={lotDetailExt?.ownerMobile ?? "—"} />
                  <DetailRow label="Address for service" value={lotDetailExt?.ownerAddress ?? "—"} />
                  <DetailRow label="Committee member" value={lotDetailExt?.isCommitteeMember ? "Yes" : "No"} />
                </dl>
              </Card>
              <LevyNoticesView items={ownerView.items} emptyDescription="No levies have been issued for this lot yet." />
              <StatementView
                lotLabel={lotLabel}
                pdfHref={`/api/finance/pdf/owner-statement?schemeId=${id}&lotId=${lotId}`}
                periodLabel="All periods"
                openingBalance={ownerView.statement.openingBalance}
                totalCharges={ownerView.statement.totalCharges}
                totalPayments={ownerView.statement.totalPayments}
                closingBalance={ownerView.statement.closingBalance}
                lines={ownerView.statement.lines}
              />
            </div>
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
              timeZone={timeZoneOf(scheme)}
              documents={await Promise.all(
                documents.map(async (d) => ({
                  id: String(d.id),
                  title: String(d.title),
                  category: String(d.category ?? ""),
                  fileName: String(d.fileName ?? ""),
                  fileSize: Number(d.fileSize ?? 0),
                  createdAt: String(d.createdAt),
                  fileUrl: await resolveDocumentUrl(String(d.fileUrl), 600, { schemeId: id }).catch(() => ""),
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
                  lockStructure={!profile?.isPlatformAdmin}
                  entitlementWords={entitlementWords}
                  separate={separate}
                  defaults={{
                    lotNumber: lot.lotNumber,
                    unitNumber: lot.unitNumber,
                    entitlement: lot.entitlement,
                    interestScheduleEntitlement: lot.interestScheduleEntitlement,
                    floorArea: lot.floorArea,
                    lotType: lot.lotType,
                  }}
                />
              </div>

              {profile?.isPlatformAdmin && (
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
              )}
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
