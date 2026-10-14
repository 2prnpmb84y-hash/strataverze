import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemesForCommittee } from "@/lib/queries/schemes";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { CommitteeMeetingForm } from "../committee-meeting-form";

export default async function NewCommitteeMeetingPage() {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const schemes = await getSchemesForCommittee(profile.id);
  if (schemes.length === 0) return null;

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Schedule Meeting"
        description="Create a new meeting for your scheme."
        backHref="/committee/governance"
        backLabel="Governance"
      />
      <Card>
        <CommitteeMeetingForm
          schemes={schemes.map((s) => ({ id: s.id, name: s.name }))}
        />
      </Card>
    </div>
  );
}
