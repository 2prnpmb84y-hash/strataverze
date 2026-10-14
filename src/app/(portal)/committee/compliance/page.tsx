import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemesForCommittee } from "@/lib/queries/schemes";
import { getComplianceForSchemes } from "@/lib/queries/compliance";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";

const statusStyle: Record<string, string> = {
  COMPLIANT: "bg-green-100 text-green-700",
  NON_COMPLIANT: "bg-red-100 text-red-700",
  EXPIRED: "bg-gray-100 text-gray-700",
  PENDING_REVIEW: "bg-yellow-100 text-yellow-700",
};

const statusLabel: Record<string, string> = {
  COMPLIANT: "Compliant",
  NON_COMPLIANT: "Non-Compliant",
  EXPIRED: "Expired",
  PENDING_REVIEW: "Pending Review",
};

const categoryLabels: Record<string, string> = {
  INSURANCE: "Insurance",
  FIRE_SAFETY: "Fire Safety",
  ELECTRICAL: "Electrical",
  ELEVATOR: "Elevator",
  POOL: "Pool",
  WHS: "WH&S",
  OTHER: "Other",
};

export default async function CommitteeCompliancePage() {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const schemes = await getSchemesForCommittee(profile.id);
  const schemeIds = schemes.map((s) => s.id);
  const items = schemeIds.length > 0
    ? await getComplianceForSchemes(schemeIds)
    : [];

  const schemeNames = new Map(schemes.map((s) => [s.id, s.name]));

  const compliant = items.filter((i) => i.status === "COMPLIANT").length;
  const nonCompliant = items.filter((i) => i.status === "NON_COMPLIANT").length;
  const expired = items.filter((i) => i.status === "EXPIRED").length;
  const pendingReview = items.filter((i) => i.status === "PENDING_REVIEW").length;

  // Items needing attention: non-compliant or expired
  const needsAttention = items.filter(
    (i) => i.status === "NON_COMPLIANT" || i.status === "EXPIRED",
  );

  const pendingItems = items.filter((i) => i.status === "PENDING_REVIEW");
  const compliantItems = items.filter((i) => i.status === "COMPLIANT");

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Compliance"
        description="Compliance obligations for your schemes."
      />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <StatCard label="Compliant" value={compliant} accent="bg-green-500" />
        <StatCard label="Non-Compliant" value={nonCompliant} accent="bg-red-500" />
        <StatCard label="Expired" value={expired} accent="bg-gray-400" />
        <StatCard label="Pending Review" value={pendingReview} accent="bg-yellow-500" />
      </div>

      {items.length === 0 ? (
        <Card>
          <div className="p-6 text-center">
            <p className="text-sm text-muted-foreground">
              No compliance items are being tracked for your schemes yet.
            </p>
          </div>
        </Card>
      ) : (
        <>
          {/* Needs attention */}
          {needsAttention.length > 0 && (
            <Card className="mb-6 border-red-200">
              <CardHeader
                title="Needs Attention"
                description={`${needsAttention.length} item${needsAttention.length === 1 ? "" : "s"} require${needsAttention.length === 1 ? "s" : ""} action.`}
              />
              <div className="flex flex-col gap-2">
                {needsAttention.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-lg bg-muted px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {item.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {schemeNames.get(item.schemeId) ?? item.scheme?.name ?? ""}
                        {" · "}
                        {categoryLabels[item.category] ?? item.category}
                        {item.dueDate &&
                          ` · Due ${new Date(String(item.dueDate)).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}`}
                      </p>
                    </div>
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyle[item.status] ?? "bg-gray-100 text-gray-700"}`}
                    >
                      {statusLabel[item.status] ?? item.status.replace("_", " ")}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Pending Review */}
          {pendingItems.length > 0 && (
            <Card className="mb-6">
              <CardHeader
                title="Pending Review"
                description={`${pendingItems.length} item${pendingItems.length === 1 ? "" : "s"} awaiting review.`}
              />
              <div className="flex flex-col gap-2">
                {pendingItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-lg bg-muted px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {item.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {schemeNames.get(item.schemeId) ?? item.scheme?.name ?? ""}
                        {" · "}
                        {categoryLabels[item.category] ?? item.category}
                        {item.dueDate &&
                          ` · Due ${new Date(String(item.dueDate)).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}`}
                      </p>
                    </div>
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyle[item.status] ?? "bg-yellow-100 text-yellow-700"}`}
                    >
                      Pending Review
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Compliant */}
          {compliantItems.length > 0 && (
            <Card>
              <CardHeader
                title="Compliant"
                description={`${compliantItems.length} item${compliantItems.length === 1 ? "" : "s"} up to date.`}
              />
              <div className="flex flex-col gap-2">
                {compliantItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-lg bg-muted px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {item.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {schemeNames.get(item.schemeId) ?? item.scheme?.name ?? ""}
                        {" · "}
                        {categoryLabels[item.category] ?? item.category}
                        {item.lastChecked &&
                          ` · Checked ${new Date(String(item.lastChecked)).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}`}
                      </p>
                    </div>
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyle[item.status]}`}
                    >
                      Compliant
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
