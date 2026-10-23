import Link from "next/link";
import { getCurrentProfile } from "@/lib/queries/profiles";
import {
  getOpenQuoteRequests,
  getQuotesBySupplier,
  getWorkOrdersForSupplier,
  getInvoicesBySupplier,
} from "@/lib/queries/supplier";
import {
  getContractorBusinessForProfile,
  getContractorOnboarding,
  getContractorMembership,
  getContractorLicences,
  getContractorInsurances,
} from "@/lib/queries/contractor";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardHeader } from "@/components/ui/card";
import { connection } from "next/server";

function OnboardingStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; colour: string }> = {
    DRAFT: { label: "In Progress", colour: "bg-amber-50 text-amber-700" },
    SUBMITTED: { label: "Submitted", colour: "bg-blue-50 text-blue-700" },
    INFORMATION_REQUIRED: { label: "Action Required", colour: "bg-orange-50 text-orange-700" },
    REVIEWED: { label: "Approved", colour: "bg-emerald-50 text-emerald-700" },
  };
  const info = map[status] ?? map.DRAFT;
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${info.colour}`}>
      {info.label}
    </span>
  );
}

export default async function SupplierDashboard() {
  await connection();
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const [openRequests, myQuotes, workOrders, invoices, business] = await Promise.all([
    getOpenQuoteRequests(profile.id),
    getQuotesBySupplier(profile.id),
    getWorkOrdersForSupplier(profile.id),
    getInvoicesBySupplier(profile.id),
    getContractorBusinessForProfile(profile.id),
  ]);

  // Fetch contractor-specific data if registered
  const [onboarding, membership, licences, insurances] = business
    ? await Promise.all([
        getContractorOnboarding(business.id),
        getContractorMembership(business.id),
        getContractorLicences(business.id),
        getContractorInsurances(business.id),
      ])
    : [null, null, [], []];

  const activeWorkOrders = workOrders.filter(
    (wo) => wo.status === "AWARDED" || wo.status === "IN_PROGRESS",
  );
  const pendingInvoices = invoices.filter(
    (inv) => inv.status === "SUBMITTED",
  );
  const pendingQuotes = myQuotes.filter(
    (q) => q.status === "SUBMITTED",
  );

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold font-heading text-ink mb-1">
        Supplier Dashboard
      </h1>
      <p className="text-sm text-ink-muted mb-8">
        Browse quote requests, manage your work orders, and track invoices.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Open Requests"
          value={openRequests.length}
          accent="bg-supplier"
        />
        <StatCard
          label="Pending Quotes"
          value={pendingQuotes.length}
          accent="bg-supplier"
        />
        <StatCard
          label="Active Jobs"
          value={activeWorkOrders.length}
          accent="bg-supplier"
        />
        <StatCard
          label="Unpaid Invoices"
          value={pendingInvoices.length}
          accent={pendingInvoices.length > 0 ? "bg-warning" : "bg-supplier"}
        />
      </div>

      {/* Contractor Status Banner */}
      {!business && (
        <Card className="mt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-ink">Contractor Registration</p>
              <p className="text-xs text-ink-muted mt-0.5">
                Register as a contractor to receive quote requests and manage compliance.
              </p>
            </div>
            <Link
              href="/supplier/onboarding"
              className="shrink-0 bg-supplier text-white rounded-[var(--radius-card)] px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Get Started
            </Link>
          </div>
        </Card>
      )}

      {business && onboarding && (
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Registration Status */}
          <Card>
            <div className="flex items-start justify-between mb-2">
              <p className="text-xs font-medium text-ink-muted uppercase tracking-wide">
                Registration
              </p>
              <OnboardingStatusBadge status={String(onboarding.status ?? "DRAFT")} />
            </div>
            {String(onboarding.status) === "DRAFT" ? (
              <Link
                href="/supplier/onboarding"
                className="text-sm font-medium text-supplier hover:underline"
              >
                Continue onboarding →
              </Link>
            ) : (
              <p className="text-sm text-ink">
                Step {String(onboarding.currentStep ?? 1)} of 8
              </p>
            )}
          </Card>

          {/* Compliance Status */}
          <Card>
            <p className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-2">
              Compliance
            </p>
            <div className="space-y-1">
              <p className="text-sm text-ink">
                <span className="font-medium">{String(licences.length)}</span> licence{licences.length !== 1 ? "s" : ""}
                {" · "}
                <span className="font-medium">{String(insurances.length)}</span> polic{insurances.length !== 1 ? "ies" : "y"}
              </p>
              <Link
                href="/supplier/compliance"
                className="text-xs font-medium text-supplier hover:underline"
              >
                View details →
              </Link>
            </div>
          </Card>

          {/* Membership Status */}
          <Card>
            <p className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-2">
              Membership
            </p>
            {membership ? (
              <div className="space-y-1">
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    String(membership.subscriptionStatus) === "PROMOTIONAL_ACCEPTED" || String(membership.subscriptionStatus) === "ACTIVE_PAID"
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-gray-100 text-gray-700"
                  }`}
                >
                  {String(membership.subscriptionStatus) === "PROMOTIONAL_ACCEPTED"
                    ? "Free Period"
                    : String(membership.subscriptionStatus) === "ACTIVE_PAID"
                      ? "Active"
                      : String(membership.subscriptionStatus ?? "—").replace(/_/g, " ")}
                </span>
                <Link
                  href="/supplier/membership"
                  className="block text-xs font-medium text-supplier hover:underline"
                >
                  View details →
                </Link>
              </div>
            ) : (
              <Link
                href="/supplier/onboarding"
                className="text-sm font-medium text-supplier hover:underline"
              >
                Activate membership →
              </Link>
            )}
          </Card>
        </div>
      )}

      {/* Recent open quote requests */}
      <Card className="mt-8">
        <CardHeader
          title="Latest Quote Requests"
          action={
            <Link
              href="/supplier/quotes"
              className="text-xs font-medium text-supplier hover:underline"
            >
              View all
            </Link>
          }
        />
        {openRequests.length === 0 ? (
          <p className="text-sm text-ink-muted">
            No open quote requests at the moment. Check back soon.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {openRequests.slice(0, 5).map((qr) => (
              <Link
                key={qr.id}
                href={`/supplier/quotes/${qr.id}`}
                className="flex items-center justify-between rounded-[var(--radius-card)] bg-muted px-4 py-3 hover:bg-muted/70 transition-colors"
              >
                <div>
                  <p className="text-sm font-medium text-ink">
                    {qr.title}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {qr.category}
                    {qr.budget && ` · ${qr.budget}`}
                    {" · "}
                    {qr.otherQuoteCount + (qr.ownQuote ? 1 : 0)} quote
                    {qr.otherQuoteCount + (qr.ownQuote ? 1 : 0) === 1 ? "" : "s"} submitted
                  </p>
                </div>
                <span className="shrink-0 inline-flex items-center rounded-full bg-supplier/10 px-2.5 py-0.5 text-xs font-medium text-supplier">
                  {qr.urgency}
                </span>
              </Link>
            ))}
          </div>
        )}
      </Card>

      {/* Active work orders */}
      {activeWorkOrders.length > 0 && (
        <Card className="mt-6">
          <CardHeader
            title="Active Jobs"
            action={
              <Link
                href="/supplier/work-orders"
                className="text-xs font-medium text-supplier hover:underline"
              >
                View all
              </Link>
            }
          />
          <div className="flex flex-col gap-2">
            {activeWorkOrders.slice(0, 5).map((wo) => (
              <Link
                key={wo.id}
                href={`/supplier/work-orders/${wo.id}`}
                className="flex items-center justify-between rounded-[var(--radius-card)] bg-muted px-4 py-3 hover:bg-muted/70 transition-colors"
              >
                <div>
                  <p className="text-sm font-medium text-ink">
                    {wo.title}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {wo.scheme?.name}
                  </p>
                </div>
                <span
                  className={`shrink-0 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    wo.status === "IN_PROGRESS"
                      ? "bg-mint-soft text-turquoise"
                      : "bg-gold-100 text-gold-500"
                  }`}
                >
                  {wo.status === "IN_PROGRESS" ? "In Progress" : "Awarded"}
                </span>
              </Link>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
