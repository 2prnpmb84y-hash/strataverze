import { requireCommitteeAccess } from "@/lib/queries/committee-access";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { CommitteeMeetingForm } from "../committee-meeting-form";
import { connection } from "next/server";

export default async function NewCommitteeMeetingPage() {
  await connection();
  const access = await requireCommitteeAccess();
  if (!access) return null;

  const { schemes } = access;
  if (schemes.length === 0) return null;

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Schedule Meeting"
        description="Create a new meeting for your scheme."
        backHref="/owner/governance"
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
