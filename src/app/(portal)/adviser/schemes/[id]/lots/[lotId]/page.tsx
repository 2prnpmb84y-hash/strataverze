import { notFound } from "next/navigation";
import { getSchemeById } from "@/lib/queries/schemes";
import { getLotById } from "@/lib/queries/lots";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { LotForm } from "../lot-form";
import { DeleteLotButton } from "./delete-lot-button";
import { OwnerAssignment } from "./owner-assignment";

export default async function LotDetailPage({
  params,
}: {
  params: Promise<{ id: string; lotId: string }>;
}) {
  const { id, lotId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();

  const isAdviser = scheme.memberships.some(
    (m) => m.profileId === profile.id && m.role === "ADVISER",
  );
  if (!isAdviser) notFound();

  const lot = await getLotById(lotId);
  if (!lot || lot.schemeId !== id) notFound();

  const owners = lot.memberships.filter((m) => m.role === "OWNER");

  return (
    <div className="max-w-2xl">
      <PageHeader
        title={`Lot ${lot.lotNumber}${lot.unitNumber ? ` (Unit ${lot.unitNumber})` : ""}`}
        description={`${lot.lotType.charAt(0) + lot.lotType.slice(1).toLowerCase()} lot in ${scheme.name}`}
        backHref={`/adviser/schemes/${id}`}
        backLabel={scheme.name}
      />

      {/* Owners */}
      <Card className="mb-6">
        <CardHeader
          title="Owners"
          description="Manage lot ownership by searching for registered profiles."
        />
        <OwnerAssignment
          schemeId={id}
          lotId={lotId}
          owners={owners.map((m) => ({
            id: m.id,
            profile: {
              id: m.profile.id,
              firstName: m.profile.firstName,
              lastName: m.profile.lastName,
              email: m.profile.email,
            },
          }))}
        />
      </Card>

      {/* Edit form */}
      <div className="mb-6">
        <h2 className="font-heading font-semibold text-foreground mb-4">
          Edit Lot Details
        </h2>
        <LotForm
          mode="edit"
          schemeId={id}
          lotId={lotId}
          defaults={{
            lotNumber: lot.lotNumber,
            unitNumber: lot.unitNumber,
            entitlement: lot.entitlement,
            floorArea: lot.floorArea,
            lotType: lot.lotType,
          }}
        />
      </div>

      {/* Danger zone */}
      <Card className="border-red-200">
        <CardHeader
          title="Danger Zone"
          description="Irreversible actions for this lot."
        />
        <DeleteLotButton
          schemeId={id}
          lotId={lotId}
          lotNumber={lot.lotNumber}
        />
      </Card>
    </div>
  );
}
