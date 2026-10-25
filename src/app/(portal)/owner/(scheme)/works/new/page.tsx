import { connection } from "next/server";
import { getSelectedOwnerScheme } from "@/lib/owner/selected-scheme";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { WorksRequestForm } from "@/components/works/request-form";

/** Report something in the building that needs fixing (works stage 1, 25 Oct 2026). */
export default async function NewWorksRequestPage() {
  await connection();
  const selected = await getSelectedOwnerScheme(["OWNER", "COMMITTEE"]);
  const header = <PageHeader title="Report something" description="Tell the committee what needs fixing in the building's common property. The committee decides how it is handled." backHref="/owner/works" backLabel="Works requests" />;
  if (!selected) {
    return (
      <div className="max-w-2xl">
        {header}
        <EmptyState title="Choose a building" description="Choose a building from My properties first." />
      </div>
    );
  }
  return (
    <div className="max-w-2xl">
      {header}
      <Card>
        <WorksRequestForm schemeId={selected.schemeId} doneHref="/owner/works" />
      </Card>
      <p className="mt-4 text-xs text-ink-muted">Something inside your own lot is usually yours to repair, unless it is common property such as a main water pipe or the building structure. If unsure, report it and the committee will tell you.</p>
    </div>
  );
}
