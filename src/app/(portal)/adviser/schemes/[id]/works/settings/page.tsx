import { connection } from "next/server";
import { requirePageAccess } from "@/lib/auth/require-access";
import { approvedContractors, getPreferredContractors, getWorksSettings } from "@/lib/works/settings";
import { committeeMembers } from "@/lib/works/review";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { PreferredContractors, WorksSettingsForm } from "@/components/works/settings-form";

/**
 * The building's works settings, for the Adviser (works marketplace stage 1,
 * 25 Oct 2026). The committee sets the rules; the Adviser sees them and can
 * keep the preferred contractor list.
 */
export default async function AdviserWorksSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const access = await requirePageAccess(id, "works.preferred");
  if (!access) return null;
  const [settings, members, preferred, contractors] = await Promise.all([
    getWorksSettings(id),
    committeeMembers(id),
    getPreferredContractors(id),
    approvedContractors(),
  ]);

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Works settings" description="Set by the committee in the owner portal." backHref={`/adviser/schemes/${id}/works`} backLabel="Works" />
      <Card>
        <CardHeader title="Decisions" description="Only the committee can change these." />
        <WorksSettingsForm schemeId={id} current={settings} committeeSize={members.length} readOnly />
      </Card>
      <Card>
        <CardHeader title="Preferred contractors" description="For urgent works, the building's chosen contractor for each trade." />
        <PreferredContractors
          schemeId={id}
          rows={preferred.map((p) => ({ trade: p.trade, name: p.name, approved: p.approved }))}
          contractors={contractors.map((c) => ({ id: c.id, name: c.name, suburb: c.suburb, trades: c.trades }))}
          canEdit
        />
      </Card>
    </div>
  );
}
