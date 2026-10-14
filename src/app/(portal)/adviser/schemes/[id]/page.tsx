import Link from "next/link";
import { notFound } from "next/navigation";
import { getSchemeById } from "@/lib/queries/schemes";
import { getLotsForScheme } from "@/lib/queries/lots";
import { getLeviesForScheme } from "@/lib/queries/levies";
import { getMeetingsForScheme } from "@/lib/queries/meetings";
import { getDocumentsForScheme } from "@/lib/queries/documents";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { SchemeForm } from "../scheme-form";
import { DeleteSchemeButton } from "./delete-button";

export default async function SchemeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();

  const lots = await getLotsForScheme(id);
  const levies = await getLeviesForScheme(id);
  const meetings = await getMeetingsForScheme(id);
  const documents = await getDocumentsForScheme(id);

  // Check the current user is an adviser on this scheme
  const isAdviser = scheme.memberships.some(
    (m) => m.profileId === profile.id && m.role === "ADVISER",
  );
  if (!isAdviser) notFound();

  const ownerCount = scheme.memberships.filter(
    (m) => m.role === "OWNER",
  ).length;

  const committeeCount = scheme.memberships.filter(
    (m) => m.role === "COMMITTEE",
  ).length;

  return (
    <div className="max-w-3xl">
      <PageHeader
        title={scheme.name}
        description={`${scheme.planNumber} · ${scheme.suburb}, ${scheme.state} ${scheme.postcode}`}
        backHref="/adviser/schemes"
        backLabel="Schemes"
      />

      {/* Quick stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <StatCard
          label="Lots"
          value={scheme.totalLots}
          accent="bg-adviser"
        />
        <StatCard
          label="Entitlement"
          value={scheme.totalEntitlement}
          accent="bg-adviser"
        />
        <StatCard
          label="Owners"
          value={ownerCount}
          accent="bg-owner"
        />
        <StatCard
          label="Committee"
          value={committeeCount}
          accent="bg-committee"
        />
      </div>

      {/* Funds summary */}
      {scheme.funds.length > 0 && (
        <Card className="mb-6">
          <CardHeader title="Funds" />
          <div className="flex flex-col gap-2">
            {scheme.funds.map((fund) => (
              <div
                key={fund.id}
                className="flex items-center justify-between rounded-lg bg-muted px-4 py-3"
              >
                <span className="text-sm font-medium text-foreground">
                  {fund.name}
                </span>
                <span className="text-xs text-muted-foreground uppercase tracking-wide">
                  {fund.fundType === "ADMIN"
                    ? "Administrative"
                    : fund.fundType === "SINKING"
                      ? "Capital Works"
                      : fund.fundType}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Lots */}
      <Card className="mb-6">
        <CardHeader
          title="Lots"
          description={`${lots.length} of ${scheme.totalLots} lots registered.`}
          action={
            <Button href={`/adviser/schemes/${id}/lots/new`} variant="secondary">
              Add Lot
            </Button>
          }
        />
        {lots.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="pb-2 font-medium text-muted-foreground">Lot</th>
                  <th className="pb-2 font-medium text-muted-foreground">Unit</th>
                  <th className="pb-2 font-medium text-muted-foreground">Type</th>
                  <th className="pb-2 font-medium text-muted-foreground text-right">Entitlement</th>
                  <th className="pb-2 font-medium text-muted-foreground">Owner</th>
                </tr>
              </thead>
              <tbody>
                {lots.map((lot) => {
                  const owner = lot.memberships.find(
                    (m) => m.role === "OWNER",
                  );
                  return (
                    <tr key={lot.id} className="border-b border-border last:border-0">
                      <td className="py-3">
                        <Link
                          href={`/adviser/schemes/${id}/lots/${lot.id}`}
                          className="font-medium text-foreground hover:text-primary-500 transition-colors"
                        >
                          {lot.lotNumber}
                        </Link>
                      </td>
                      <td className="py-3 text-muted-foreground">
                        {lot.unitNumber ?? "—"}
                      </td>
                      <td className="py-3 text-muted-foreground">
                        {lot.lotType.charAt(0) + lot.lotType.slice(1).toLowerCase()}
                      </td>
                      <td className="py-3 text-right font-variant-numeric tabular-nums">
                        {lot.entitlement}
                      </td>
                      <td className="py-3 text-muted-foreground">
                        {owner
                          ? `${owner.profile.firstName} ${owner.profile.lastName}`.trim() || owner.profile.email
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No lots registered yet. Add lots to start assigning owners.
          </p>
        )}
      </Card>

      {/* Levies */}
      <Card className="mb-6">
        <CardHeader
          title="Levies"
          description={
            levies.length === 0
              ? "No levies created yet."
              : `${levies.length} lev${levies.length === 1 ? "y" : "ies"} created.`
          }
          action={
            <Button href={`/adviser/schemes/${id}/levies/new`} variant="secondary">
              Create Levy
            </Button>
          }
        />
        {levies.length > 0 ? (
          <div className="flex flex-col gap-2">
            {levies.map((levy) => {
              const total = Number(levy.totalAmount);
              const paid = levy.items.reduce(
                (sum, item) => sum + Number(item.paidAmount),
                0,
              );
              const dueDate = new Date(String(levy.dueDate));

              const statusStyle: Record<string, string> = {
                DRAFT: "bg-gray-100 text-gray-700",
                ISSUED: "bg-blue-100 text-blue-700",
                PAID: "bg-green-100 text-green-700",
                OVERDUE: "bg-red-100 text-red-700",
              };

              return (
                <Link
                  key={levy.id}
                  href={`/adviser/schemes/${id}/levies/${levy.id}`}
                  className="flex items-center justify-between rounded-lg bg-muted px-4 py-3 hover:bg-muted/70 transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {levy.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Due{" "}
                      {dueDate.toLocaleDateString("en-AU", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                      {" · "}
                      ${total.toLocaleString("en-AU", {
                        minimumFractionDigits: 2,
                      })}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {paid > 0 && paid < total && (
                      <span className="text-xs text-muted-foreground">
                        {Math.round((paid / total) * 100)}% collected
                      </span>
                    )}
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyle[levy.status] ?? "bg-gray-100 text-gray-700"}`}
                    >
                      {levy.status.charAt(0) + levy.status.slice(1).toLowerCase()}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Create a levy to start billing lot owners.
          </p>
        )}
      </Card>

      {/* Meetings */}
      <Card className="mb-6">
        <CardHeader
          title="Meetings"
          description={
            meetings.length === 0
              ? "No meetings scheduled yet."
              : `${meetings.length} meeting${meetings.length === 1 ? "" : "s"} on record.`
          }
          action={
            <Button href={`/adviser/schemes/${id}/meetings/new`} variant="secondary">
              Schedule Meeting
            </Button>
          }
        />
        {meetings.length > 0 ? (
          <div className="flex flex-col gap-2">
            {meetings.map((meeting) => {
              const scheduledDate = new Date(String(meeting.scheduledAt));
              const motionCount = meeting.motions.length;

              const statusStyle: Record<string, string> = {
                SCHEDULED: "bg-blue-100 text-blue-700",
                COMPLETED: "bg-green-100 text-green-700",
                CANCELLED: "bg-gray-100 text-gray-700",
              };

              const meetingTypeShort: Record<string, string> = {
                AGM: "AGM",
                SGM: "SGM",
                COMMITTEE: "Committee",
              };

              return (
                <Link
                  key={meeting.id}
                  href={`/adviser/schemes/${id}/meetings/${meeting.id}`}
                  className="flex items-center justify-between rounded-lg bg-muted px-4 py-3 hover:bg-muted/70 transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {meeting.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {meetingTypeShort[meeting.meetingType] ?? meeting.meetingType}
                      {" · "}
                      {scheduledDate.toLocaleDateString("en-AU", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                      {motionCount > 0 && ` · ${motionCount} motion${motionCount === 1 ? "" : "s"}`}
                    </p>
                  </div>
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyle[meeting.status] ?? "bg-gray-100 text-gray-700"}`}
                  >
                    {meeting.status.charAt(0) + meeting.status.slice(1).toLowerCase()}
                  </span>
                </Link>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Schedule a meeting to manage governance for this scheme.
          </p>
        )}
      </Card>

      {/* Documents */}
      <Card className="mb-6">
        <CardHeader
          title="Documents"
          description={
            documents.length === 0
              ? "No documents uploaded yet."
              : `${documents.length} document${documents.length === 1 ? "" : "s"} uploaded.`
          }
          action={
            <Button href={`/adviser/schemes/${id}/documents/new`} variant="secondary">
              Upload Document
            </Button>
          }
        />
        {documents.length > 0 ? (
          <div className="flex flex-col gap-2">
            {documents.map((doc) => {
              const uploadDate = new Date(String(doc.createdAt));

              const categoryLabels: Record<string, string> = {
                MINUTES: "Minutes",
                INSURANCE: "Insurance",
                BYLAW: "By-laws",
                FINANCIAL: "Financial",
                COMPLIANCE: "Compliance",
                OTHER: "Other",
              };

              return (
                <Link
                  key={doc.id}
                  href={`/adviser/schemes/${id}/documents/${doc.id}`}
                  className="flex items-center justify-between rounded-lg bg-muted px-4 py-3 hover:bg-muted/70 transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {doc.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {categoryLabels[doc.category] ?? doc.category}
                      {" · "}
                      {uploadDate.toLocaleDateString("en-AU", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                  <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                    {doc.fileName.split(".").pop()?.toUpperCase() ?? "FILE"}
                  </span>
                </Link>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Upload documents to keep records for this scheme.
          </p>
        )}
      </Card>

      {/* Edit form */}
      <div className="mb-6">
        <h2 className="font-heading font-semibold text-foreground mb-4">
          Edit Scheme Details
        </h2>
        <SchemeForm
          mode="edit"
          schemeId={scheme.id}
          defaults={{
            name: scheme.name,
            planNumber: scheme.planNumber,
            address: scheme.address,
            suburb: scheme.suburb,
            state: scheme.state,
            postcode: scheme.postcode,
            totalLots: scheme.totalLots,
            totalEntitlement: scheme.totalEntitlement,
            financialYearEnd: scheme.financialYearEnd,
            abnNumber: scheme.abnNumber,
          }}
        />
      </div>

      {/* Danger zone */}
      <Card className="border-red-200">
        <CardHeader
          title="Danger Zone"
          description="Irreversible actions for this scheme."
        />
        <DeleteSchemeButton schemeId={scheme.id} schemeName={scheme.name} />
      </Card>
    </div>
  );
}
