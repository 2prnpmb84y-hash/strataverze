import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemeById } from "@/lib/queries/schemes";
import { getWorksContractById, getVariationsForContract } from "@/lib/queries/works";
import { PageHeader } from "@/components/ui/page-header";
import { StatusChip } from "@/components/ui/status-chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

function formatCurrency(value: number | string | null): string {
  const num = Number(value ?? 0);
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(num);
}

export default async function VariationsListPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; contractId: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  await connection();
  const { id, contractId } = await params;
  const { status } = await searchParams;

  const profile = await getCurrentProfile();
  if (!profile) return null;

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();

  const contract = await getWorksContractById(contractId);
  if (!contract) notFound();

  const variations = await getVariationsForContract(contractId, { status });

  const basePath = `/adviser/schemes/${id}/works/contracts/${contractId}/variations`;

  const statuses = [
    { value: "", label: "All" },
    { value: "DRAFT", label: "Draft" },
    { value: "SUBMITTED", label: "Submitted" },
    { value: "UNDER_REVIEW", label: "Under Review" },
    { value: "APPROVED", label: "Approved" },
    { value: "REJECTED", label: "Rejected" },
    { value: "WITHDRAWN", label: "Withdrawn" },
  ];

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title="Variations"
        description={`Contract ${contract.contractNumber} — ${contract.title}`}
        backHref={`/adviser/schemes/${id}/works/contracts/${contractId}`}
        backLabel="Contract"
        action={
          <Button href={`${basePath}/new`}>
            New Variation
          </Button>
        }
      />

      {/* Status filter */}
      <div className="flex flex-wrap gap-2">
        {statuses.map((s) => (
          <Link
            key={s.value}
            href={s.value ? `${basePath}?status=${s.value}` : basePath}
            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              (status ?? "") === s.value
                ? "bg-accent text-on-accent"
                : "bg-muted text-ink-muted hover:bg-muted/70"
            }`}
          >
            {s.label}
          </Link>
        ))}
      </div>

      {variations.length === 0 ? (
        <EmptyState
          icon="file-text"
          title="No variations"
          description={
            status
              ? "No variations match the selected filter."
              : "No variations have been raised for this contract."
          }
          actionLabel="New Variation"
          actionHref={`${basePath}/new`}
        />
      ) : (
        <Card>
          <div className="flex flex-col divide-y divide-line">
            {variations.map((variation) => {
              const costNum = Number(variation.costImpact);
              const costColour =
                costNum > 0
                  ? "text-red-600"
                  : costNum < 0
                    ? "text-green-600"
                    : "text-ink";

              return (
                <Link
                  key={variation.id}
                  href={`${basePath}/${variation.id}`}
                  className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-muted/50 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink truncate">
                      #{variation.variationNumber} — {variation.title}
                    </p>
                    <p className="text-xs text-ink-muted mt-0.5">
                      Requested by {variation.requestedBy.firstName}{" "}
                      {variation.requestedBy.lastName}
                      {variation.timeImpact
                        ? ` · ${variation.timeImpact > 0 ? "+" : ""}${variation.timeImpact} day${Math.abs(variation.timeImpact) === 1 ? "" : "s"}`
                        : null}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className={`text-sm font-medium ${costColour}`}>
                      {costNum > 0 ? "+" : ""}
                      {formatCurrency(costNum)}
                    </span>
                    <StatusChip status={variation.status} />
                  </div>
                </Link>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
