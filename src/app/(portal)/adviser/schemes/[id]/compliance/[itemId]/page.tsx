import { notFound } from "next/navigation";
import { getSchemeById } from "@/lib/queries/schemes";
import { getComplianceItemById } from "@/lib/queries/compliance";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { ComplianceEditForm } from "../compliance-form";
import { DeleteComplianceButton } from "./delete-compliance-button";
import { ComplianceStatusButton } from "./compliance-status-button";
import { connection } from "next/server";

const statusStyle: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-700",
  COMPLIANT: "bg-green-100 text-green-700",
  NON_COMPLIANT: "bg-red-100 text-red-700",
  EXPIRED: "bg-gray-100 text-gray-700",
};

const categoryLabels: Record<string, string> = {
  INSURANCE: "Insurance",
  FIRE_SAFETY: "Fire Safety",
  OHS: "OH&S",
  BUILDING: "Building",
  OTHER: "Other",
};

export default async function ComplianceDetailPage({
  params,
}: {
  params: Promise<{ id: string; itemId: string }>;
}) {
  await connection();
  const { id, itemId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();

  const isAdviser = scheme.memberships.some(
    (m) => m.profileId === profile.id && m.role === "ADVISER",
  );
  if (!isAdviser) notFound();

  const item = await getComplianceItemById(itemId);
  if (!item || item.schemeId !== id) notFound();

  const createdDate = new Date(String(item.createdAt));

  // Format due date for the date input (YYYY-MM-DD)
  const dueDateValue = item.dueDate
    ? new Date(String(item.dueDate)).toISOString().split("T")[0]
    : null;

  return (
    <div className="max-w-3xl">
      <PageHeader
        title={item.title}
        description={`${categoryLabels[item.category] ?? item.category} · Added ${createdDate.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}`}
        backHref={`/adviser/schemes/${id}`}
        backLabel="Scheme"
      />

      {/* Status and details */}
      <Card className="mb-6">
        <CardHeader title="Status" />
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between rounded-[var(--radius-card)] bg-muted px-4 py-3">
            <p className="text-sm font-medium text-ink">
              Current Status
            </p>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyle[item.status] ?? "bg-gray-100 text-gray-700"}`}
            >
              {item.status.replace("_", " ")}
            </span>
          </div>
          {item.dueDate && (
            <div className="flex items-center justify-between rounded-[var(--radius-card)] bg-muted px-4 py-3">
              <p className="text-sm text-ink-muted">Due Date</p>
              <p className="text-sm font-medium text-ink">
                {new Date(String(item.dueDate)).toLocaleDateString("en-AU", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </p>
            </div>
          )}
          {item.lastChecked && (
            <div className="flex items-center justify-between rounded-[var(--radius-card)] bg-muted px-4 py-3">
              <p className="text-sm text-ink-muted">Last Checked</p>
              <p className="text-sm font-medium text-ink">
                {new Date(String(item.lastChecked)).toLocaleDateString("en-AU", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </p>
            </div>
          )}
          {item.description && (
            <div className="rounded-[var(--radius-card)] bg-muted px-4 py-3">
              <p className="text-xs text-ink-muted mb-0.5">
                Description
              </p>
              <p className="text-sm text-ink">{item.description}</p>
            </div>
          )}
          {item.notes && (
            <div className="rounded-[var(--radius-card)] bg-muted px-4 py-3">
              <p className="text-xs text-ink-muted mb-0.5">Notes</p>
              <p className="text-sm text-ink whitespace-pre-wrap">
                {item.notes}
              </p>
            </div>
          )}
        </div>
      </Card>

      {/* Status actions */}
      <Card className="mb-6">
        <CardHeader
          title="Update Status"
          description="Mark this item as compliant, non-compliant, or expired."
        />
        <ComplianceStatusButton
          schemeId={id}
          itemId={itemId}
          currentStatus={item.status}
        />
      </Card>

      {/* Edit form */}
      <div className="mb-6">
        <h2 className="font-heading font-semibold text-ink mb-4">
          Edit Compliance Item
        </h2>
        <ComplianceEditForm
          schemeId={id}
          itemId={itemId}
          defaults={{
            title: item.title,
            description: item.description,
            category: item.category,
            dueDate: dueDateValue,
            notes: item.notes,
          }}
        />
      </div>

      {/* Danger zone */}
      <Card className="border-red-200">
        <CardHeader
          title="Danger Zone"
          description="Irreversible actions for this compliance item."
        />
        <DeleteComplianceButton
          schemeId={id}
          itemId={itemId}
          itemTitle={item.title}
        />
      </Card>
    </div>
  );
}
