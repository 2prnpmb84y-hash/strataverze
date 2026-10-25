import { connection } from "next/server";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getContractorBusinessForProfile } from "@/lib/queries/contractor";
import { isWorksTrade } from "@/config/works";
import { Card } from "@/components/ui/card";
import { ServiceAreaForm } from "@/components/works/service-area-form";

/**
 * The contractor's trades and service area (works marketplace stage 3,
 * 25 Oct 2026): which jobs they see and are emailed about.
 */
export default async function SupplierServiceAreaPage() {
  await connection();
  const profile = await getCurrentProfile();
  if (!profile) return null;
  const business = await getContractorBusinessForProfile(profile.id);
  const header = (
    <div className="mb-6">
      <h1 className="text-2xl font-bold font-heading text-ink mb-1">Trades and service area</h1>
      <p className="text-sm text-ink-muted">You see and are emailed about jobs in these kinds of work and postcodes, once StrataVerze has approved your business.</p>
    </div>
  );
  if (!business) {
    return (
      <div className="max-w-3xl">
        {header}
        <Card>
          <p className="text-sm text-ink-muted">Finish your onboarding first. Only your business&apos;s main contact can set this.</p>
        </Card>
      </div>
    );
  }
  const current = ((business.tradeCategories as string[] | null) ?? []).map(String);
  return (
    <div className="max-w-3xl">
      {header}
      {business.status !== "APPROVED" && <p className="mb-4 text-sm text-amber-800">Your business is not approved yet, so jobs are not shown until it is.</p>}
      <Card>
        <ServiceAreaForm businessId={business.id} trades={current.filter(isWorksTrade)} otherTrades={current.filter((t) => !isWorksTrade(t))} postcodes={((business.servicePostcodes as string[] | null) ?? []).map(String)} />
      </Card>
    </div>
  );
}
