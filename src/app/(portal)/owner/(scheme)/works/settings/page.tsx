import { connection } from "next/server";
import { getSelectedOwnerScheme } from "@/lib/owner/selected-scheme";
import { approvedContractors, getPreferredContractors, getWorksSettings } from "@/lib/works/settings";
import { committeeMembers } from "@/lib/works/review";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PreferredContractors, WorksSettingsForm } from "@/components/works/settings-form";

/**
 * The committee's works settings (works marketplace stage 1, 25 Oct 2026):
 * who must agree a decision, the urgent spending limit, any delegation to
 * the Adviser, and the preferred contractor for each trade.
 */
export default async function WorksSettingsPage() {
  await connection();
  const selected = await getSelectedOwnerScheme(["COMMITTEE"]);
  const header = <PageHeader title="Works settings" description="How the committee decides works requests for this building." backHref="/owner/works" backLabel="Works requests" />;
  if (!selected) {
    return (
      <div className="max-w-3xl">
        {header}
        <EmptyState title="For the committee" description="Only committee members of the selected building can change its works settings." />
      </div>
    );
  }
  const { schemeId } = selected;
  const [settings, members, preferred, contractors] = await Promise.all([
    getWorksSettings(schemeId),
    committeeMembers(schemeId),
    getPreferredContractors(schemeId),
    approvedContractors(),
  ]);

  return (
    <div className="max-w-3xl space-y-6">
      {header}
      <Card>
        <CardHeader title="Decisions" description="Changes are recorded in the building's activity log." />
        <WorksSettingsForm schemeId={schemeId} current={settings} committeeSize={members.length} readOnly={false} />
      </Card>
      <Card>
        <CardHeader title="Preferred contractors" description="For urgent works, the building's chosen contractor for each trade." />
        <PreferredContractors
          schemeId={schemeId}
          rows={preferred.map((p) => ({ trade: p.trade, name: p.name, approved: p.approved }))}
          contractors={contractors.map((c) => ({ id: c.id, name: c.name, suburb: c.suburb, trades: c.trades }))}
          canEdit
        />
      </Card>
    </div>
  );
}
