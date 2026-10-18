import { redirect } from "next/navigation";
import { getCurrentProfile, hasCommitteeRole } from "@/lib/queries/profiles";
import { getSchemeById } from "@/lib/queries/schemes";
import { getSelectedSchemeId } from "@/lib/actions/scheme-selection";
import { getUpcomingMeetingsForOwner } from "@/lib/queries/meetings";
import { getWorkOrdersForSchemes } from "@/lib/queries/work-orders";
import { getLeviesForSchemes } from "@/lib/queries/levies";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ImageGallery } from "@/components/ui/image-gallery";
import { StaticMap } from "@/components/ui/static-map";
import { FinancialCard } from "@/components/ui/financial-card";
import { connection } from "next/server";

const statusLabels: Record<string, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

const statusColours: Record<string, string> = {
  OPEN: "bg-amber-100 text-amber-700",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
  COMPLETED: "bg-green-100 text-green-700",
  CANCELLED: "bg-red-100 text-red-700",
};

/** Quick action definitions for the owner dashboard. */
const quickActions = [
  { label: "Lots / Owners", href: "/owner/scheme", built: true },
  { label: "Levies", href: "/owner/levies", built: true },
  { label: "Financials", href: "/owner/finance", committee: true, built: true },
  { label: "Compliance", href: "/owner/compliance", committee: true, built: true },
  { label: "Insurance", href: "/owner/insurance", built: true },
  { label: "Documents", href: "/owner/documents", built: true },
  { label: "Work Orders", href: "/owner/maintenance", built: true },
  { label: "Meetings", href: "/owner/meetings", built: true },
  { label: "By-laws", href: "/owner/bylaws", built: true },
  { label: "Contacts", href: "/owner/contacts", built: true },
  { label: "Announcements", href: "/owner/announcements", built: true },
  { label: "Governance", href: "/owner/governance", committee: true, built: true },
  { label: "Notifications", href: "/owner/notifications", built: true },
];

export default async function OwnerDashboard() {
  await connection();
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const selectedSchemeId = await getSelectedSchemeId();
  if (!selectedSchemeId) {
    redirect("/owner");
  }

  const scheme = await getSchemeById(selectedSchemeId);
  if (!scheme) {
    redirect("/owner");
  }

  const isCommittee = await hasCommitteeRole(profile.id);

  const schemeIds = [selectedSchemeId];

  // Fetch owner's lots for this scheme
  const ownerMemberships = scheme.memberships.filter(
    (m) => m.profileId === profile.id && m.role === "OWNER",
  );
  const ownerLotIds = new Set(
    ownerMemberships
      .filter((m) => m.lotId)
      .map((m) => m.lotId as string),
  );

  const [meetings, workOrders, levies] = await Promise.all([
    getUpcomingMeetingsForOwner(schemeIds),
    getWorkOrdersForSchemes(schemeIds),
    getLeviesForSchemes(schemeIds),
  ]);

  const upcomingMeetings = meetings.filter((m) => m.status === "SCHEDULED");

  // Calculate outstanding levy balance for owner's lots
  const issuedLevies = levies.filter((l) => l.status === "ISSUED");
  let outstandingBalance = 0;
  let unpaidCount = 0;
  let overdueCount = 0;
  const now = new Date();
  for (const levy of issuedLevies) {
    for (const item of levy.items) {
      if (ownerLotIds.has(item.lotId) && item.status !== "PAID") {
        const owed = Number(item.amount) - Number(item.paidAmount);
        outstandingBalance += owed;
        unpaidCount++;
        if (new Date(String(levy.dueDate)) < now) {
          overdueCount++;
        }
      }
    }
  }

  const activeWorkOrders = workOrders.filter(
    (wo) => wo.status === "OPEN" || wo.status === "IN_PROGRESS",
  );

  const recentWorkOrders = workOrders.slice(0, 5);

  const fullAddress = `${scheme.address}, ${scheme.suburb} ${scheme.state} ${scheme.postcode}`;

  // Build image data for gallery
  const galleryImages = (scheme.images ?? []).map((img) => ({
    id: img.id,
    url: img.url,
    caption: img.caption,
  }));

  // Visible quick actions based on committee role
  const visibleActions = quickActions.filter(
    (a) => !a.committee || isCommittee,
  );

  return (
    <div className="max-w-5xl">
      {/* Back navigation + scheme header */}
      <div className="flex items-center gap-3 mb-1">
        <Button
          variant="ghost"
          href="/owner"
          className="shrink-0 -ml-2 px-2"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            className="text-muted-foreground"
          >
            <path
              d="M12.5 15L7.5 10l5-5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Button>
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="inline-flex items-center rounded-md bg-primary-50 px-2.5 py-0.5 text-xs font-semibold text-primary-500">
              {scheme.planNumber}
            </span>
          </div>
          <h1 className="text-lg font-bold font-heading text-foreground truncate">
            {fullAddress}
          </h1>
        </div>
      </div>

      {/* Media row — image gallery + map */}
      <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
        <ImageGallery images={galleryImages} className="h-56 md:h-64" />
        <StaticMap address={fullAddress} className="h-56 md:h-64" />
      </div>

      {/* Property metadata */}
      <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <MetadataChip label="State" value={scheme.state} />
        <MetadataChip label="Total Lots" value={String(scheme.totalLots)} />
        <MetadataChip
          label="Building Class"
          value={scheme.buildingClass ?? "—"}
        />
        <MetadataChip
          label="Total UOE"
          value={String(scheme.totalEntitlement)}
        />
        <MetadataChip
          label="Building Type"
          value={formatBuildingType(scheme.buildingType)}
        />
      </div>

      {/* Quick actions */}
      <div className="mt-6 flex flex-wrap gap-2">
        {visibleActions.map((action) => (
          <Button
            key={action.label}
            variant={action.built ? "secondary" : "ghost"}
            href={action.href}
            className={
              !action.built
                ? "opacity-60 border border-dashed border-border"
                : ""
            }
          >
            {action.label}
            {!action.built && (
              <span className="ml-1 text-[10px] text-muted-foreground">
                Soon
              </span>
            )}
          </Button>
        ))}
      </div>

      {/* Financial dashboard — committee view */}
      {isCommittee && (
        <div className="mt-8">
          <h2 className="text-lg font-bold font-heading text-foreground mb-4">
            Financial Dashboard
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FinancialCard
              title="Bank Account"
              badge="Reconciled"
              badgeColour="bg-green-100 text-green-700"
              stats={scheme.funds.map((fund) => ({
                label: fund.name,
                value: `$${Number(fund.balance).toLocaleString("en-AU", { minimumFractionDigits: 2 })}`,
                colour:
                  fund.fundType === "ADMIN"
                    ? "bg-primary-400"
                    : fund.fundType === "SINKING"
                      ? "bg-blue-400"
                      : "bg-amber-400",
              }))}
              chartPlaceholderLabel="Account balance chart"
            />

            <FinancialCard
              title="Levies Receivable"
              stats={[
                {
                  label: `${unpaidCount} Awaiting payment`,
                  value: `$${outstandingBalance.toLocaleString("en-AU", { minimumFractionDigits: 2 })}`,
                  colour: "bg-amber-400",
                },
                {
                  label: `${overdueCount} Overdue`,
                  value: overdueCount > 0
                    ? `$${outstandingBalance.toLocaleString("en-AU", { minimumFractionDigits: 2 })}`
                    : "$0.00",
                  colour: "bg-danger",
                },
              ]}
              chartPlaceholderLabel="Levy receivable chart"
              action={
                <Button variant="ghost" href="/owner/levies">
                  View all
                </Button>
              }
            />

            <FinancialCard
              title="Cash Flow"
              stats={[
                { label: "Cash in", value: "—", colour: "bg-green-400" },
                { label: "Cash out", value: "—", colour: "bg-red-400" },
              ]}
              chartPlaceholderLabel="Cash in / out chart"
            />

            <FinancialCard
              title="Bills to Pay"
              stats={[
                {
                  label: "Awaiting payment",
                  value: "—",
                  colour: "bg-amber-400",
                },
                { label: "Overdue", value: "—", colour: "bg-danger" },
              ]}
              chartPlaceholderLabel="Bills chart"
            />
          </div>
        </div>
      )}

      {/* Owner levy summary — non-committee owners see their outstanding balance */}
      {!isCommittee && outstandingBalance > 0 && (
        <Card className="mt-8">
          <CardHeader
            title="Outstanding Levies"
            action={
              <Button variant="ghost" href="/owner/levies">
                View all
              </Button>
            }
          />
          <div className="flex flex-col gap-2">
            {issuedLevies
              .filter((levy) =>
                levy.items.some(
                  (item) =>
                    ownerLotIds.has(item.lotId) && item.status !== "PAID",
                ),
              )
              .slice(0, 3)
              .map((levy) => {
                const ownerItems = levy.items.filter(
                  (item) =>
                    ownerLotIds.has(item.lotId) && item.status !== "PAID",
                );
                const totalOwed = ownerItems.reduce(
                  (sum, item) =>
                    sum + (Number(item.amount) - Number(item.paidAmount)),
                  0,
                );
                const dueDate = new Date(String(levy.dueDate));

                return (
                  <div
                    key={levy.id}
                    className="rounded-lg bg-muted px-4 py-3"
                  >
                    <div className="flex items-start justify-between gap-3 mb-1">
                      <p className="text-sm font-medium text-foreground">
                        {levy.title}
                      </p>
                      <span className="text-sm font-semibold text-foreground">
                        ${totalOwed.toLocaleString("en-AU", { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Due{" "}
                      {dueDate.toLocaleDateString("en-AU", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                );
              })}
          </div>
        </Card>
      )}

      {/* Upcoming meetings */}
      {upcomingMeetings.length > 0 && (
        <Card className="mt-6">
          <CardHeader
            title="Upcoming Meetings"
            action={
              <Button variant="ghost" href="/owner/meetings">
                View all
              </Button>
            }
          />
          <div className="flex flex-col gap-2">
            {upcomingMeetings.slice(0, 3).map((meeting) => {
              const scheduledDate = new Date(String(meeting.scheduledAt));
              const pendingCount = meeting.motions.filter(
                (mo) => mo.status === "PROPOSED",
              ).length;

              return (
                <div
                  key={meeting.id}
                  className="rounded-lg bg-muted px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-3 mb-1">
                    <p className="text-sm font-medium text-foreground">
                      {meeting.title}
                    </p>
                    <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                      Scheduled
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {scheduledDate.toLocaleDateString("en-AU", {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                    {pendingCount > 0 &&
                      ` · ${pendingCount} motion${pendingCount === 1 ? "" : "s"} to vote on`}
                  </p>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Recent work orders */}
      {recentWorkOrders.length > 0 && (
        <Card className="mt-6">
          <CardHeader
            title="Recent Maintenance Requests"
            action={
              <Button variant="ghost" href="/owner/maintenance">
                View all
              </Button>
            }
          />
          <div className="flex flex-col gap-2">
            {recentWorkOrders.map((wo) => {
              const createdDate = new Date(String(wo.createdAt));

              return (
                <div
                  key={wo.id}
                  className="rounded-lg bg-muted px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-3 mb-1">
                    <p className="text-sm font-medium text-foreground">
                      {wo.title}
                    </p>
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColours[wo.status] ?? "bg-gray-100 text-gray-700"}`}
                    >
                      {statusLabels[wo.status] ?? wo.status}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {createdDate.toLocaleDateString("en-AU", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                    {wo.comments.length > 0 &&
                      ` · ${wo.comments.length} comment${wo.comments.length === 1 ? "" : "s"}`}
                  </p>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}

/** Small metadata chip for the property info row */
function MetadataChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-card border border-border px-4 py-3">
      <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide mb-0.5">
        {label}
      </p>
      <p className="text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

function formatBuildingType(type: string | null | undefined): string {
  if (!type) return "—";
  const labels: Record<string, string> = {
    STRATA: "Strata",
    COMMUNITY: "Community",
    COMPANY_TITLE: "Company Title",
    STRATUM: "Stratum",
  };
  return labels[type] ?? type;
}
