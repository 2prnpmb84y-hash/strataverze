import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemeById, getSchemesForOwner } from "@/lib/queries/schemes";
import { getVerifiedSelectedSchemeId } from "@/lib/owner/selected-scheme";
import { SchemeDetailHeader } from "@/components/scheme-detail-header";
import {
  formatBuildingClass,
  formatEnumLabel,
  formatSchemeAddress,
  ownerSchemeNav,
} from "@/lib/navigation/scheme-nav";

/**
 * Persistent scheme header for the owner portal. Shows the scheme the owner
 * picked (or their only scheme), after checking they are an active member.
 * Renders nothing when no single scheme applies.
 */
export async function OwnerSchemeHeaderSection() {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  let schemeId = await getVerifiedSelectedSchemeId();
  if (!schemeId) {
    const ownerSchemes = await getSchemesForOwner(profile.id);
    if (ownerSchemes.length !== 1) return null;
    schemeId = ownerSchemes[0].id;
  }

  const scheme = await getSchemeById(schemeId);
  if (!scheme) return null;

  // getSchemeById returns active memberships only
  const myMemberships = scheme.memberships.filter(
    (m) => m.profileId === profile.id && (m.role === "OWNER" || m.role === "COMMITTEE"),
  );
  if (myMemberships.length === 0) return null;
  const isCommittee = myMemberships.some((m) => m.role === "COMMITTEE");

  return (
    <SchemeDetailHeader
      backHref="/owner"
      backLabel="My properties"
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
      navButtons={ownerSchemeNav({ isCommittee })}
    />
  );
}
