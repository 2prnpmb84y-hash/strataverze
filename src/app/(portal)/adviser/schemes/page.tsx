import Link from "next/link";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemesForAdviser } from "@/lib/queries/schemes";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default async function AdviserSchemesPage() {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const schemes = await getSchemesForAdviser(profile.id);

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Schemes"
        description="Manage the Owners Corporations you advise."
        action={<Button href="/adviser/schemes/new">Add Scheme</Button>}
      />

      {schemes.length === 0 ? (
        <EmptyState
          icon={
            <svg
              width="40"
              height="40"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          }
          title="No schemes yet"
          description="Create your first scheme to start managing an Owners Corporation."
          actionLabel="Add Scheme"
          actionHref="/adviser/schemes/new"
        />
      ) : (
        <div className="flex flex-col gap-3">
          {schemes.map((scheme) => (
            <Link
              key={scheme.id}
              href={`/adviser/schemes/${scheme.id}`}
              className="block rounded-xl bg-card border border-border p-5 hover:border-primary-300 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-heading font-semibold text-card-foreground">
                    {scheme.name}
                  </h3>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {scheme.planNumber} &middot; {scheme.suburb},{" "}
                    {scheme.state} {scheme.postcode}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <span className="text-xs text-muted-foreground">
                    {scheme.totalLots} lot{scheme.totalLots === 1 ? "" : "s"}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
