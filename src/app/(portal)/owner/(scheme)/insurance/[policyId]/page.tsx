import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemesForOwner } from "@/lib/queries/schemes";
import { getPolicyWithItems } from "@/lib/queries/insurance";
import { getPolicyDocumentsWithHistory } from "@/lib/queries/insurance-documents";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { StatusChip } from "@/components/ui/status-chip";
import { OwnerDocuments } from "./owner-documents";
import {
  POLICY_TYPE_LABELS,
  COVERAGE_CATEGORY_LABELS,
} from "@/lib/insurance/constants";
import { formatMoney } from "@/lib/insurance/premium";
import { derivePolicyStatus } from "@/lib/insurance/status";
import { connection } from "next/server";

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function OwnerPolicyDetailPage({
  params,
}: {
  params: Promise<{ policyId: string }>;
}) {
  await connection();
  const { policyId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const schemes = await getSchemesForOwner(profile.id);
  const schemeIds = new Set(schemes.map((s) => s.id));

  const policy = await getPolicyWithItems(policyId);
  if (!policy || !schemeIds.has(policy.schemeId)) notFound();

  const status = derivePolicyStatus({
    startDate: new Date(String(policy.startDate)),
    endDate: new Date(String(policy.endDate)),
    status: policy.status,
  });
  const coverageItems = policy.coverageItems ?? [];
  const documents = (await getPolicyDocumentsWithHistory(policyId)).map((d) => ({
    id: d.id,
    title: d.title,
    category: d.category,
    fileName: d.fileName,
    fileUrl: d.fileUrl,
    version: d.version,
    uploadedAt: d.uploadedAt,
  }));

  return (
    <div className="max-w-3xl">
      <PageHeader
        title={`${POLICY_TYPE_LABELS[policy.policyType] ?? policy.policyType} insurance`}
        description={`${policy.scheme.name} · Policy ${policy.policyNumber}`}
        backHref="/owner/insurance"
        backLabel="Insurance"
      />

      <Card className="mb-6">
        <div className="flex flex-wrap items-center gap-3 text-sm text-ink-muted mb-4">
          <StatusChip status={status} />
          <span>·</span>
          <span>{policy.insurer}</span>
          {policy.broker ? (
            <>
              <span>·</span>
              <span>Broker: {policy.broker}</span>
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
          <div>
            <p className="text-xs text-ink-muted">Period</p>
            <p className="font-medium text-ink">
              {fmtDate(String(policy.startDate))} to {fmtDate(String(policy.endDate))}
            </p>
          </div>
        </div>
      </Card>

      {coverageItems.length > 0 && (
        <Card className="mb-6">
          <CardHeader title="Coverage" />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-muted border-b border-line">
                  <th className="py-2 pr-4 font-medium">Category</th>
                  <th className="py-2 pr-4 font-medium">Description</th>
                  <th className="py-2 font-medium text-right">Sum insured</th>
                </tr>
              </thead>
              <tbody>
                {coverageItems.map((c) => (
                  <tr key={c.id} className="border-b border-line/60">
                    <td className="py-2 pr-4 text-ink">
                      {COVERAGE_CATEGORY_LABELS[c.category] ?? c.category}
                    </td>
                    <td className="py-2 pr-4 text-ink-muted">{c.description ?? ""}</td>
                    <td className="py-2 text-ink text-right tabular-nums">
                      {c.sumInsured != null ? formatMoney(String(c.sumInsured)) : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card className="mb-6">
        <CardHeader title="Documents" description="Policy documents for your scheme." />
        <OwnerDocuments schemeId={policy.schemeId} documents={documents} />
      </Card>

      {policy.coverageSummary ? (
        <Card>
          <CardHeader title="Coverage summary" />
          <p className="text-sm text-ink whitespace-pre-wrap">{policy.coverageSummary}</p>
        </Card>
      ) : null}
    </div>
  );
}
