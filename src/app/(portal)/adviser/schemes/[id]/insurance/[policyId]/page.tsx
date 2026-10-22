import { notFound } from "next/navigation";
import { getPolicyWithItems } from "@/lib/queries/insurance";
import { getPolicyDocumentsWithHistory } from "@/lib/queries/insurance-documents";
import { InsuranceDocumentsSection } from "./documents-section";
import { getSchemeById } from "@/lib/queries/schemes";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { StatusChip } from "@/components/ui/status-chip";
import { InsurancePolicyEditForm } from "../insurance-form";
import type {
  CoverageRow,
  PremiumRow,
} from "../insurance-form";
import { DeleteInsuranceButton } from "./delete-insurance-button";
import {
  POLICY_TYPE_LABELS,
  COVERAGE_CATEGORY_LABELS,
  PREMIUM_KIND_LABELS,
} from "@/lib/insurance/constants";
import { formatMoney } from "@/lib/insurance/premium";
import { derivePolicyStatus, daysUntilExpiry } from "@/lib/insurance/status";
import { connection } from "next/server";

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
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

export default async function InsurancePolicyDetailPage({
  params,
}: {
  params: Promise<{ id: string; policyId: string }>;
}) {
  await connection();
  const { id, policyId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();

  const isAdviser = scheme.memberships.some(
    (m) => m.profileId === profile.id && m.role === "ADVISER",
  );
  if (!isAdviser) notFound();

  const policy = await getPolicyWithItems(policyId);
  if (!policy || policy.schemeId !== id) notFound();

  const coverageItems = policy.coverageItems ?? [];
  const premiumLineItems = policy.premiumLineItems ?? [];
  const documents = await getPolicyDocumentsWithHistory(policyId);

  const effectiveStatus = derivePolicyStatus(
    {
      startDate: new Date(String(policy.startDate)),
      endDate: new Date(String(policy.endDate)),
      status: policy.status,
    },
  );
  const untilExpiry = daysUntilExpiry(new Date(String(policy.endDate)));

  const defaults = {
    policyNumber: policy.policyNumber,
    policyType: policy.policyType,
    status: policy.status,
    insurer: policy.insurer,
    broker: policy.broker ?? "",
    brokerContact: policy.brokerContact ?? "",
    insuredEntityName: policy.insuredEntityName ?? "",
    insuredAddress: policy.insuredAddress ?? "",
    additionalInsured: policy.additionalInsured ?? "",
    contactPerson: policy.contactPerson ?? "",
    contactEmail: policy.contactEmail ?? "",
    contactPhone: policy.contactPhone ?? "",
    claimsContact: policy.claimsContact ?? "",
    referenceNumbers: policy.referenceNumbers ?? "",
    coverageAmount: String(policy.coverageAmount),
    premium: String(policy.premium),
    excessAmount: policy.excessAmount ? String(policy.excessAmount) : "",
    startDate: dateForInput(String(policy.startDate)),
    endDate: dateForInput(String(policy.endDate)),
    renewalDate: dateForInput(
      policy.renewalDate ? String(policy.renewalDate) : null,
    ),
    currency: policy.currency ?? "AUD",
    paymentDueDate: dateForInput(
      policy.paymentDueDate ? String(policy.paymentDueDate) : null,
    ),
    paymentStatus: policy.paymentStatus ?? "",
    paymentDate: dateForInput(
      policy.paymentDate ? String(policy.paymentDate) : null,
    ),
    paymentReference: policy.paymentReference ?? "",
    coverageSummary: policy.coverageSummary ?? "",
    exclusions: policy.exclusions ?? "",
    conditions: policy.conditions ?? "",
    endorsements: policy.endorsements ?? "",
    notes: policy.notes ?? "",
    coverageItems: coverageItems.map(
      (c): CoverageRow => ({
        category: c.category,
        description: c.description ?? "",
        sumInsured: c.sumInsured != null ? String(c.sumInsured) : "",
        excess: c.excess != null ? String(c.excess) : "",
        conditions: c.conditions ?? "",
      }),
    ),
    premiumLineItems: premiumLineItems.map(
      (p): PremiumRow => ({
        label: p.label,
        kind: p.kind,
        amount: String(p.amount),
      }),
    ),
  };

  return (
    <div className="max-w-3xl">
      <PageHeader
        title={`${POLICY_TYPE_LABELS[policy.policyType] ?? policy.policyType} insurance`}
        description={`${policy.scheme.name} · Policy ${policy.policyNumber}`}
        backHref={`/adviser/schemes/${id}/insurance`}
        backLabel="Insurance"
      />

      {/* Summary */}
      <Card className="mb-6">
        <div className="flex flex-wrap items-center gap-3 text-sm text-ink-muted mb-4">
          <StatusChip status={effectiveStatus} />
          <span>·</span>
          <span>{policy.insurer}</span>
          {policy.broker ? (
            <>
              <span>·</span>
              <span>Broker: {policy.broker}</span>
            </>
          ) : null}
          {effectiveStatus === "ACTIVE" && untilExpiry >= 0 ? (
            <>
              <span>·</span>
              <span>{untilExpiry} days to expiry</span>
            </>
          ) : null}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-xs text-ink-muted">Sum insured</p>
            <p className="font-medium text-ink tabular-nums">
              {formatMoney(String(policy.coverageAmount), policy.currency ?? "AUD")}
            </p>
          </div>
          <div>
            <p className="text-xs text-ink-muted">Premium</p>
            <p className="font-medium text-ink tabular-nums">
              {formatMoney(
                policy.totalPremium != null
                  ? String(policy.totalPremium)
                  : String(policy.premium),
                policy.currency ?? "AUD",
              )}
            </p>
          </div>
          {policy.excessAmount ? (
            <div>
              <p className="text-xs text-ink-muted">Default excess</p>
              <p className="font-medium text-ink tabular-nums">
                {formatMoney(String(policy.excessAmount), policy.currency ?? "AUD")}
              </p>
            </div>
          ) : null}
          <div>
            <p className="text-xs text-ink-muted">Period</p>
            <p className="font-medium text-ink">
              {formatDate(String(policy.startDate))} to{" "}
              {formatDate(String(policy.endDate))}
            </p>
          </div>
          {policy.renewalDate ? (
            <div>
              <p className="text-xs text-ink-muted">Renewal date</p>
              <p className="font-medium text-ink">
                {formatDate(String(policy.renewalDate))}
              </p>
            </div>
          ) : null}
          {policy.paymentStatus ? (
            <div>
              <p className="text-xs text-ink-muted">Payment</p>
              <p className="font-medium text-ink">
                {policy.paymentStatus.charAt(0) +
                  policy.paymentStatus.slice(1).toLowerCase().replace("_", " ")}
              </p>
            </div>
          ) : null}
        </div>
      </Card>

      {/* Coverage items */}
      {coverageItems.length > 0 ? (
        <Card className="mb-6">
          <CardHeader title="Coverage" />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-muted border-b border-line">
                  <th className="py-2 pr-4 font-medium">Category</th>
                  <th className="py-2 pr-4 font-medium">Description</th>
                  <th className="py-2 pr-4 font-medium text-right">Sum insured</th>
                  <th className="py-2 font-medium text-right">Excess</th>
                </tr>
              </thead>
              <tbody>
                {coverageItems.map((c) => (
                  <tr key={c.id} className="border-b border-line/60">
                    <td className="py-2 pr-4 text-ink">
                      {COVERAGE_CATEGORY_LABELS[c.category] ?? c.category}
                    </td>
                    <td className="py-2 pr-4 text-ink-muted">{c.description ?? ""}</td>
                    <td className="py-2 pr-4 text-ink text-right tabular-nums">
                      {c.sumInsured != null ? formatMoney(String(c.sumInsured)) : ""}
                    </td>
                    <td className="py-2 text-ink text-right tabular-nums">
                      {c.excess != null ? formatMoney(String(c.excess)) : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {/* Premium line items */}
      {premiumLineItems.length > 0 ? (
        <Card className="mb-6">
          <CardHeader title="Premium breakdown" />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {premiumLineItems.map((p) => (
                  <tr key={p.id} className="border-b border-line/60">
                    <td className="py-2 pr-4 text-ink">{p.label}</td>
                    <td className="py-2 pr-4 text-ink-muted">
                      {PREMIUM_KIND_LABELS[p.kind] ?? p.kind}
                    </td>
                    <td className="py-2 text-ink text-right tabular-nums">
                      {formatMoney(String(p.amount))}
                    </td>
                  </tr>
                ))}
                {policy.totalPremium != null ? (
                  <tr className="font-semibold">
                    <td className="py-2 pr-4 text-ink">Total payable</td>
                    <td></td>
                    <td className="py-2 text-ink text-right tabular-nums">
                      {formatMoney(String(policy.totalPremium))}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {/* Detail */}
      {policy.coverageSummary ||
      policy.exclusions ||
      policy.conditions ||
      policy.endorsements ||
      policy.notes ? (
        <Card className="mb-6">
          <CardHeader title="Policy detail" />
          <div className="space-y-3 text-sm">
            {([
              ["Coverage summary", policy.coverageSummary],
              ["Key exclusions", policy.exclusions],
              ["Conditions", policy.conditions],
              ["Endorsements", policy.endorsements],
              ["Internal notes", policy.notes],
            ] as const).map(([label, value]) =>
              value ? (
                <div key={label}>
                  <p className="text-xs font-medium text-ink-muted">{label}</p>
                  <p className="text-ink whitespace-pre-wrap">{value}</p>
                </div>
              ) : null,
            )}
          </div>
        </Card>
      ) : null}

      {/* Documents */}
      <InsuranceDocumentsSection
        schemeId={id}
        policyId={policyId}
        documents={documents}
      />

      {/* Edit form */}
      <Card className="mb-6">
        <CardHeader title="Edit policy" />
        <InsurancePolicyEditForm
          schemeId={id}
          policyId={policyId}
          defaults={defaults}
        />
      </Card>

      {/* Danger zone */}
      <Card className="border-red-200">
        <CardHeader
          title="Danger zone"
          description="Archiving a policy hides it from active views. It can be restored by support."
        />
        <DeleteInsuranceButton schemeId={id} policyId={policyId} />
      </Card>
    </div>
  );
}
