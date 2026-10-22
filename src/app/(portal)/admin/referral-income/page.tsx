import { connection } from "next/server";
import { db } from "@/prisma/db";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { formatAud } from "@/lib/billing/money";
import { referralDisclosureTemplate, referralIncomeEnabled } from "@/lib/billing/referral";
import { getRecentReferralIncome } from "@/lib/queries/referral-income";
import { ReferralForm } from "./referral-form";

/** StrataVerze staff: record commission a partner paid on a scheme's policy. */
export default async function ReferralIncomeAdminPage() {
  await connection();
  const enabled = referralIncomeEnabled();

  const header = (
    <PageHeader
      title="Referral Income"
      description="Record commission a broker or underwriter partner paid StrataVerze on a scheme's policy. StrataVerze does not quote, compare or place insurance."
    />
  );

  if (!enabled) {
    return (
      <div className="max-w-4xl">
        {header}
        <Card>
          <p className="text-sm text-ink-muted">
            Referral income is switched off. Set PLATFORM_REFERRAL_INCOME=on to record it and show it to schemes.
          </p>
        </Card>
      </div>
    );
  }

  const [schemes, policies, recent] = await Promise.all([
    db.orm.public.Scheme.orderBy((s) => s.name.asc()).limit(2000).all(),
    db.orm.public.InsurancePolicy.limit(10000).all(),
    getRecentReferralIncome(),
  ]);
  const options = schemes.map((s) => ({
    id: s.id,
    name: `${s.name} (SP ${s.planNumber})`,
    policies: policies
      .filter((p) => p.schemeId === s.id)
      .map((p) => ({ id: p.id, label: `${p.insurer} ${p.policyNumber}` })),
  }));
  const schemeName = new Map(schemes.map((s) => [s.id, s.name]));

  return (
    <div className="max-w-4xl space-y-6">
      {header}
      <Card>
        <CardHeader title="Record a payment" />
        <ReferralForm schemes={options} template={referralDisclosureTemplate()} />
      </Card>
      <Card>
        <CardHeader title="Recently recorded" />
        {recent.length === 0 ? (
          <p className="text-sm text-ink-muted">Nothing recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-ink-muted border-b border-line">
                  <th className="py-2 pr-4 font-medium">Received</th>
                  <th className="py-2 pr-4 font-medium">Scheme</th>
                  <th className="py-2 pr-4 font-medium">Partner</th>
                  <th className="py-2 font-medium text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {recent.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2 pr-4 whitespace-nowrap">{r.receivedAt}</td>
                    <td className="py-2 pr-4">{schemeName.get(r.schemeId) ?? r.schemeId}</td>
                    <td className="py-2 pr-4">{r.partnerName}</td>
                    <td className="py-2 text-right tabular-nums">{formatAud(r.amountCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
