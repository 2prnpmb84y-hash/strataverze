import Link from "next/link";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemesForAdviser } from "@/lib/queries/schemes";
import { getWorkOrdersForSchemes } from "@/lib/queries/work-orders";
import { getComplianceForSchemes } from "@/lib/queries/compliance";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardHeader } from "@/components/ui/card";
import { connection } from "next/server";
import { schemeThumbnails } from "@/lib/schemes/photos";
import { SchemeThumb } from "@/components/schemes/scheme-thumb";
import { rulesForState } from "@/lib/jurisdiction/scheme-rules";
import { packWordsFor } from "@/lib/jurisdiction/screen-words";
import { DEFAULT_SCHEME_STATE } from "@/config/jurisdictions";

export default async function AdviserDashboard() {
  await connection();
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const schemes = await getSchemesForAdviser(profile.id);
  const schemeIds = schemes.map((s) => s.id);

  const [workOrders, complianceItems, thumbs] = schemeIds.length > 0
    ? await Promise.all([
        getWorkOrdersForSchemes(schemeIds),
        getComplianceForSchemes(schemeIds),
        // Each building's property photo, signed in one request.
        schemeThumbnails(schemes),
      ])
    : [[], [], {} as Record<string, string | null>];

  const activeWorkOrders = workOrders.filter(
    (wo) => wo.status === "OPEN" || wo.status === "IN_PROGRESS",
  );
  const nonCompliant = complianceItems.filter(
    (c) => c.status === "NON_COMPLIANT" || c.status === "EXPIRED",
  );

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold font-heading text-ink mb-1">
        Adviser Dashboard
      </h1>
      <p className="text-sm text-ink-muted mb-8">
        Oversee schemes, reporting, and operational compliance.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          label="Managed Schemes"
          value={schemes.length}
          accent="bg-adviser"
        />
        <StatCard
          label="Active Work Orders"
          value={activeWorkOrders.length}
          accent="bg-adviser"
        />
        <StatCard
          label="Compliance Alerts"
          value={nonCompliant.length}
          accent={nonCompliant.length > 0 ? "bg-red-500" : "bg-adviser"}
        />
      </div>

      {schemes.length === 0 ? (
        <div className="mt-8 rounded-[var(--radius-card)] bg-white border border-line p-6">
          <h2 className="font-heading font-semibold text-ink mb-2">
            Getting Started
          </h2>
          <p className="text-sm text-ink-muted leading-relaxed">
            Welcome to the Adviser Portal. Create your first scheme from the{" "}
            <Link
              href="/adviser/schemes"
              className="text-turquoise hover:underline"
            >
              Schemes
            </Link>{" "}
            page to begin managing {packWordsFor(rulesForState(DEFAULT_SCHEME_STATE).rules).ownersCorporations}.
          </p>
        </div>
      ) : (
        <Card className="mt-8">
          <CardHeader title="Your Schemes" />
          <div className="flex flex-col gap-2">
            {schemes.map((scheme) => {
              const schemeWo = activeWorkOrders.filter(
                (wo) => wo.schemeId === scheme.id,
              ).length;
              const schemeAlerts = nonCompliant.filter(
                (c) => c.schemeId === scheme.id,
              ).length;

              return (
                <Link
                  key={scheme.id}
                  href={`/adviser/schemes/${scheme.id}`}
                  className="flex items-center justify-between gap-3 rounded-[var(--radius-card)] bg-muted px-4 py-3 hover:bg-muted/70 transition-colors"
                >
                  <div className="flex min-w-0 items-center gap-3">
                  <SchemeThumb url={thumbs[scheme.id] ?? null} name={scheme.name} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">
                      {scheme.name}
                    </p>
                    <p className="text-xs text-ink-muted">
                      {scheme.suburb}, {scheme.state}
                      {schemeWo > 0 && ` · ${schemeWo} active work order${schemeWo === 1 ? "" : "s"}`}
                    </p>
                  </div>
                  </div>
                  {schemeAlerts > 0 && (
                    <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">
                      {schemeAlerts} alert{schemeAlerts === 1 ? "" : "s"}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
