import { connection } from "next/server";
import Link from "next/link";
import { getCurrentProfile } from "@/lib/queries/profiles";
import {
  getContractorBusinessForProfile,
  getContractorMembership,
} from "@/lib/queries/contractor";
import { Card, CardHeader } from "@/components/ui/card";
import { formatAud, toCents } from "@/lib/billing/money";

const MEMBERSHIP_STATUS_MAP: Record<string, { label: string; colour: string }> = {
  NOT_STARTED: { label: "Not Started", colour: "bg-gray-100 text-gray-700" },
  PROMOTIONAL: { label: "Free Period", colour: "bg-emerald-50 text-emerald-700" },
  PROMOTIONAL_ACCEPTED: { label: "Free Period", colour: "bg-emerald-50 text-emerald-700" },
  ACTIVE_PAID: { label: "Active", colour: "bg-emerald-50 text-emerald-700" },
  PAST_DUE: { label: "Past Due", colour: "bg-amber-50 text-amber-700" },
  SUSPENDED: { label: "Suspended", colour: "bg-red-50 text-red-700" },
  CANCELLED: { label: "Cancelled", colour: "bg-gray-100 text-gray-600" },
  EXPIRED: { label: "Expired", colour: "bg-gray-100 text-gray-600" },
};

function formatDate(dateStr: unknown): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr as string);
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
}

export default async function MembershipPage() {
  await connection();
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const business = await getContractorBusinessForProfile(profile.id);

  if (!business) {
    return (
      <div className="max-w-3xl">
        <h1 className="text-2xl font-bold font-heading text-ink mb-2">Membership</h1>
        <Card>
          <div className="text-center py-8">
            <p className="text-sm text-ink-muted mb-4">
              Complete your contractor registration to view membership details.
            </p>
            <Link
              href="/supplier/onboarding"
              className="inline-flex items-center bg-supplier text-white rounded-[var(--radius-card)] px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Start Registration
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  const membership = await getContractorMembership(business.id);

  if (!membership) {
    return (
      <div className="max-w-3xl">
        <h1 className="text-2xl font-bold font-heading text-ink mb-1">Membership</h1>
        <p className="text-sm text-ink-muted mb-8">
          Your StrataVerze contractor membership.
        </p>
        <Card>
          <CardHeader title="No Membership" />
          <p className="text-sm text-ink-muted mb-4">
            You have not yet accepted membership terms. Complete the onboarding process to activate
            your membership.
          </p>
          <Link
            href="/supplier/onboarding"
            className="inline-flex items-center bg-supplier text-white rounded-[var(--radius-card)] px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Continue Onboarding
          </Link>
        </Card>
      </div>
    );
  }

  const status = (membership.subscriptionStatus as string) ?? "NOT_STARTED";
  const statusInfo = MEMBERSHIP_STATUS_MAP[status] ?? MEMBERSHIP_STATUS_MAP.NOT_STARTED;
  // Memberships are created as PROMOTIONAL; older screens used PROMOTIONAL_ACCEPTED.
  const isPromotional = status === "PROMOTIONAL" || status === "PROMOTIONAL_ACCEPTED";
  // The day after the promotion ends, in Sydney.
  const billingStartDate = membership.promotionEnd
    ? new Date(new Date(String(membership.promotionEnd)).getTime() + 1000).toLocaleDateString("en-AU", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "Australia/Sydney",
      })
    : "the end of the promotion";
  const monthlyFee = formatAud(toCents(String(membership.planMonthlyPrice)));
  const gstText = membership.planGstInclusive ? "including GST" : "plus GST";

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold font-heading text-ink mb-1">Membership</h1>
      <p className="text-sm text-ink-muted mb-8">
        Your StrataVerze contractor membership.
      </p>

      {/* Status Card */}
      <Card className="mb-6">
        <CardHeader
          title="Membership Status"
          action={
            <span
              className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${statusInfo.colour}`}
            >
              {statusInfo.label}
            </span>
          }
        />

        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-sm">
          <div>
            <dt className="text-ink-muted">Plan</dt>
            <dd className="text-ink font-medium mt-0.5">
              {String(membership.planName ?? "StrataVerze Contractor")}
            </dd>
          </div>
          <div>
            <dt className="text-ink-muted">Member Since</dt>
            <dd className="text-ink font-medium mt-0.5">
              {formatDate(membership.acceptedAt ?? membership.createdAt)}
            </dd>
          </div>
          {isPromotional && (
            <>
              <div>
                <dt className="text-ink-muted">Promotional Period</dt>
                <dd className="text-ink font-medium mt-0.5">Free until {billingStartDate}</dd>
              </div>
              <div>
                <dt className="text-ink-muted">Monthly Fee (from {billingStartDate})</dt>
                <dd className="text-ink font-medium mt-0.5">{monthlyFee} AUD {gstText}</dd>
              </div>
            </>
          )}
          {!isPromotional && status !== "NOT_STARTED" && (
            <>
              <div>
                <dt className="text-ink-muted">Monthly Fee</dt>
                <dd className="text-ink font-medium mt-0.5">{monthlyFee} AUD {gstText}</dd>
              </div>
              {membership.nextRenewalDate && (
                <div>
                  <dt className="text-ink-muted">Next Billing Date</dt>
                  <dd className="text-ink font-medium mt-0.5">
                    {formatDate(membership.nextRenewalDate)}
                  </dd>
                </div>
              )}
            </>
          )}
        </dl>
      </Card>

      {/* Benefits Card */}
      <Card className="mb-6">
        <CardHeader title="Membership Benefits" />
        <ul className="space-y-3 text-sm text-ink">
          <li className="flex items-start gap-2.5">
            <span className="shrink-0 mt-0.5 h-5 w-5 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-xs font-bold">
              ✓
            </span>
            <span>Listed in the StrataVerze contractor directory visible to strata managers</span>
          </li>
          <li className="flex items-start gap-2.5">
            <span className="shrink-0 mt-0.5 h-5 w-5 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-xs font-bold">
              ✓
            </span>
            <span>Receive quote requests from strata schemes and building managers</span>
          </li>
          <li className="flex items-start gap-2.5">
            <span className="shrink-0 mt-0.5 h-5 w-5 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-xs font-bold">
              ✓
            </span>
            <span>Submit and manage quotes, work orders and invoices digitally</span>
          </li>
          <li className="flex items-start gap-2.5">
            <span className="shrink-0 mt-0.5 h-5 w-5 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-xs font-bold">
              ✓
            </span>
            <span>Compliance document management with expiry tracking and alerts</span>
          </li>
          <li className="flex items-start gap-2.5">
            <span className="shrink-0 mt-0.5 h-5 w-5 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-xs font-bold">
              ✓
            </span>
            <span>Verified contractor badge displayed to strata managers</span>
          </li>
        </ul>
      </Card>

      {/* Promotional Notice */}
      {isPromotional && (
        <div className="rounded-[var(--radius-card)] bg-blue-50 border border-blue-200 px-4 py-3">
          <p className="text-sm font-medium text-blue-800">Promotional Period</p>
          <p className="text-xs text-blue-700 mt-1 leading-relaxed">
            You are currently in the free promotional period. From {billingStartDate}, the monthly
            membership fee of {monthlyFee} AUD (plus GST) will apply. You will be notified before
            billing begins and can cancel at any time.
          </p>
        </div>
      )}
    </div>
  );
}
