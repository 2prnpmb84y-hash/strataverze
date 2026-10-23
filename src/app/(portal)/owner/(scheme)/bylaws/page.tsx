import { getVerifiedSelectedSchemeId } from "@/lib/owner/selected-scheme";
import { scopeToSelectedScheme } from "@/lib/owner/scheme-scope";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemesForOwner } from "@/lib/queries/schemes";
import { getBylawsForSchemes } from "@/lib/queries/bylaws";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
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

export default async function OwnerBylawsPage() {
  await connection();
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const schemes = scopeToSelectedScheme(
    await getSchemesForOwner(profile.id),
    await getVerifiedSelectedSchemeId(),
  );
  const schemeIds = schemes.map((s) => s.id);
  const bylaws = await getBylawsForSchemes(schemeIds);

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="By-laws Register"
        description="View the by-laws governing your scheme."
      />

      {bylaws.length === 0 ? (
        <Card>
          <p className="text-sm text-ink-muted">
            No by-laws have been registered for your scheme yet.
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {bylaws.map((bylaw) => {
            const effectiveDate = new Date(String(bylaw.effectiveDate));

            return (
              <Card key={bylaw.id}>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <h3 className="text-sm font-semibold text-ink">
                      {bylaw.bylawNumber}. {bylaw.title}
                    </h3>
                    <p className="text-xs text-ink-muted mt-0.5">
                      {bylaw.scheme.name}
                      {" · "}
                      {categoryLabels[bylaw.category] ?? bylaw.category}
                      {" · Effective "}
                      {effectiveDate.toLocaleDateString("en-AU", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                      {bylaw.motionRef ? ` · ${bylaw.motionRef}` : ""}
                    </p>
                  </div>
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium shrink-0 ${statusStyles[bylaw.status] ?? "bg-gray-100 text-gray-700"}`}
                  >
                    {statusLabels[bylaw.status] ?? bylaw.status}
                  </span>
                </div>
                <div className="text-sm text-ink leading-relaxed whitespace-pre-wrap">
                  {bylaw.body}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
