import { notFound } from "next/navigation";
import { getSchemeById } from "@/lib/queries/schemes";
import { getLotById } from "@/lib/queries/lots";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { LotForm } from "../lot-form";
import { DeleteLotButton } from "./delete-lot-button";

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

      {/* Current owners */}
      <Card className="mb-6">
        <CardHeader
          title="Owners"
          description={
            owners.length === 0
              ? "No owners assigned to this lot."
              : `${owners.length} owner${owners.length === 1 ? "" : "s"} assigned.`
          }
        />
        {owners.length > 0 && (
          <div className="flex flex-col gap-2">
            {owners.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between rounded-lg bg-muted px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {m.profile.firstName} {m.profile.lastName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {m.profile.email}
                  </p>
                </div>
                <span className="inline-flex items-center rounded-full bg-primary-100 px-2.5 py-0.5 text-xs font-medium text-primary-500">
                  Owner
                </span>
              </div>
            ))}
          </div>
        )}
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
