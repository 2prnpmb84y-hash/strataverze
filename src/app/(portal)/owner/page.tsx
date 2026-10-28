import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemesForOwner } from "@/lib/queries/schemes";
import { getSchemeNotificationCounts } from "@/lib/queries/schemes";
import { SchemeGrid } from "./scheme-grid";
import { connection } from "next/server";
import { schemeThumbnails } from "@/lib/schemes/photos";
import { rulesForWords } from "@/lib/jurisdiction/scheme-rules";

export default async function OwnerSchemePicker() {
  await connection();
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const ownerSchemes = await getSchemesForOwner(profile.id);

  // Collect all owner lot IDs for levy notification counting
  const ownerLotIds = new Set(
    ownerSchemes.flatMap((s) =>
      s.memberships
        .filter((m) => m.lotId)
        .map((m) => m.lotId as string),
    ),
  );

  const schemeIds = ownerSchemes.map((s) => s.id);

  // Get notification counts per scheme
  // Counts, and each property's photo signed in one request (these are
  // only the owner's own buildings, so the private photos may be shown).
  const [notificationCounts, thumbs] = await Promise.all([
    getSchemeNotificationCounts(schemeIds, ownerLotIds),
    schemeThumbnails(ownerSchemes),
  ]);

  // Build card data
  const cards = ownerSchemes.map((scheme) => {
    const membership = scheme.memberships[0];
    const counts = notificationCounts.get(scheme.id) ?? {
      pendingLevies: 0,
      activeWorkOrders: 0,
      upcomingMeetings: 0,
    };

    return {
      id: scheme.id,
      name: scheme.name,
      planNumber: scheme.planNumber,
      address: scheme.address,
      suburb: scheme.suburb,
      state: scheme.state,
      postcode: scheme.postcode,
      totalLots: scheme.totalLots,
      lotNumber: membership?.lot?.lotNumber ?? null,
      unitNumber: membership?.lot?.unitNumber ?? null,
      pendingLevies: counts.pendingLevies,
      // The building's own words (the default state's where its state has no pack).
      levyWords: (({ levy, levies }) => ({ levy, levies }))(rulesForWords(scheme.state).TERMINOLOGY),
      activeWorkOrders: counts.activeWorkOrders,
      upcomingMeetings: counts.upcomingMeetings,
      photoUrl: thumbs[scheme.id] ?? null,
    };
  });

  return (
    <div className="max-w-5xl">
      <SchemeGrid
        schemes={cards}
        firstName={profile.firstName}
        canAddProperty={profile.isPlatformAdmin}
      />
    </div>
  );
}
