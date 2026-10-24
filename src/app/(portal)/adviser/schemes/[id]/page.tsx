import { notFound, redirect } from "next/navigation";
import { getSchemeById } from "@/lib/queries/schemes";
import { getLotsForScheme } from "@/lib/queries/lots";
import { getLevySchedulesForScheme } from "@/lib/queries/levy-schedules";
import { getMeetingsForScheme } from "@/lib/queries/meetings";
import { getDocumentsForScheme } from "@/lib/queries/documents";
import { getWorkOrdersForScheme } from "@/lib/queries/work-orders";
import { getComplianceForScheme } from "@/lib/queries/compliance";
import { getAnnouncementsForScheme } from "@/lib/queries/announcements";
import { getBylawsForScheme } from "@/lib/queries/bylaws";
import { getInsuranceForScheme } from "@/lib/queries/insurance";
import { getContactsForScheme } from "@/lib/queries/contacts";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getActivityForScheme } from "@/lib/queries/activity-log";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { ActivityTimeline } from "@/components/activity-timeline";
import { SchemeForm } from "../scheme-form";
import { todayInSydney } from "@/lib/onboarding/property-onboarding";
import { DeleteSchemeButton } from "./delete-button";
import { AnnouncementsCard } from "./_sections/announcements-card";
import { FundsCard } from "./_sections/funds-card";
import { LotsCard } from "./_sections/lots-card";
import { LeviesCard } from "./_sections/levies-card";
import { MeetingsCard } from "./_sections/meetings-card";
import { DocumentsCard } from "./_sections/documents-card";
import { WorkOrdersCard } from "./_sections/work-orders-card";
import { ComplianceCard } from "./_sections/compliance-card";
import { BylawsCard } from "./_sections/bylaws-card";
import { InsuranceCard } from "./_sections/insurance-card";
import { ContactsCard } from "./_sections/contacts-card";
import { connection } from "next/server";

/**
 * Scheme main page. The scheme header and section navigation come from the
 * shared scheme layout; this page shows the at-a-glance summary cards beneath it.
 */
export default async function SchemeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const { id } = await params;

  // Old ?tab= links now have their own sections.
  const { tab } = await searchParams;
  if (tab === "lots") redirect(`/adviser/schemes/${id}/lots`);
  if (tab === "documents") redirect(`/adviser/schemes/${id}/documents`);

  const profile = await getCurrentProfile();
  if (!profile) return null;

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();

  // Check the current user is an adviser on this scheme
  const isAdviser = scheme.memberships.some(
    (m) => m.profileId === profile.id && m.role === "ADVISER",
  );
  if (!isAdviser) notFound();

  const [
    lots,
    levies,
    meetings,
    documents,
    workOrders,
    complianceItems,
    announcements,
    bylaws,
    insurancePolicies,
    contacts,
    activities,
  ] = await Promise.all([
    getLotsForScheme(id),
    getLevySchedulesForScheme(id),
    getMeetingsForScheme(id),
    getDocumentsForScheme(id),
    getWorkOrdersForScheme(id),
    getComplianceForScheme(id),
    getAnnouncementsForScheme(id, { includeExpired: true }),
    getBylawsForScheme(id),
    getInsuranceForScheme(id),
    getContactsForScheme(id),
    getActivityForScheme(id, 20),
  ]);

  return (
    <div>
      <AnnouncementsCard id={id} announcements={announcements} />
      <FundsCard id={id} funds={scheme.funds} />
      <LotsCard id={id} lots={lots} totalLots={scheme.totalLots} canAddLots={!!profile?.isPlatformAdmin} />
      <LeviesCard id={id} schedules={levies} />
      <MeetingsCard id={id} meetings={meetings} />
      <DocumentsCard id={id} documents={documents} />
      <WorkOrdersCard id={id} workOrders={workOrders} />
      <ComplianceCard id={id} complianceItems={complianceItems} />
      <BylawsCard id={id} bylaws={bylaws} />
      <InsuranceCard id={id} insurancePolicies={insurancePolicies} />
      <ContactsCard id={id} contacts={contacts} />

      {/* Activity */}
      <Card className="mb-6">
        <CardHeader
          title="Recent Activity"
          description="Actions taken on this scheme."
          action={
            <div className="flex gap-2">
              <Button variant="secondary" href={`/adviser/schemes/${id}/security-log`}>
                Security log
              </Button>
              <Button variant="secondary" href={`/adviser/schemes/${id}/activity`}>
                View All
              </Button>
            </div>
          }
        />
        <ActivityTimeline activities={activities} />
      </Card>

      {/* Edit form */}
      <div className="mb-6">
        <h2 className="font-heading font-semibold text-ink mb-4">
          Edit Scheme Details
        </h2>
        <SchemeForm
          mode="edit"
          schemeId={scheme.id}
          lockCore={!profile?.isPlatformAdmin}
          today={todayInSydney()}
          defaults={{
            name: scheme.name,
            planNumber: scheme.planNumber,
            address: scheme.address,
            suburb: scheme.suburb,
            state: scheme.state,
            postcode: scheme.postcode,
            totalLots: scheme.totalLots,
            totalEntitlement: scheme.totalEntitlement,
            financialYearEnd: scheme.financialYearEnd,
            abnNumber: scheme.abnNumber,
          }}
        />
      </div>

      {/* Danger zone: deleting a building is for StrataVerze only (24 Oct). */}
      {profile?.isPlatformAdmin && (
        <Card className="border-red-200">
          <CardHeader
            title="Danger Zone"
            description="Irreversible actions for this scheme."
          />
          <DeleteSchemeButton schemeId={scheme.id} schemeName={scheme.name} />
        </Card>
      )}
    </div>
  );
}
