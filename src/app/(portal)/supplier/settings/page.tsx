import { connection } from "next/server";
import Link from "next/link";
import { getCurrentProfile } from "@/lib/queries/profiles";
import {
  getContractorBusinessForProfile,
  getContractorContacts,
} from "@/lib/queries/contractor";
import { Card, CardHeader } from "@/components/ui/card";
import { SupplierBillingSummary } from "@/components/billing/supplier-billing-summary";

export default async function SettingsPage() {
  await connection();
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const business = await getContractorBusinessForProfile(profile.id);

  if (!business) {
    return (
      <div className="max-w-3xl">
        <h1 className="text-2xl font-bold font-heading text-ink mb-2">Settings</h1>
        <Card>
          <div className="text-center py-8">
            <p className="text-sm text-ink-muted mb-4">
              Complete your contractor registration to manage settings.
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

  const contacts = await getContractorContacts(business.id);

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold font-heading text-ink mb-1">Settings</h1>
      <p className="text-sm text-ink-muted mb-8">
        Manage your contractor business settings.
      </p>

      <SupplierBillingSummary contractorBusinessId={business.id} />

      {/* Business Information */}
      <Card className="mb-6">
        <CardHeader
          title="Business Information"
          action={
            <Link
              href="/supplier/onboarding"
              className="text-xs font-medium text-supplier hover:underline"
            >
              Edit
            </Link>
          }
        />
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-sm">
          <div>
            <dt className="text-ink-muted">Legal Name</dt>
            <dd className="text-ink font-medium mt-0.5">
              {String(business.companyName ?? "—")}
            </dd>
          </div>
          {business.tradingName && (
            <div>
              <dt className="text-ink-muted">Trading Name</dt>
              <dd className="text-ink font-medium mt-0.5">
                {String(business.tradingName)}
              </dd>
            </div>
          )}
          <div>
            <dt className="text-ink-muted">ABN</dt>
            <dd className="text-ink font-medium mt-0.5">
              {String(business.abn ?? "Not provided")}
            </dd>
          </div>
          {business.acn && (
            <div>
              <dt className="text-ink-muted">ACN</dt>
              <dd className="text-ink font-medium mt-0.5">{String(business.acn)}</dd>
            </div>
          )}
          {business.businessStructure && (
            <div>
              <dt className="text-ink-muted">Structure</dt>
              <dd className="text-ink font-medium mt-0.5">
                {String(business.businessStructure).replace(/_/g, " ")}
              </dd>
            </div>
          )}
          <div>
            <dt className="text-ink-muted">Address</dt>
            <dd className="text-ink font-medium mt-0.5">
              {String(business.registeredAddress ?? "—")}
              {business.suburb ? `, ${String(business.suburb)}` : ""}
              {business.state ? ` ${String(business.state)}` : ""}
              {business.postcode ? ` ${String(business.postcode)}` : ""}
            </dd>
          </div>
          <div>
            <dt className="text-ink-muted">Phone</dt>
            <dd className="text-ink font-medium mt-0.5">
              {String(business.phone ?? "—")}
            </dd>
          </div>
          <div>
            <dt className="text-ink-muted">Email</dt>
            <dd className="text-ink font-medium mt-0.5">
              {String(business.email ?? "—")}
            </dd>
          </div>
          {business.website && (
            <div>
              <dt className="text-ink-muted">Website</dt>
              <dd className="text-ink font-medium mt-0.5">{String(business.website)}</dd>
            </div>
          )}
        </dl>
      </Card>

      {/* Contacts */}
      <Card className="mb-6">
        <CardHeader
          title="Contacts"
          action={
            <Link
              href="/supplier/onboarding"
              className="text-xs font-medium text-supplier hover:underline"
            >
              Manage
            </Link>
          }
        />
        {contacts.length === 0 ? (
          <p className="text-sm text-ink-muted">No additional contacts have been added.</p>
        ) : (
          <div className="space-y-3">
            {contacts.map((contact) => (
              <div
                key={contact.id as string}
                className="rounded-[var(--radius-card)] bg-muted px-4 py-3"
              >
                <p className="text-sm font-medium text-ink">
                  {String(contact.firstName ?? "")} {String(contact.lastName ?? "")}
                </p>
                <p className="text-xs text-ink-muted mt-0.5">
                  {contact.position ? `${String(contact.position)} · ` : ""}
                  {contact.email ? String(contact.email) : ""}
                  {contact.phone ? ` · ${String(contact.phone)}` : ""}
                </p>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Services and Regions */}
      <Card>
        <CardHeader
          title="Services & Regions"
          action={
            <Link
              href="/supplier/onboarding"
              className="text-xs font-medium text-supplier hover:underline"
            >
              Edit
            </Link>
          }
        />
        <dl className="space-y-4 text-sm">
          {business.businessDescription && (
            <div>
              <dt className="text-ink-muted">Description</dt>
              <dd className="text-ink mt-0.5 leading-relaxed">
                {String(business.businessDescription)}
              </dd>
            </div>
          )}
          {Array.isArray(business.specialistServices) &&
            (business.specialistServices as string[]).length > 0 && (
              <div>
                <dt className="text-ink-muted mb-1.5">Specialist Services</dt>
                <dd className="flex flex-wrap gap-1.5">
                  {(business.specialistServices as string[]).map((service) => (
                    <span
                      key={service}
                      className="inline-flex items-center rounded-full bg-supplier/10 px-2.5 py-0.5 text-xs font-medium text-supplier"
                    >
                      {service}
                    </span>
                  ))}
                </dd>
              </div>
            )}
          {Array.isArray(business.serviceRegions) &&
            (business.serviceRegions as string[]).length > 0 && (
              <div>
                <dt className="text-ink-muted mb-1.5">Service Regions</dt>
                <dd className="flex flex-wrap gap-1.5">
                  {(business.serviceRegions as string[]).map((region) => (
                    <span
                      key={region}
                      className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700"
                    >
                      {region}
                    </span>
                  ))}
                </dd>
              </div>
            )}
        </dl>
      </Card>
    </div>
  );
}
