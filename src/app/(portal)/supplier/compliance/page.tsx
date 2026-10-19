import { connection } from "next/server";
import Link from "next/link";
import { getCurrentProfile } from "@/lib/queries/profiles";
import {
  getContractorBusinessForProfile,
  getContractorLicences,
  getContractorInsurances,
} from "@/lib/queries/contractor";
import { Card, CardHeader } from "@/components/ui/card";

const STATUS_LABELS: Record<string, { label: string; colour: string }> = {
  NOT_SUPPLIED: { label: "Not Supplied", colour: "bg-gray-100 text-gray-700" },
  SUBMITTED_UNVERIFIED: { label: "Submitted", colour: "bg-amber-50 text-amber-700" },
  UNDER_REVIEW: { label: "Under Review", colour: "bg-blue-50 text-blue-700" },
  FURTHER_INFO_REQUIRED: { label: "Further Info Required", colour: "bg-orange-50 text-orange-700" },
  VERIFIED: { label: "Verified", colour: "bg-emerald-50 text-emerald-700" },
  EXPIRED: { label: "Expired", colour: "bg-red-50 text-red-700" },
  REJECTED: { label: "Rejected", colour: "bg-red-50 text-red-700" },
  NOT_APPLICABLE_REVIEWED: { label: "N/A (Reviewed)", colour: "bg-gray-100 text-gray-600" },
  ENTITY_MISMATCH: { label: "Entity Mismatch", colour: "bg-orange-50 text-orange-700" },
  COVERAGE_INSUFFICIENT: { label: "Insufficient Cover", colour: "bg-orange-50 text-orange-700" },
  UNVERIFIED: { label: "Unverified", colour: "bg-gray-100 text-gray-700" },
  SUSPENDED: { label: "Suspended", colour: "bg-red-50 text-red-700" },
};

function StatusBadge({ status }: { status: string }) {
  const info = STATUS_LABELS[status] ?? STATUS_LABELS.NOT_SUPPLIED;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${info.colour}`}
    >
      {info.label}
    </span>
  );
}

function formatDate(dateStr: unknown): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr as string);
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

function isExpiringSoon(dateStr: unknown): boolean {
  if (!dateStr) return false;
  const expiry = new Date(dateStr as string);
  const thirtyDays = new Date();
  thirtyDays.setDate(thirtyDays.getDate() + 30);
  return expiry <= thirtyDays && expiry > new Date();
}

export default async function CompliancePage() {
  await connection();
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const business = await getContractorBusinessForProfile(profile.id);

  if (!business) {
    return (
      <div className="max-w-4xl">
        <h1 className="text-2xl font-bold font-heading text-ink mb-2">Compliance</h1>
        <Card>
          <div className="text-center py-8">
            <p className="text-sm text-ink-muted mb-4">
              Complete your contractor registration to manage compliance documents.
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

  const [licences, insurances] = await Promise.all([
    getContractorLicences(business.id),
    getContractorInsurances(business.id),
  ]);

  const expiringSoonLicences = licences.filter((l) => isExpiringSoon(l.expiryDate));
  const expiredLicences = licences.filter(
    (l) => l.expiryDate && new Date(l.expiryDate as string) < new Date(),
  );
  const expiringSoonInsurances = insurances.filter((i) => isExpiringSoon(i.expiryDate));
  const expiredInsurances = insurances.filter(
    (i) => i.expiryDate && new Date(i.expiryDate as string) < new Date(),
  );

  const hasWarnings =
    expiringSoonLicences.length > 0 ||
    expiredLicences.length > 0 ||
    expiringSoonInsurances.length > 0 ||
    expiredInsurances.length > 0;

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold font-heading text-ink mb-1">Compliance</h1>
      <p className="text-sm text-ink-muted mb-8">
        Manage your licences, insurance policies and compliance documents.
      </p>

      {/* Alerts */}
      {hasWarnings && (
        <div className="rounded-[var(--radius-card)] bg-amber-50 border border-amber-200 px-4 py-3 mb-6">
          <p className="text-sm font-medium text-amber-800">Attention Required</p>
          <ul className="mt-1 text-xs text-amber-700 space-y-0.5">
            {expiredLicences.length > 0 && (
              <li>
                {expiredLicences.length} licence{expiredLicences.length > 1 ? "s" : ""} expired
              </li>
            )}
            {expiringSoonLicences.length > 0 && (
              <li>
                {expiringSoonLicences.length} licence{expiringSoonLicences.length > 1 ? "s" : ""}{" "}
                expiring within 30 days
              </li>
            )}
            {expiredInsurances.length > 0 && (
              <li>
                {expiredInsurances.length} insurance polic
                {expiredInsurances.length > 1 ? "ies" : "y"} expired
              </li>
            )}
            {expiringSoonInsurances.length > 0 && (
              <li>
                {expiringSoonInsurances.length} insurance polic
                {expiringSoonInsurances.length > 1 ? "ies" : "y"} expiring within 30 days
              </li>
            )}
          </ul>
        </div>
      )}

      {/* Licences */}
      <Card className="mb-6">
        <CardHeader
          title={`Licences (${String(licences.length)})`}
          action={
            <Link
              href="/supplier/onboarding"
              className="text-xs font-medium text-supplier hover:underline"
            >
              Manage
            </Link>
          }
        />
        {licences.length === 0 ? (
          <p className="text-sm text-ink-muted">No licences have been added yet.</p>
        ) : (
          <div className="space-y-3">
            {licences.map((licence) => (
              <div
                key={licence.id as string}
                className="rounded-[var(--radius-card)] bg-muted px-4 py-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">
                      {String(licence.licenceType ?? "Licence")}
                    </p>
                    <p className="text-xs text-ink-muted mt-0.5">
                      {licence.licenceNumber ? `#${String(licence.licenceNumber)}` : ""}
                      {licence.holderName ? ` · ${String(licence.holderName)}` : ""}
                      {licence.stateTerritory ? ` · ${String(licence.stateTerritory)}` : ""}
                    </p>
                    <p className="text-xs text-ink-muted mt-0.5">
                      Expires: {formatDate(licence.expiryDate)}
                      {isExpiringSoon(licence.expiryDate) && (
                        <span className="ml-1.5 text-amber-600 font-medium">Expiring soon</span>
                      )}
                    </p>
                  </div>
                  <StatusBadge status={String(licence.status ?? "UNVERIFIED")} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Insurance */}
      <Card>
        <CardHeader
          title={`Insurance (${String(insurances.length)})`}
          action={
            <Link
              href="/supplier/onboarding"
              className="text-xs font-medium text-supplier hover:underline"
            >
              Manage
            </Link>
          }
        />
        {insurances.length === 0 ? (
          <p className="text-sm text-ink-muted">No insurance policies have been added yet.</p>
        ) : (
          <div className="space-y-3">
            {insurances.map((ins) => (
              <div
                key={ins.id as string}
                className="rounded-[var(--radius-card)] bg-muted px-4 py-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">
                      {String(ins.policyType ?? "Insurance")}
                    </p>
                    <p className="text-xs text-ink-muted mt-0.5">
                      {ins.insurer ? String(ins.insurer) : ""}
                      {ins.policyNumber ? ` · #${String(ins.policyNumber)}` : ""}
                    </p>
                    <p className="text-xs text-ink-muted mt-0.5">
                      Expires: {formatDate(ins.expiryDate)}
                      {isExpiringSoon(ins.expiryDate) && (
                        <span className="ml-1.5 text-amber-600 font-medium">Expiring soon</span>
                      )}
                    </p>
                  </div>
                  <StatusBadge status={String(ins.status ?? "NOT_SUPPLIED")} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
