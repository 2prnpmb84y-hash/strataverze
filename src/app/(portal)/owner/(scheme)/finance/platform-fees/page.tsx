import { connection } from "next/server";
import { getSelectedSchemeId } from "@/lib/actions/scheme-selection";
import { scopeToSelectedScheme } from "@/lib/owner/scheme-scope";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemesForCommittee, getSchemesForOwner } from "@/lib/queries/schemes";
import { getLotsForScheme } from "@/lib/queries/lots";
import { getPlatformFeesData } from "@/lib/queries/platform-billing";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { PlatformFeesView } from "@/components/billing/platform-fees-view";

/**
 * StrataVerze fees for the owner's selected scheme. Every StrataVerze charge
 * is visible to owners, so this shows the same detail the strata manager sees.
 * Only schemes the person owns in, or sits on the committee of, are shown.
 */
export default async function OwnerPlatformFeesPage() {
  await connection();
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const [owned, committee] = await Promise.all([
    getSchemesForOwner(profile.id),
    getSchemesForCommittee(profile.id),
  ]);
  const byId = new Map<string, { id: string; name: string }>();
  for (const s of [...owned, ...committee]) byId.set(s.id, { id: s.id, name: String(s.name) });
  const schemes = scopeToSelectedScheme([...byId.values()], await getSelectedSchemeId());

  const header = (
    <PageHeader
      title="StrataVerze Fees"
      description="What StrataVerze charges your owners corporation, and why."
      backHref="/owner/finance"
      backLabel="Finance"
    />
  );

  if (schemes.length === 0) {
    return (
      <div className="space-y-6">
        {header}
        <EmptyState
          title="No properties found"
          description="You are not currently registered as an owner in any strata scheme."
        />
      </div>
    );
  }

  const views = await Promise.all(
    schemes.map(async (s) => {
      const lots = await getLotsForScheme(s.id);
      return { scheme: s, data: await getPlatformFeesData(s.id, lots.length) };
    }),
  );

  return (
    <div className="space-y-8">
      {header}
      {views.map(({ scheme, data }) => (
        <section key={scheme.id} className="space-y-4">
          {views.length > 1 && <h2 className="font-heading font-semibold text-ink">{scheme.name}</h2>}
          <PlatformFeesView data={data} />
        </section>
      ))}
    </div>
  );
}
