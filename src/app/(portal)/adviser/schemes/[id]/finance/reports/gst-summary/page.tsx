import { notFound } from "next/navigation";
import { getSchemeById } from "@/lib/queries/schemes";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getGstSummaryReport } from "@/lib/queries/reports";
import { PageHeader } from "@/components/ui/page-header";
import { GstSummaryClient } from "./gst-summary-client";

export default async function GstSummaryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    quarter?: string;
    startDate?: string;
    endDate?: string;
  }>;
}) {
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

  // Default to current BAS quarter
  // Australian BAS quarters: Jul-Sep (Q1), Oct-Dec (Q2), Jan-Mar (Q3), Apr-Jun (Q4)
  const now = new Date();
  const month = now.getMonth(); // 0-based
  let defaultStartDate: string;
  let defaultEndDate: string;

  if (month >= 6 && month <= 8) {
    // Q1: Jul-Sep
    defaultStartDate = `${now.getFullYear()}-07-01`;
    defaultEndDate = `${now.getFullYear()}-09-30`;
  } else if (month >= 9 && month <= 11) {
    // Q2: Oct-Dec
    defaultStartDate = `${now.getFullYear()}-10-01`;
    defaultEndDate = `${now.getFullYear()}-12-31`;
  } else if (month >= 0 && month <= 2) {
    // Q3: Jan-Mar
    defaultStartDate = `${now.getFullYear()}-01-01`;
    defaultEndDate = `${now.getFullYear()}-03-31`;
  } else {
    // Q4: Apr-Jun
    defaultStartDate = `${now.getFullYear()}-04-01`;
    defaultEndDate = `${now.getFullYear()}-06-30`;
  }

  const startDate = sp.startDate || defaultStartDate;
  const endDate = sp.endDate || defaultEndDate;

  // Build quarter options (current + 3 previous)
  function quarterLabel(start: string, end: string): string {
    const s = new Date(start);
    const e = new Date(end);
    return `${s.toLocaleDateString("en-AU", { month: "short" })} – ${e.toLocaleDateString("en-AU", { month: "short", year: "numeric" })}`;
  }

  const quarters: { start: string; end: string; label: string }[] = [];
  const baseYear = now.getFullYear();
  const baseMonth = now.getMonth();

  // Generate 4 quarters backwards from current
  for (let i = 0; i < 4; i++) {
    const qMonth = baseMonth - i * 3;
    const qDate = new Date(baseYear, qMonth, 1);
    // Align to quarter start
    const qm = qDate.getMonth();
    let qStart: Date;
    if (qm >= 6 && qm <= 8) qStart = new Date(qDate.getFullYear(), 6, 1);
    else if (qm >= 9 || qm <= -1)
      qStart = new Date(qm >= 9 ? qDate.getFullYear() : qDate.getFullYear() - 1, 9, 1);
    else if (qm >= 0 && qm <= 2)
      qStart = new Date(qDate.getFullYear(), 0, 1);
    else qStart = new Date(qDate.getFullYear(), 3, 1);

    const qEnd = new Date(qStart.getFullYear(), qStart.getMonth() + 3, 0);
    const qs = qStart.toISOString().slice(0, 10);
    const qe = qEnd.toISOString().slice(0, 10);
    // Avoid duplicates
    if (!quarters.some((q) => q.start === qs)) {
      quarters.push({ start: qs, end: qe, label: quarterLabel(qs, qe) });
    }
  }

  const report = await getGstSummaryReport(id, startDate, endDate);

  return (
    <div className="space-y-6">
      <PageHeader
        title="GST Summary (BAS-Ready)"
        description={String(scheme.name)}
        backHref={`/adviser/schemes/${id}/finance/reports`}
        backLabel="Reports"
      />

      <GstSummaryClient
        schemeId={id}
        startDate={startDate}
        endDate={endDate}
        quarters={quarters}
        report={report}
      />
    </div>
  );
}
