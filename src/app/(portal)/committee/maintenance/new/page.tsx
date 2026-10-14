import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemesForCommittee } from "@/lib/queries/schemes";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { CommitteeWorkOrderForm } from "../committee-work-order-form";

export default async function NewCommitteeWorkOrderPage() {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const schemes = await getSchemesForCommittee(profile.id);
  if (schemes.length === 0) return null;

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Raise Work Order"
        description="Report a maintenance issue for your scheme."
        backHref="/committee/maintenance"
        backLabel="Maintenance"
      />
      <Card>
        <CommitteeWorkOrderForm
          schemes={schemes.map((s) => ({ id: s.id, name: s.name }))}
        />
      </Card>
    </div>
  );
}
