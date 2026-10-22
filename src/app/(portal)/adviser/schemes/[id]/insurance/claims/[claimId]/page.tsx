import { notFound } from "next/navigation";
import { getSchemeById } from "@/lib/queries/schemes";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getClaimById } from "@/lib/queries/insurance-claims";
import { getInsuranceForScheme } from "@/lib/queries/insurance";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { ClaimWorkspace } from "./claim-workspace";
import { EditClaimForm } from "../claim-form";
import {
  POLICY_TYPE_LABELS,
  CLAIM_CATEGORY_LABELS,
  REPORTER_TYPE_LABELS,
} from "@/lib/insurance/constants";
import { allowedClaimTransitions } from "@/lib/insurance/status";
import { formatMoney } from "@/lib/insurance/premium";
import { connection } from "next/server";
import { previewUsageFee } from "@/lib/billing/capture";

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
function dateForInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().split("T")[0];
}
function yesNo(v: boolean | null | undefined): string {
  return v === true ? "YES" : v === false ? "NO" : "";
}

const EVENT_LABELS: Record<string, string> = {
  CREATED: "Claim created",
  STATUS_CHANGED: "Status changed",
  LODGED: "Lodged",
  NOTE: "Note",
  DOCUMENT_ADDED: "Evidence added",
  ASSIGNED: "Assigned",
  AMOUNT_UPDATED: "Details updated",
  TASK: "Task",
};

export default async function ClaimDetailPage({
  params,
}: {
  params: Promise<{ id: string; claimId: string }>;
}) {
  await connection();
  const { id, claimId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();
  const isAdviser = scheme.memberships.some(
    (m) => m.profileId === profile.id && m.role === "ADVISER",
  );
  if (!isAdviser) notFound();

  const claim = await getClaimById(claimId);
  if (!claim || claim.schemeId !== id) notFound();

  const policies = await getInsuranceForScheme(id);
  const policyOptions = policies.map((p) => ({
    id: p.id,
    label: `${POLICY_TYPE_LABELS[p.policyType] ?? p.policyType} · ${p.insurer} · ${p.policyNumber}`,
  }));

  const events = (claim.events ?? [])
    .slice()
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  const evidence = (claim.documents ?? []).map((d) => ({
    id: d.id,
    title: d.title,
    fileName: d.fileName,
    fileUrl: d.fileUrl,
    uploadedAt: String(d.createdAt),
  }));

  const editDefaults = {
    title: claim.title,
    policyId: claim.policyId ?? "",
    incidentCategory: claim.incidentCategory ?? "",
    reporterType: claim.reporterType ?? "STRATA_MANAGER",
    reporterName: claim.reporterName ?? "",
    contactEmail: claim.contactEmail ?? "",
    contactPhone: claim.contactPhone ?? "",
    smsUpdates: claim.smsUpdates,
    incidentDate: dateForInput(claim.incidentDate ? String(claim.incidentDate) : null),
    incidentTime: claim.incidentTime ?? "",
    discoveredDate: dateForInput(claim.discoveredDate ? String(claim.discoveredDate) : null),
    incidentLocation: claim.incidentLocation ?? "",
    lotReference: claim.lotReference ?? "",
    commonProperty: yesNo(claim.commonProperty),
    individualLot: yesNo(claim.individualLot),
    description: claim.description ?? "",
    damageDetails: claim.damageDetails ?? "",
    immediateAction: claim.immediateAction ?? "",
    estimatedLoss: claim.estimatedLoss != null ? String(claim.estimatedLoss) : "",
    otherParties: claim.otherParties ?? "",
  };

  const management = {
    insurerClaimRef: claim.insurerClaimRef ?? "",
    claimedAmount: claim.claimedAmount != null ? String(claim.claimedAmount) : "",
    approvedAmount: claim.approvedAmount != null ? String(claim.approvedAmount) : "",
    paidAmount: claim.paidAmount != null ? String(claim.paidAmount) : "",
    excessAmount: claim.excessAmount != null ? String(claim.excessAmount) : "",
    assessorDetails: claim.assessorDetails ?? "",
    contractorDetails: claim.contractorDetails ?? "",
    settlementDetails: claim.settlementDetails ?? "",
    decisionReason: claim.decisionReason ?? "",
  };

  const linkedPolicy = policies.find((p) => p.id === claim.policyId);

  return (
    <div className="max-w-3xl">
      <PageHeader
        title={claim.title}
        description={`${scheme.name}${claim.incidentCategory ? ` · ${CLAIM_CATEGORY_LABELS[claim.incidentCategory] ?? claim.incidentCategory}` : ""}`}
        backHref={`/adviser/schemes/${id}/insurance`}
        backLabel="Insurance"
      />

      {/* Summary */}
      <Card className="mb-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-xs text-ink-muted">Lodging as</p>
            <p className="font-medium text-ink">
              {claim.reporterType
                ? (REPORTER_TYPE_LABELS[claim.reporterType] ?? claim.reporterType)
                : "—"}
            </p>
            {claim.reporterName && (
              <p className="text-xs text-ink-muted">{claim.reporterName}</p>
            )}
          </div>
          <div>
            <p className="text-xs text-ink-muted">Policy</p>
            <p className="font-medium text-ink">
              {linkedPolicy
                ? `${linkedPolicy.insurer} · ${linkedPolicy.policyNumber}`
                : "Not linked"}
            </p>
          </div>
          <div>
            <p className="text-xs text-ink-muted">Date of loss</p>
            <p className="font-medium text-ink">
              {fmtDate(claim.incidentDate ? String(claim.incidentDate) : null)}
            </p>
          </div>
          <div>
            <p className="text-xs text-ink-muted">Common property</p>
            <p className="font-medium text-ink">
              {claim.commonProperty == null ? "—" : claim.commonProperty ? "Yes" : "No"}
            </p>
          </div>
          <div>
            <p className="text-xs text-ink-muted">Individual lot</p>
            <p className="font-medium text-ink">
              {claim.individualLot == null ? "—" : claim.individualLot ? "Yes" : "No"}
            </p>
          </div>
          {claim.estimatedLoss != null && (
            <div>
              <p className="text-xs text-ink-muted">Estimated loss</p>
              <p className="font-medium text-ink tabular-nums">
                {formatMoney(String(claim.estimatedLoss))}
              </p>
            </div>
          )}
        </div>
        {claim.description && (
          <div className="mt-4">
            <p className="text-xs font-medium text-ink-muted">Description</p>
            <p className="text-sm text-ink whitespace-pre-wrap">{claim.description}</p>
          </div>
        )}
      </Card>

      {/* Workspace */}
      <ClaimWorkspace
        lodgementFee={claim.status === "DRAFT" ? await previewUsageFee({ code: "CLAIM_HANDLING" }) : null}
        schemeId={id}
        claimId={claimId}
        status={claim.status}
        allowedTransitions={allowedClaimTransitions(claim.status)}
        lodged={
          claim.lodgedAt
            ? {
                at: String(claim.lodgedAt),
                channel: claim.lodgedChannel ?? null,
                recipient: claim.lodgedRecipient ?? null,
                reference: claim.lodgedReference ?? null,
              }
            : null
        }
        management={management}
        evidence={evidence}
      />

      {/* Timeline */}
      <Card className="mb-6 mt-6">
        <CardHeader title="Activity timeline" />
        <ol className="space-y-3">
          {events.map((e) => (
            <li key={e.id} className="flex gap-3 text-sm">
              <span className="text-xs text-ink-muted whitespace-nowrap w-24 shrink-0">
                {fmtDate(String(e.createdAt))}
              </span>
              <span className="text-ink">
                <span className="font-medium">
                  {EVENT_LABELS[e.eventType] ?? e.eventType}
                </span>
                {e.fromStatus && e.toStatus ? (
                  <span className="text-ink-muted">
                    {" "}
                    {e.fromStatus} → {e.toStatus}
                  </span>
                ) : null}
                {e.note ? <span className="block text-ink-muted">{e.note}</span> : null}
              </span>
            </li>
          ))}
        </ol>
      </Card>

      {/* Edit the claim record */}
      <Card className="mb-6">
        <CardHeader title="Claim details" description="Edit the lodged information." />
        <EditClaimForm
          schemeId={id}
          claimId={claimId}
          policies={policyOptions}
          defaults={editDefaults}
        />
      </Card>
    </div>
  );
}
