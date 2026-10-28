import { notFound, redirect } from "next/navigation";
import { schemeToday, timeZoneOf } from "@/lib/jurisdiction/scheme-time";
import { rulesForState } from "@/lib/jurisdiction/scheme-rules";
import { getSchemeById } from "@/lib/queries/schemes";
import { getStrataRollData } from "@/lib/queries/lots";
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
import { DeleteSchemeButton } from "./delete-button";
import { AnnouncementsCard } from "./_sections/announcements-card";
import { FundsCard } from "./_sections/funds-card";
import { withLedgerBalances } from "@/lib/finance/fund-position";
import { LotsCard } from "./_sections/lots-card";
import { LeviesCard } from "./_sections/levies-card";
import { MeetingsCard } from "./_sections/meetings-card";
import { DocumentsCard } from "./_sections/documents-card";
import { WorkOrdersCard } from "./_sections/work-orders-card";
import { ComplianceCard } from "./_sections/compliance-card";
import { BylawsCard } from "./_sections/bylaws-card";
import { InsuranceCard } from "./_sections/insurance-card";
import { ContactsCard } from "./_sections/contacts-card";
import { BuildingDataNotice } from "./_sections/building-data-notice";
import { RegulationModuleForm } from "./regulation-module-form";
import { PlanFormatForm } from "./plan-format-form";
import { BuildingRulesForm } from "./building-rules-form";
import { buildingDataProblems, planFormatChoices, regulationModuleChoices } from "@/lib/jurisdiction/building-data";
import { buildingRulesView } from "@/lib/jurisdiction/building-selectors";
import { getRecordedSelectorValues } from "@/lib/queries/building-selectors";
import { lotWordsFor } from "@/lib/jurisdiction/screen-words";
import { planNumberLabel } from "@/lib/onboarding/onboarding-words";
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
  const { tab, photo, next } = await searchParams;
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
    getStrataRollData(id),
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

  // The wizard created the building but could not save its photo (25 Oct).
  const photoNotSaved = photo === "not-saved";
  const nextStep = typeof next === "string" && next.startsWith(`/adviser/schemes/${id}/`) && !next.includes("//") ? next : null;
  // The building's rule pack. Queensland (stage 2, step 10): the regulation
  // module and plan format settings, and what the building is missing that
  // the pack asks for. None of them shows for NSW.
  const packRules = rulesForState(scheme.state).rules;
  const moduleChoices = regulationModuleChoices(packRules);
  const formatChoices = planFormatChoices(packRules);
  // The building rules (VIC, ACT and WA stage 2, PR 2), for a pack with
  // building selectors. The recorded values are read only for such a pack, so
  // nothing changes for NSW or Queensland.
  const recorded = packRules.BUILDING_SELECTORS?.length ? await getRecordedSelectorValues(scheme.id) : {};
  const dataProblems = buildingDataProblems(packRules, scheme, scheme.lots, recorded);
  const rulesView = buildingRulesView(packRules, { scheme, lots: scheme.lots, recorded });

  return (
    <div>
      {photoNotSaved && (
        <div role="status" className="mb-6 rounded-[var(--radius-card)] border border-[#F5C98A] bg-[#FFF3E0] px-4 py-3 text-sm text-ink">
          The building was created, but its photo could not be saved. Add it with Add photo on the photo above.
          {nextStep && (
            <>
              {" "}
              <a href={nextStep} className="font-medium text-turquoise underline">
                Continue setting up the building
              </a>
            </>
          )}
        </div>
      )}
      <BuildingDataNotice problems={dataProblems} />
      <AnnouncementsCard id={id} announcements={announcements} />
      <FundsCard id={id} funds={await withLedgerBalances(scheme.funds)} catalogue={packRules.FUND_CATALOGUE} />
      <LotsCard id={id} rows={lots} totalLots={scheme.totalLots} words={lotWordsFor(packRules)} />
      <LeviesCard id={id} schedules={levies} today={await schemeToday(id)} />
      <MeetingsCard id={id} meetings={meetings} />
      <DocumentsCard id={id} documents={documents} timeZone={timeZoneOf(scheme)} />
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

      {moduleChoices && <RegulationModuleForm schemeId={scheme.id} choices={moduleChoices} current={scheme.regulationModule ?? null} />}
      {formatChoices && <PlanFormatForm schemeId={scheme.id} choices={formatChoices} current={scheme.planFormat ?? null} />}
      {rulesView && <BuildingRulesForm schemeId={scheme.id} view={rulesView} />}

      {/* Edit form */}
      <div className="mb-6">
        <h2 className="font-heading font-semibold text-ink mb-4">
          Edit Scheme Details
        </h2>
        <SchemeForm
          words={{ ...lotWordsFor(packRules), planNumber: planNumberLabel(packRules.TERMINOLOGY) }}
          mode="edit"
          schemeId={scheme.id}
          lockCore={!profile?.isPlatformAdmin}
          today={await schemeToday(id)}
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
