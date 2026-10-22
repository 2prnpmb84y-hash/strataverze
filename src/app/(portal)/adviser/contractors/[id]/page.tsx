import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/queries/profiles";
import {
  getContractorBusinessById,
  getContractorOnboarding,
  getContractorMembership,
  getContractorLicences,
  getContractorInsurances,
  getContractorBankDetails,
  getContractorContacts,
  getContractorReviewItems,
  getAbnLookupHistory,
  getContractorDeclarations,
} from "@/lib/queries/contractor";
import { Card, CardHeader } from "@/components/ui/card";
import { ReviewActionsPanel } from "./review-actions";
import { ContractorBillingNote } from "@/components/billing/contractor-billing-note";

/* ------------------------------------------------------------------ */
/*  Status badge helpers                                               */
/* ------------------------------------------------------------------ */

const BIZ_STATUS: Record<string, { label: string; colour: string }> = {
  DRAFT: { label: "Draft", colour: "bg-gray-100 text-gray-700" },
  SUBMITTED: { label: "Submitted", colour: "bg-amber-50 text-amber-700" },
  UNDER_REVIEW: { label: "Under Review", colour: "bg-blue-50 text-blue-700" },
  APPROVED: { label: "Approved", colour: "bg-emerald-50 text-emerald-700" },
  REJECTED: { label: "Rejected", colour: "bg-red-50 text-red-700" },
  SUSPENDED: { label: "Suspended", colour: "bg-red-50 text-red-700" },
  ACTIVE: { label: "Active", colour: "bg-emerald-50 text-emerald-700" },
  INACTIVE: { label: "Inactive", colour: "bg-gray-100 text-gray-600" },
};

const VERIFY_STATUS: Record<string, { label: string; colour: string }> = {
  UNVERIFIED: { label: "Unverified", colour: "bg-gray-100 text-gray-700" },
  SUBMITTED_UNVERIFIED: { label: "Submitted", colour: "bg-amber-50 text-amber-700" },
  UNDER_REVIEW: { label: "Under Review", colour: "bg-blue-50 text-blue-700" },
  FURTHER_INFO_REQUIRED: { label: "Info Required", colour: "bg-orange-50 text-orange-700" },
  VERIFIED: { label: "Verified", colour: "bg-emerald-50 text-emerald-700" },
  EXPIRED: { label: "Expired", colour: "bg-red-50 text-red-700" },
  SUSPENDED: { label: "Suspended", colour: "bg-red-50 text-red-700" },
  REJECTED: { label: "Rejected", colour: "bg-red-50 text-red-700" },
  ENTITY_MISMATCH: { label: "Entity Mismatch", colour: "bg-orange-50 text-orange-700" },
  COVERAGE_INSUFFICIENT: { label: "Insufficient", colour: "bg-orange-50 text-orange-700" },
  NOT_SUPPLIED: { label: "Not Supplied", colour: "bg-gray-100 text-gray-700" },
  NOT_APPLICABLE_REVIEWED: { label: "N/A Reviewed", colour: "bg-gray-100 text-gray-600" },
};

const BANK_STATUS: Record<string, { label: string; colour: string }> = {
  DRAFT: { label: "Draft", colour: "bg-gray-100 text-gray-700" },
  SUBMITTED: { label: "Submitted", colour: "bg-amber-50 text-amber-700" },
  UNDER_REVIEW: { label: "Under Review", colour: "bg-blue-50 text-blue-700" },
  VERIFIED: { label: "Verified", colour: "bg-emerald-50 text-emerald-700" },
  REJECTED: { label: "Rejected", colour: "bg-red-50 text-red-700" },
  SUPERSEDED: { label: "Superseded", colour: "bg-gray-100 text-gray-600" },
};

const MEMBERSHIP_STATUS: Record<string, { label: string; colour: string }> = {
  NOT_STARTED: { label: "Not Started", colour: "bg-gray-100 text-gray-700" },
  PROMOTIONAL_ACCEPTED: { label: "Free Period", colour: "bg-emerald-50 text-emerald-700" },
  ACTIVE_PAID: { label: "Active", colour: "bg-emerald-50 text-emerald-700" },
  PAST_DUE: { label: "Past Due", colour: "bg-amber-50 text-amber-700" },
  SUSPENDED: { label: "Suspended", colour: "bg-red-50 text-red-700" },
  CANCELLED: { label: "Cancelled", colour: "bg-gray-100 text-gray-600" },
  EXPIRED: { label: "Expired", colour: "bg-gray-100 text-gray-600" },
};

function Badge({
  status,
  map,
}: {
  status: string;
  map: Record<string, { label: string; colour: string }>;
}) {
  const info = map[status] ?? { label: status.replace(/_/g, " "), colour: "bg-gray-100 text-gray-700" };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${info.colour}`}
    >
      {info.label}
    </span>
  );
}

function formatDate(d: unknown): string {
  if (!d) return "—";
  const dt = new Date(d as string);
  return dt.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

function isExpired(d: unknown): boolean {
  if (!d) return false;
  return new Date(d as string) < new Date();
}

function maskBsb(bsb: unknown): string {
  const s = String(bsb ?? "");
  if (s.length < 6) return s || "—";
  return `${s.slice(0, 3)}-${s.slice(3)}`;
}

function maskAccount(acc: unknown): string {
  const s = String(acc ?? "");
  if (s.length <= 4) return s || "—";
  return `${"•".repeat(s.length - 4)}${s.slice(-4)}`;
}

/* ------------------------------------------------------------------ */
/*  Page component                                                     */
/* ------------------------------------------------------------------ */

export default async function ContractorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const profile = await getCurrentProfile();
  if (!profile) return null;
  // Contractor review is StrataVerze staff work.
  if (!profile.isPlatformAdmin) notFound();

  const { id } = await params;

  const business = await getContractorBusinessById(id);
  if (!business) return notFound();

  const [
    onboarding,
    membership,
    licences,
    insurances,
    bankVersions,
    contacts,
    reviewItems,
    abnHistory,
    declarations,
  ] = await Promise.all([
    getContractorOnboarding(id),
    getContractorMembership(id),
    getContractorLicences(id),
    getContractorInsurances(id),
    getContractorBankDetails(id),
    getContractorContacts(id),
    getContractorReviewItems(id),
    getAbnLookupHistory(id),
    getContractorDeclarations(id),
  ]);

  const latestBank = bankVersions.length > 0 ? bankVersions[0] : null;
  const pendingReviews = reviewItems.filter((r) => String(r.status) === "PENDING");
  const bizStatus = String(business.status ?? "DRAFT");
  const canReview = bizStatus === "SUBMITTED" || bizStatus === "UNDER_REVIEW" || bizStatus === "APPROVED";

  return (
    <div className="max-w-5xl">
      {/* Breadcrumb */}
      <div className="mb-4">
        <Link
          href="/adviser/contractors"
          className="text-xs font-medium text-adviser hover:underline"
        >
          ← Back to contractors
        </Link>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold font-heading text-ink">
            {String(business.companyName ?? business.tradingName ?? "Unnamed")}
          </h1>
          {business.tradingName && business.companyName && (
            <p className="text-sm text-ink-muted mt-0.5">
              Trading as {String(business.tradingName)}
            </p>
          )}
        </div>
        <Badge status={String(business.status ?? "DRAFT")} map={BIZ_STATUS} />
      </div>

      {/* Pending reviews alert */}
      {pendingReviews.length > 0 && (
        <div className="rounded-[var(--radius-card)] bg-amber-50 border border-amber-200 px-4 py-3 mb-6">
          <p className="text-sm font-medium text-amber-800">
            {pendingReviews.length} pending review{pendingReviews.length !== 1 ? "s" : ""}
          </p>
          <div className="mt-2 space-y-1">
            {pendingReviews.map((item) => (
              <p key={item.id as string} className="text-xs text-amber-700">
                {String(item.queueType ?? "").replace(/_/g, " ")}
                {item.priority ? ` · ${String(item.priority)}` : ""}
                {item.notes ? ` — ${String(item.notes)}` : ""}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* 6 Status Track Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
        <div className="rounded-[var(--radius-card)] bg-muted p-3 text-center">
          <p className="text-[10px] font-medium text-ink-muted uppercase tracking-wide mb-1">Account</p>
          <Badge status={String(business.status ?? "DRAFT")} map={BIZ_STATUS} />
        </div>
        <div className="rounded-[var(--radius-card)] bg-muted p-3 text-center">
          <p className="text-[10px] font-medium text-ink-muted uppercase tracking-wide mb-1">Onboarding</p>
          <Badge
            status={String(onboarding?.status ?? "NOT_STARTED")}
            map={{
              NOT_STARTED: { label: "Not Started", colour: "bg-gray-100 text-gray-700" },
              DRAFT: { label: "In Progress", colour: "bg-amber-50 text-amber-700" },
              SUBMITTED: { label: "Submitted", colour: "bg-blue-50 text-blue-700" },
              INFORMATION_REQUIRED: { label: "Info Required", colour: "bg-orange-50 text-orange-700" },
              REVIEWED: { label: "Complete", colour: "bg-emerald-50 text-emerald-700" },
            }}
          />
        </div>
        <div className="rounded-[var(--radius-card)] bg-muted p-3 text-center">
          <p className="text-[10px] font-medium text-ink-muted uppercase tracking-wide mb-1">Identity</p>
          <Badge
            status={abnHistory.length > 0 && String(abnHistory[0].abnStatus) === "Active" ? "VERIFIED" : "UNVERIFIED"}
            map={{
              UNVERIFIED: { label: "Unverified", colour: "bg-gray-100 text-gray-700" },
              PENDING: { label: "Pending", colour: "bg-amber-50 text-amber-700" },
              VERIFIED: { label: "Verified", colour: "bg-emerald-50 text-emerald-700" },
              FAILED: { label: "Failed", colour: "bg-red-50 text-red-700" },
            }}
          />
        </div>
        <div className="rounded-[var(--radius-card)] bg-muted p-3 text-center">
          <p className="text-[10px] font-medium text-ink-muted uppercase tracking-wide mb-1">Compliance</p>
          <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-blue-50 text-blue-700">
            {licences.length}L / {insurances.length}I
          </span>
        </div>
        <div className="rounded-[var(--radius-card)] bg-muted p-3 text-center">
          <p className="text-[10px] font-medium text-ink-muted uppercase tracking-wide mb-1">Banking</p>
          <Badge
            status={latestBank ? String(latestBank.status ?? "DRAFT") : "NOT_SUPPLIED"}
            map={BANK_STATUS}
          />
        </div>
        <div className="rounded-[var(--radius-card)] bg-muted p-3 text-center">
          <p className="text-[10px] font-medium text-ink-muted uppercase tracking-wide mb-1">Membership</p>
          <Badge
            status={String(membership?.subscriptionStatus ?? "NOT_STARTED")}
            map={MEMBERSHIP_STATUS}
          />
        </div>
      </div>

      {/* Business Details */}
      <Card className="mb-6">
        <CardHeader title="Business Details" />
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <div>
            <dt className="text-ink-muted">Legal Name</dt>
            <dd className="text-ink font-medium">{String(business.companyName ?? "—")}</dd>
          </div>
          {business.tradingName && (
            <div>
              <dt className="text-ink-muted">Trading Name</dt>
              <dd className="text-ink font-medium">{String(business.tradingName)}</dd>
            </div>
          )}
          <div>
            <dt className="text-ink-muted">ABN</dt>
            <dd className="text-ink font-medium">{String(business.abn ?? "—")}</dd>
          </div>
          {business.acn && (
            <div>
              <dt className="text-ink-muted">ACN</dt>
              <dd className="text-ink font-medium">{String(business.acn)}</dd>
            </div>
          )}
          {business.businessStructure && (
            <div>
              <dt className="text-ink-muted">Structure</dt>
              <dd className="text-ink font-medium">
                {String(business.businessStructure).replace(/_/g, " ")}
              </dd>
            </div>
          )}
          <div>
            <dt className="text-ink-muted">Address</dt>
            <dd className="text-ink font-medium">
              {String(business.registeredAddress ?? "—")}
              {business.suburb ? `, ${String(business.suburb)}` : ""}
              {business.state ? ` ${String(business.state)}` : ""}
              {business.postcode ? ` ${String(business.postcode)}` : ""}
            </dd>
          </div>
          <div>
            <dt className="text-ink-muted">Phone</dt>
            <dd className="text-ink font-medium">{String(business.phone ?? "—")}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">Email</dt>
            <dd className="text-ink font-medium">{String(business.email ?? "—")}</dd>
          </div>
          {business.website && (
            <div>
              <dt className="text-ink-muted">Website</dt>
              <dd className="text-ink font-medium">{String(business.website)}</dd>
            </div>
          )}
        </dl>
      </Card>

      {/* Contacts */}
      {contacts.length > 0 && (
        <Card className="mb-6">
          <CardHeader title={`Contacts (${String(contacts.length)})`} />
          <div className="space-y-2">
            {contacts.map((contact) => (
              <div
                key={contact.id as string}
                className="rounded-[var(--radius-card)] bg-muted px-4 py-3"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-ink">
                      {String(contact.firstName ?? "")} {String(contact.lastName ?? "")}
                      {contact.isPrimary ? (
                        <span className="ml-2 inline-flex items-center rounded-full bg-adviser/10 px-2 py-0.5 text-[10px] font-medium text-adviser">
                          Primary
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-ink-muted mt-0.5">
                      {contact.position ? `${String(contact.position)} · ` : ""}
                      {contact.email ? String(contact.email) : ""}
                      {contact.phone ? ` · ${String(contact.phone)}` : ""}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ABN Lookup History */}
      {abnHistory.length > 0 && (
        <Card className="mb-6">
          <CardHeader title="ABN Lookup History" />
          <div className="space-y-2">
            {abnHistory.slice(0, 5).map((record) => (
              <div
                key={record.id as string}
                className="rounded-[var(--radius-card)] bg-muted px-4 py-3"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-ink">
                      ABN {String(record.abn ?? "—")}
                    </p>
                    <p className="text-xs text-ink-muted mt-0.5">
                      Looked up {formatDate(record.lookupTimestamp)}
                      {record.abnStatus ? ` · Status: ${String(record.abnStatus)}` : ""}
                    </p>
                  </div>
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      String(record.abnStatus) === "Active"
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-red-50 text-red-700"
                    }`}
                  >
                    {String(record.abnStatus ?? "Unknown")}
                  </span>
                </div>
                {record.entityName && (
                  <p className="text-xs text-ink mt-1">
                    Entity: {String(record.entityName)}
                    {record.entityType ? ` (${String(record.entityType)})` : ""}
                  </p>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Licences */}
      <Card className="mb-6">
        <CardHeader title={`Licences (${String(licences.length)})`} />
        {licences.length === 0 ? (
          <p className="text-sm text-ink-muted">No licences on file.</p>
        ) : (
          <div className="space-y-2">
            {licences.map((lic) => (
              <div
                key={lic.id as string}
                className="rounded-[var(--radius-card)] bg-muted px-4 py-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink truncate">
                      {String(lic.licenceType ?? "Licence")}
                    </p>
                    <p className="text-xs text-ink-muted mt-0.5">
                      #{String(lic.licenceNumber ?? "—")}
                      {lic.holderName ? ` · ${String(lic.holderName)}` : ""}
                      {lic.stateTerritory ? ` · ${String(lic.stateTerritory)}` : ""}
                    </p>
                    <p className="text-xs text-ink-muted mt-0.5">
                      Expires: {formatDate(lic.expiryDate)}
                      {isExpired(lic.expiryDate) && (
                        <span className="ml-1 text-red-600 font-medium">EXPIRED</span>
                      )}
                    </p>
                  </div>
                  <Badge status={String(lic.status ?? "UNVERIFIED")} map={VERIFY_STATUS} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Insurance */}
      <Card className="mb-6">
        <CardHeader title={`Insurance (${String(insurances.length)})`} />
        {insurances.length === 0 ? (
          <p className="text-sm text-ink-muted">No insurance policies on file.</p>
        ) : (
          <div className="space-y-2">
            {insurances.map((ins) => (
              <div
                key={ins.id as string}
                className="rounded-[var(--radius-card)] bg-muted px-4 py-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink truncate">
                      {String(ins.policyType ?? "Insurance")}
                    </p>
                    <p className="text-xs text-ink-muted mt-0.5">
                      {ins.insurer ? `${String(ins.insurer)} · ` : ""}
                      #{String(ins.policyNumber ?? "—")}
                      {ins.coverageAmount ? ` · $${String(ins.coverageAmount)}` : ""}
                    </p>
                    <p className="text-xs text-ink-muted mt-0.5">
                      Expires: {formatDate(ins.expiryDate)}
                      {isExpired(ins.expiryDate) && (
                        <span className="ml-1 text-red-600 font-medium">EXPIRED</span>
                      )}
                    </p>
                  </div>
                  <Badge status={String(ins.status ?? "NOT_SUPPLIED")} map={VERIFY_STATUS} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Banking */}
      <Card className="mb-6">
        <CardHeader title="Banking Details" />
        {!latestBank ? (
          <p className="text-sm text-ink-muted">No banking details submitted.</p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-ink">
                Version {String(latestBank.versionNumber ?? 1)}
              </p>
              <Badge status={String(latestBank.status ?? "DRAFT")} map={BANK_STATUS} />
            </div>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <div>
                <dt className="text-ink-muted">Account Name</dt>
                <dd className="text-ink font-medium">{String(latestBank.accountName ?? "—")}</dd>
              </div>
              <div>
                <dt className="text-ink-muted">BSB</dt>
                <dd className="text-ink font-medium">{maskBsb(latestBank.bsb)}</dd>
              </div>
              <div>
                <dt className="text-ink-muted">Account Number</dt>
                <dd className="text-ink font-medium">{maskAccount(latestBank.accountNumber)}</dd>
              </div>
              <div>
                <dt className="text-ink-muted">Submitted</dt>
                <dd className="text-ink font-medium">{formatDate(latestBank.createdAt)}</dd>
              </div>
            </dl>
            {bankVersions.length > 1 && (
              <p className="text-xs text-ink-muted">
                {bankVersions.length} version{bankVersions.length !== 1 ? "s" : ""} on record
              </p>
            )}
          </div>
        )}
      </Card>

      <ContractorBillingNote promotionEnd={membership?.promotionEnd ? String(membership.promotionEnd) : null} />

      {/* Membership */}
      <Card className="mb-6">
        <CardHeader title="Membership" />
        {!membership ? (
          <p className="text-sm text-ink-muted">No membership record.</p>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-ink">
                {String(membership.planName ?? "StrataVerze Contractor")}
              </p>
              <Badge status={String(membership.subscriptionStatus ?? "NOT_STARTED")} map={MEMBERSHIP_STATUS} />
            </div>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <div>
                <dt className="text-ink-muted">Accepted</dt>
                <dd className="text-ink font-medium">
                  {formatDate(membership.acceptedAt ?? membership.createdAt)}
                </dd>
              </div>
              {membership.nextRenewalDate && (
                <div>
                  <dt className="text-ink-muted">Next Renewal</dt>
                  <dd className="text-ink font-medium">{formatDate(membership.nextRenewalDate)}</dd>
                </div>
              )}
            </dl>
          </div>
        )}
      </Card>

      {/* Declarations */}
      {declarations.length > 0 && (
        <Card className="mb-6">
          <CardHeader title={`Declarations (${String(declarations.length)})`} />
          <div className="space-y-2">
            {declarations.map((dec) => (
              <div
                key={dec.id as string}
                className="rounded-[var(--radius-card)] bg-muted px-4 py-3"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-ink">
                      {String(dec.declarationType ?? "Declaration").replace(/_/g, " ")}
                    </p>
                    <p className="text-xs text-ink-muted mt-0.5">
                      Accepted {formatDate(dec.acceptedAt ?? dec.createdAt)}
                    </p>
                  </div>
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    dec.accepted ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-700"
                  }`}>
                    {dec.accepted ? "Accepted" : "Pending"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Review History */}
      {reviewItems.length > 0 && (
        <Card>
          <CardHeader title={`Review History (${String(reviewItems.length)})`} />
          <div className="space-y-2">
            {reviewItems.map((item) => (
              <div
                key={item.id as string}
                className="rounded-[var(--radius-card)] bg-muted px-4 py-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">
                      {String(item.queueType ?? "").replace(/_/g, " ")}
                    </p>
                    {item.notes && (
                      <p className="text-xs text-ink-muted mt-0.5 truncate">
                        {String(item.notes)}
                      </p>
                    )}
                    <p className="text-xs text-ink-muted mt-0.5">
                      Created {formatDate(item.createdAt)}
                      {item.reviewDate ? ` · Reviewed ${formatDate(item.reviewDate)}` : ""}
                      {item.outcomeNotes ? ` · "${String(item.outcomeNotes)}"` : ""}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      String(item.status) === "PENDING"
                        ? "bg-amber-50 text-amber-700"
                        : String(item.status) === "APPROVED"
                          ? "bg-emerald-50 text-emerald-700"
                          : String(item.status) === "REJECTED"
                            ? "bg-red-50 text-red-700"
                            : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {String(item.status ?? "PENDING")}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Review actions */}
      {canReview && (
        <div className="mt-8">
          <ReviewActionsPanel contractorId={id} />
        </div>
      )}
    </div>
  );
}
