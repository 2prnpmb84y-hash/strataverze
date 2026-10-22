import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemeById } from "@/lib/queries/schemes";
import { SchemeDetailHeader } from "@/components/scheme-detail-header";
import {
  adviserSchemeNav,
  formatBuildingClass,
  formatEnumLabel,
  formatSchemeAddress,
} from "@/lib/navigation/scheme-nav";

/**
 * Loads the scheme and renders the persistent scheme header and navigation.
 * Access control for content stays with each page; this only decides whether
 * to show the header (advisers on this scheme).
 */
export async function SchemeHeaderSection({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const scheme = await getSchemeById(id);
  if (!scheme) return null;

  const isAdviser = scheme.memberships.some(
    (m) => m.profileId === profile.id && m.role === "ADVISER",
  );
  if (!isAdviser) return null;

  return (
    <SchemeDetailHeader
      backHref="/adviser/schemes"
      backLabel="All schemes"
      planNumber={scheme.planNumber}
      addressLine={formatSchemeAddress(scheme)}
      fullAddress={formatSchemeAddress(scheme)}
      details={[
        { label: "State", value: scheme.state },
        { label: "Total lots", value: scheme.totalLots },
        { label: "Building class", value: formatBuildingClass(scheme.buildingClass) },
        { label: "Total UOE", value: scheme.totalEntitlement },
        { label: "Building type", value: formatEnumLabel(scheme.buildingType) },
      ]}
      images={(scheme.images ?? []).map((img) => ({
        id: img.id,
        url: img.url,
        caption: img.caption ?? null,
      }))}
      navButtons={adviserSchemeNav(id)}
    />
  );
}
