import { connection } from "next/server";
import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemeById } from "@/lib/queries/schemes";
import { getContractorBusinessById } from "@/lib/queries/works";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { StatusChip } from "@/components/ui/status-chip";
import { Button } from "@/components/ui/button";

function formatDate(date: Date | string | null): string {
  if (!date) return "—";
  return new Date(String(date)).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const statusLabel: Record<string, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  SUSPENDED: "Suspended",
  BLACKLISTED: "Blacklisted",
};

export default async function ContractorDetailPage({
  params,
}: {
  params: Promise<{ id: string; contractorId: string }>;
}) {
  await connection();
  const { id, contractorId } = await params;

  const profile = await getCurrentProfile();
  if (!profile) return null;

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();

  const contractor = await getContractorBusinessById(contractorId);
  if (!contractor) notFound();

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title={contractor.companyName}
        description={
          contractor.tradingName
            ? `Trading as ${contractor.tradingName}`
            : undefined
        }
        backHref={`/adviser/schemes/${id}/works/contractors`}
        backLabel="Contractors"
        action={
          <Button
            href={`/adviser/schemes/${id}/works/contractors/${contractorId}/edit`}
            variant="secondary"
          >
            Edit
          </Button>
        }
      />

      <div className="flex items-center gap-3">
        <StatusChip
          status={statusLabel[contractor.status] ?? contractor.status}
        />
        {contractor.gstRegistered && (
          <span className="inline-flex items-center rounded-full h-[22px] px-2.5 text-[11px] font-medium bg-green-100 text-green-700">
            GST Registered
          </span>
        )}
      </div>

      {/* Business details */}
      <Card>
        <CardHeader title="Business Details" />
        <div className="px-5 pb-5">
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
            {contractor.abn && (
              <div>
                <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">
                  ABN
                </dt>
                <dd className="text-sm text-ink font-mono">
                  {contractor.abn}
                </dd>
              </div>
            )}
            {contractor.acn && (
              <div>
                <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">
                  ACN
                </dt>
                <dd className="text-sm text-ink font-mono">
                  {contractor.acn}
                </dd>
              </div>
            )}
            {contractor.registeredAddress && (
              <div>
                <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">
                  Registered Address
                </dt>
                <dd className="text-sm text-ink">
                  {contractor.registeredAddress}
                </dd>
              </div>
            )}
            {contractor.phone && (
              <div>
                <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">
                  Phone
                </dt>
                <dd className="text-sm text-ink">{contractor.phone}</dd>
              </div>
            )}
            {contractor.email && (
              <div>
                <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">
                  Email
                </dt>
                <dd className="text-sm text-ink">{contractor.email}</dd>
              </div>
            )}
            {contractor.website && (
              <div>
                <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">
                  Website
                </dt>
                <dd className="text-sm text-ink">{contractor.website}</dd>
              </div>
            )}
            {contractor.tradeCategories &&
              (contractor.tradeCategories as string[]).length > 0 && (
                <div className="sm:col-span-2">
                  <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">
                    Trade Categories
                  </dt>
                  <dd className="flex flex-wrap gap-1.5">
                    {(contractor.tradeCategories as string[]).map(
                      (cat) => (
                        <span
                          key={cat}
                          className="inline-flex items-center rounded-full h-[22px] px-2.5 text-[11px] font-medium bg-muted text-ink-muted"
                        >
                          {cat}
                        </span>
                      ),
                    )}
                  </dd>
                </div>
              )}
            {contractor.notes && (
              <div className="sm:col-span-2">
                <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">
                  Notes
                </dt>
                <dd className="text-sm text-ink whitespace-pre-wrap">
                  {contractor.notes}
                </dd>
              </div>
            )}
          </dl>
        </div>
      </Card>

      {/* Contacts */}
      {contractor.contacts.length > 0 && (
        <Card>
          <CardHeader
            title="Contacts"
            description={`${contractor.contacts.length} contact${contractor.contacts.length === 1 ? "" : "s"}`}
          />
          <div className="flex flex-col gap-2 px-5 pb-5">
            {contractor.contacts.map((contact) => (
              <div
                key={contact.id}
                className="rounded-[var(--radius-card)] bg-muted p-4"
              >
                <p className="text-sm font-medium text-ink">
                  {contact.firstName} {contact.lastName}
                </p>
                <div className="flex items-center gap-4 mt-1 text-xs text-ink-muted">
                  {contact.position && <span>{contact.position}</span>}
                  {contact.email && <span>{contact.email}</span>}
                  {contact.phone && <span>{contact.phone}</span>}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Licences */}
      {contractor.licences.length > 0 && (
        <Card>
          <CardHeader title="Licences" />
          <div className="flex flex-col gap-2 px-5 pb-5">
            {contractor.licences.map((licence) => (
              <div
                key={licence.id}
                className="flex items-center justify-between rounded-[var(--radius-card)] bg-muted p-4"
              >
                <div>
                  <p className="text-sm font-medium text-ink">
                    {licence.licenceType}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {licence.licenceNumber}
                  </p>
                </div>
                <div className="text-right text-xs text-ink-muted">
                  <p>Expires: {formatDate(licence.expiryDate)}</p>
                  <StatusChip status={licence.status} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Insurances */}
      {contractor.insurances.length > 0 && (
        <Card>
          <CardHeader title="Insurance Policies" />
          <div className="flex flex-col gap-2 px-5 pb-5">
            {contractor.insurances.map((insurance) => (
              <div
                key={insurance.id}
                className="flex items-center justify-between rounded-[var(--radius-card)] bg-muted p-4"
              >
                <div>
                  <p className="text-sm font-medium text-ink">
                    {insurance.policyType}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {insurance.insurer} &mdash; Policy:{" "}
                    {insurance.policyNumber}
                  </p>
                </div>
                <div className="text-right text-xs text-ink-muted">
                  <p>Expires: {formatDate(insurance.expiryDate)}</p>
                  <StatusChip status={insurance.status} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Compliance checks */}
      {contractor.complianceChecks.length > 0 && (
        <Card>
          <CardHeader title="Compliance Checks" />
          <div className="flex flex-col gap-2 px-5 pb-5">
            {contractor.complianceChecks.map((check) => (
              <div
                key={check.id}
                className="flex items-center justify-between rounded-[var(--radius-card)] bg-muted p-4"
              >
                <div>
                  <p className="text-sm font-medium text-ink">
                    {check.requirement.name}
                  </p>
                  <p className="text-xs text-ink-muted">
                    Verified: {formatDate(check.verifiedAt)}
                  </p>
                </div>
                <StatusChip status={check.status} />
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
