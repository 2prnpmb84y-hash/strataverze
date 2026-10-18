import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemeById } from "@/lib/queries/schemes";
import { getOverdueLevyNoticesWithInterest } from "@/lib/queries/interest";
import { PageHeader } from "@/components/ui/page-header";
import { InterestClient } from "./interest-client";
import { connection } from "next/server";

export default async function InterestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();

  const isAdviser = scheme.memberships.some(
    (m) => m.profileId === profile.id && m.role === "ADVISER",
  );
  if (!isAdviser) notFound();

  const { notices, annualRate } =
    await getOverdueLevyNoticesWithInterest(id);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Interest on Overdue Levies"
        description={
          annualRate > 0
            ? `Interest rate: ${annualRate}% p.a. (simple interest)`
            : "No interest rate configured. Set the rate in scheme settings."
        }
      />

      <InterestClient
        schemeId={id}
        notices={notices.map((n) => ({
          id: n.id,
          noticeNumber: String(n.noticeNumber),
          lotNumber: n.lot ? String(n.lot.lotNumber) : "—",
          fundName: n.fund ? String(n.fund.name) : "—",
          dueDate: String(n.dueDate),
          balanceOutstanding: Number(n.balanceOutstanding),
          daysOverdue: n.daysOverdue,
          calculatedInterest: n.calculatedInterest,
          previouslyCharged: n.previouslyCharged,
          additionalInterest: n.additionalInterest,
        }))}
        annualRate={annualRate}
      />
    </div>
  );
}
