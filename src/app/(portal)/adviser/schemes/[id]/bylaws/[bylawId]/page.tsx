import { notFound } from "next/navigation";
import { getBylawById } from "@/lib/queries/bylaws";
import { getSchemeById } from "@/lib/queries/schemes";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { BylawEditForm } from "../bylaw-form";
import { DeleteBylawButton } from "./delete-bylaw-button";
import { connection } from "next/server";

const statusLabels: Record<string, string> = {
  ACTIVE: "Active",
  AMENDED: "Amended",
  REPEALED: "Repealed",
};

const statusStyles: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-700",
  AMENDED: "bg-amber-100 text-amber-700",
  REPEALED: "bg-red-100 text-red-700",
};

const categoryLabels: Record<string, string> = {
  GENERAL: "General",
  SAFETY: "Safety and Security",
  PARKING: "Parking",
  PETS: "Pets",
  NOISE: "Noise",
  APPEARANCE: "Appearance",
  BEHAVIOUR: "Behaviour",
  OTHER: "Other",
};

export default async function BylawDetailPage({
  params,
}: {
  params: Promise<{ id: string; bylawId: string }>;
}) {
  await connection();
  const { id, bylawId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();

  const isAdviser = scheme.memberships.some(
    (m) => m.profileId === profile.id && m.role === "ADVISER",
  );
  if (!isAdviser) notFound();

  const bylaw = await getBylawById(bylawId);
  if (!bylaw || bylaw.schemeId !== id) notFound();

  const effectiveDate = new Date(String(bylaw.effectiveDate));

  return (
    <div className="max-w-2xl">
      <PageHeader
        title={`By-law ${bylaw.bylawNumber}: ${bylaw.title}`}
        description={bylaw.scheme.name}
        backHref={`/adviser/schemes/${id}`}
        backLabel="Scheme"
      />

      {/* Meta info */}
      <Card className="mb-6">
        <div className="flex flex-wrap items-center gap-3 text-sm text-ink-muted">
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyles[bylaw.status] ?? "bg-gray-100 text-gray-700"}`}
          >
            {statusLabels[bylaw.status] ?? bylaw.status}
          </span>
          <span>·</span>
          <span>
            {categoryLabels[bylaw.category] ?? bylaw.category}
          </span>
          <span>·</span>
          <span>
            Effective{" "}
            {effectiveDate.toLocaleDateString("en-AU", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </span>
          {bylaw.amendedDate ? (
            <>
              <span>·</span>
              <span>
                Amended{" "}
                {new Date(String(bylaw.amendedDate)).toLocaleDateString(
                  "en-AU",
                  { day: "numeric", month: "short", year: "numeric" },
                )}
              </span>
            </>
          ) : null}
          {bylaw.repealedDate ? (
            <>
              <span>·</span>
              <span>
                Repealed{" "}
                {new Date(String(bylaw.repealedDate)).toLocaleDateString(
                  "en-AU",
                  { day: "numeric", month: "short", year: "numeric" },
                )}
              </span>
            </>
          ) : null}
          {bylaw.motionRef ? (
            <>
              <span>·</span>
              <span>{bylaw.motionRef}</span>
            </>
          ) : null}
        </div>
        <div className="mt-4 text-sm text-ink leading-relaxed whitespace-pre-wrap">
          {bylaw.body}
        </div>
        {bylaw.notes ? (
          <div className="mt-4 rounded-[var(--radius-card)] bg-muted px-4 py-3">
            <p className="text-xs font-medium text-ink-muted mb-1">
              Notes
            </p>
            <p className="text-sm text-ink whitespace-pre-wrap">
              {bylaw.notes}
            </p>
          </div>
        ) : null}
      </Card>

      {/* Edit form */}
      <Card className="mb-6">
        <CardHeader title="Edit By-law" />
        <BylawEditForm
          schemeId={id}
          bylawId={bylawId}
          defaults={{
            title: bylaw.title,
            body: bylaw.body,
            category: bylaw.category,
            status: bylaw.status,
            effectiveDate: String(bylaw.effectiveDate),
            amendedDate: bylaw.amendedDate
              ? String(bylaw.amendedDate)
              : null,
            repealedDate: bylaw.repealedDate
              ? String(bylaw.repealedDate)
              : null,
            motionRef: bylaw.motionRef,
            notes: bylaw.notes,
          }}
        />
      </Card>

      {/* Danger zone */}
      <Card className="border-red-200">
        <CardHeader
          title="Danger Zone"
          description="This action cannot be undone."
        />
        <DeleteBylawButton schemeId={id} bylawId={bylawId} />
      </Card>
    </div>
  );
}
