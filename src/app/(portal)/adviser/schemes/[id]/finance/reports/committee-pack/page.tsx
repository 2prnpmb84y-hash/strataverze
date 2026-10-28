import { notFound } from "next/navigation";
import { schemeToday, timeZoneOf } from "@/lib/jurisdiction/scheme-time";
import { getSchemeById } from "@/lib/queries/schemes";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getCommitteeReportingPack } from "@/lib/queries/reports";
import { PageHeader } from "@/components/ui/page-header";
import { CommitteePackClient } from "./committee-pack-client";
import { connection } from "next/server";
import { rulesForState } from "@/lib/jurisdiction/scheme-rules";
import { auditLabelWords } from "@/lib/jurisdiction/screen-words";
import { addDays, financialYearStart } from "@/lib/levies/notice-plan";

export default async function CommitteePackPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    year?: string;
    startDate?: string;
    endDate?: string;
  }>;
}) {
  await connection();
  const { id } = await params;
  const sp = await searchParams;
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();

  const isAdviser = scheme.memberships.some(
    (m) => m.profileId === profile.id && m.role === "ADVISER",
  );
  if (!isAdviser) notFound();

  // Default to the scheme's current financial year, from its own year end
  // (financials review: the budget comparison already follows it).
  const fyEnd = String(scheme.financialYearEnd ?? "06-30");
  const today = await schemeToday(id);
  const thisYear = Number(today.slice(0, 4));
  const currentFY = financialYearStart(thisYear, fyEnd) <= today ? thisYear : thisYear - 1;
  const financialYear = sp.year ? parseInt(sp.year, 10) : currentFY;

  const startDate = sp.startDate || financialYearStart(financialYear, fyEnd);
  const endDate = sp.endDate || addDays(financialYearStart(financialYear + 1, fyEnd), -1);

  const pack = await getCommitteeReportingPack(id, startDate, endDate, financialYear);

  // Build FY options (current + 2 previous)
  const fyOptions = Array.from({ length: 3 }, (_, i) => {
    const fy = currentFY - i;
    return { value: String(fy), label: `FY ${fy}/${fy + 1}` };
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Committee Reporting Pack"
        description={String(scheme.name)}
        backHref={`/adviser/schemes/${id}/finance/reports`}
        backLabel="Reports"
        action={
          <a
            href={`/api/finance/pdf/committee-pack?schemeId=${id}&startDate=${startDate}&endDate=${endDate}&year=${financialYear}`}
            target="_blank"
            rel="noopener"
            className="text-sm font-medium text-turquoise underline"
          >
            Download PDF
          </a>
        }
      />

      <CommitteePackClient
        schemeId={id}
        financialYear={financialYear}
        fyOptions={fyOptions}
        startDate={startDate}
        endDate={endDate}
        pack={pack}
        catalogue={rulesForState(scheme.state).rules.FUND_CATALOGUE}
        words={auditLabelWords(rulesForState(scheme.state).rules)}
        timeZone={timeZoneOf(scheme)}
      />
    </div>
  );
}
