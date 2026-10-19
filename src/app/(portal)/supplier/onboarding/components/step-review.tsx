"use client";

import { useActionState, useState } from "react";
import { Card, CardHeader } from "@/components/ui/card";
import { CheckboxField } from "@/components/ui/form-field";
import { submitApplication } from "@/lib/actions/contractor-onboarding";

interface StepReviewProps {
  business: Record<string, unknown> | null;
  onboarding: Record<string, unknown> | null;
  licences: Record<string, unknown>[];
  insurances: Record<string, unknown>[];
  bankDetails: Record<string, unknown>[];
  membership: Record<string, unknown> | null;
  declarations: Record<string, unknown>[];
  abnLookups: Record<string, unknown>[];
  profile: Record<string, unknown>;
  onBack: () => void;
}

type SectionStatus = "complete" | "incomplete" | "missing";

interface ReviewSection {
  label: string;
  status: SectionStatus;
  details: string;
}

function getSectionStatus(
  business: Record<string, unknown> | null,
  licences: Record<string, unknown>[],
  insurances: Record<string, unknown>[],
  bankDetails: Record<string, unknown>[],
  membership: Record<string, unknown> | null,
  abnLookups: Record<string, unknown>[],
  profile: Record<string, unknown>,
): ReviewSection[] {
  const sections: ReviewSection[] = [];

  // Account
  const hasName = profile.firstName && profile.lastName;
  const hasEmail = profile.email;
  sections.push({
    label: "Account",
    status: hasName && hasEmail ? "complete" : "incomplete",
    details: hasName ? `${profile.firstName} ${profile.lastName}` : "Name required",
  });

  // Business & ABN
  const hasAbn = business?.abn;
  const hasEntityName = business?.companyName;
  const abnVerified = abnLookups.length > 0;
  sections.push({
    label: "Business & ABN",
    status: hasAbn && hasEntityName && abnVerified ? "complete" : hasAbn ? "incomplete" : "missing",
    details: hasEntityName
      ? `${business?.companyName}${hasAbn ? ` (ABN: ${business?.abn})` : ""}`
      : "Business details required",
  });

  // Services
  const hasCategories = Array.isArray(business?.tradeCategories) && (business?.tradeCategories as string[]).length > 0;
  sections.push({
    label: "Services & Contacts",
    status: hasCategories ? "complete" : "incomplete",
    details: hasCategories
      ? `${(business?.tradeCategories as string[]).length} trade categories`
      : "Trade categories required",
  });

  // Licences
  sections.push({
    label: "Licences",
    status: licences.length > 0 ? "complete" : "incomplete",
    details: licences.length > 0
      ? `${licences.length} licence${licences.length === 1 ? "" : "s"} added`
      : "No licences added (optional for some trades)",
  });

  // Insurance
  sections.push({
    label: "Insurance",
    status: insurances.length > 0 ? "complete" : "incomplete",
    details: insurances.length > 0
      ? `${insurances.length} polic${insurances.length === 1 ? "y" : "ies"} added`
      : "No insurance policies added",
  });

  // Banking
  sections.push({
    label: "Banking",
    status: bankDetails.length > 0 ? "complete" : "incomplete",
    details: bankDetails.length > 0
      ? `Bank details provided (${bankDetails[0]?.bankName ?? ""})`
      : "Banking details can be completed later",
  });

  // Membership
  sections.push({
    label: "Membership",
    status: membership?.promotionStart ? "complete" : "missing",
    details: membership?.promotionStart
      ? "Promotional terms accepted"
      : "Promotional terms not yet accepted",
  });

  return sections;
}

const STATUS_ICON: Record<SectionStatus, { colour: string; icon: string }> = {
  complete: { colour: "text-emerald-600", icon: "✓" },
  incomplete: { colour: "text-amber-500", icon: "!" },
  missing: { colour: "text-red-500", icon: "×" },
};

const REQUIRED_DECLARATIONS = [
  { name: "authority", label: "I am authorised to represent this business and submit this application.", type: "AUTHORITY_TO_REPRESENT" },
  { name: "accuracy", label: "The information I have provided is accurate to the best of my knowledge.", type: "ACCURACY_OF_INFORMATION" },
  { name: "notify", label: "I will notify StrataVerze of any material changes to the information provided.", type: "OBLIGATION_TO_NOTIFY" },
  { name: "platformTerms", label: "I have read and accept the contractor platform terms.", type: "PLATFORM_TERMS" },
  { name: "privacy", label: "I acknowledge the privacy collection notice.", type: "PRIVACY_NOTICE" },
  { name: "promotionTerms", label: "I accept the promotional membership terms.", type: "PROMOTIONAL_TERMS" },
];

export function StepReview({
  business,
  onboarding,
  licences,
  insurances,
  bankDetails,
  membership,
  declarations,
  abnLookups,
  profile,
  onBack,
}: StepReviewProps) {
  const sections = getSectionStatus(business, licences, insurances, bankDetails, membership, abnLookups, profile);

  const existingDeclarationTypes = new Set(declarations.map((d) => d.declarationType as string));

  const [state, formAction, isPending] = useActionState(
    async (_prev: { error: string | null }, formData: FormData) => {
      const result = await submitApplication({ error: null }, formData);
      return result;
    },
    { error: null },
  );

  const isSubmitted = onboarding?.status === "SUBMITTED" || onboarding?.status === "REVIEWED";

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Review & Submit"
          description="Review your application before submitting."
        />

        {state.error && (
          <div className="rounded-[var(--radius-card)] bg-red-50 border border-red-200 px-4 py-3 mb-4">
            <p className="text-sm text-red-700">{state.error}</p>
          </div>
        )}

        {isSubmitted && (
          <div className="rounded-[var(--radius-card)] bg-emerald-50 border border-emerald-200 px-4 py-3 mb-4">
            <p className="text-sm text-emerald-700 font-medium">
              Your application has been submitted and is under review.
            </p>
          </div>
        )}

        {/* Summary sections */}
        <div className="space-y-3 mb-6">
          {sections.map((section) => (
            <div
              key={section.label}
              className="flex items-start gap-3 rounded-[var(--radius-card)] bg-muted px-4 py-3"
            >
              <span
                className={`shrink-0 mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold ${
                  section.status === "complete"
                    ? "bg-emerald-100 text-emerald-700"
                    : section.status === "incomplete"
                      ? "bg-amber-100 text-amber-700"
                      : "bg-red-100 text-red-700"
                }`}
              >
                {STATUS_ICON[section.status].icon}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">{section.label}</p>
                <p className={`text-xs mt-0.5 ${
                  section.status === "complete" ? "text-ink-muted" : "text-amber-600"
                }`}>
                  {section.details}
                </p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Declarations */}
      {!isSubmitted && (
        <Card>
          <CardHeader
            title="Declarations"
            description="You must accept the following declarations before submitting your application."
          />

          <form action={formAction} className="space-y-4">
            {business?.id ? (
              <input type="hidden" name="contractorId" value={business.id as string} />
            ) : null}

            {REQUIRED_DECLARATIONS.map((decl) => {
              const alreadyAccepted = existingDeclarationTypes.has(decl.type);
              return (
                <div key={decl.name} className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    name={`declaration_${decl.name}`}
                    value={decl.type}
                    defaultChecked={alreadyAccepted}
                    required
                    className="mt-0.5 h-4 w-4 rounded border-line text-supplier focus:ring-supplier"
                  />
                  <label className="text-sm text-ink cursor-pointer">
                    {decl.label}
                    {alreadyAccepted && (
                      <span className="ml-1.5 text-xs text-emerald-600">(previously accepted)</span>
                    )}
                  </label>
                </div>
              );
            })}

            {/* Optional marketing consent */}
            <div className="border-t border-line pt-4 mt-4">
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  name="declaration_marketing"
                  value="MARKETING_CONSENT"
                  defaultChecked={existingDeclarationTypes.has("MARKETING_CONSENT")}
                  className="mt-0.5 h-4 w-4 rounded border-line text-supplier focus:ring-supplier"
                />
                <label className="text-sm text-ink cursor-pointer">
                  I would like to receive marketing communications about StrataVerze services and features.
                  <span className="text-xs text-ink-muted ml-1">(optional)</span>
                </label>
              </div>
            </div>

            {/* Disclaimers */}
            <div className="rounded-[var(--radius-card)] bg-muted p-4 mt-4 space-y-2">
              <p className="text-xs text-ink-muted leading-relaxed">
                The platform does not guarantee work. Membership is not a trade accreditation. Document submission is not verification. Eligibility may be assessed again for each project.
              </p>
            </div>

            <div className="flex justify-between pt-4">
              <button
                type="button"
                onClick={onBack}
                className="border border-line text-ink rounded-[var(--radius-card)] px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="bg-supplier text-white rounded-[var(--radius-card)] px-6 py-2.5 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {isPending ? "Submitting..." : "Submit Application"}
              </button>
            </div>
          </form>
        </Card>
      )}

      {isSubmitted && (
        <div className="flex justify-start">
          <button
            type="button"
            onClick={onBack}
            className="border border-line text-ink rounded-[var(--radius-card)] px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
          >
            Back
          </button>
        </div>
      )}
    </div>
  );
}
