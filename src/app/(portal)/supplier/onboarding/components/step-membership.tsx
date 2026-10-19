"use client";

import { useActionState } from "react";
import { Card, CardHeader } from "@/components/ui/card";
import { CheckboxField } from "@/components/ui/form-field";
import { acceptMembership } from "@/lib/actions/contractor-onboarding";

interface StepMembershipProps {
  business: Record<string, unknown> | null;
  membership: Record<string, unknown> | null;
  onNext: () => void;
  onBack: () => void;
}

const MEMBERSHIP_INCLUSIONS = [
  "Business profile listing",
  "Multiple authorised business users",
  "Trade and location preferences",
  "Relevant RFQ invitations where available",
  "Quotation submission",
  "Compliance document management",
  "Expiry reminders",
  "Awarded work administration",
  "Variations",
  "Completion submissions",
  "Invoice submission",
  "Payment status visibility",
];

export function StepMembership({ business, membership, onNext, onBack }: StepMembershipProps) {
  const hasAccepted = membership?.promotionStart != null;

  const [state, formAction, isPending] = useActionState(
    async (_prev: { error: string | null }, formData: FormData) => {
      const result = await acceptMembership({ error: null }, formData);
      if (result.success) {
        onNext();
      }
      return result;
    },
    { error: null },
  );

  return (
    <Card>
      <CardHeader
        title="Membership"
        description="Review the StrataVerze Contractor plan and promotional offer."
      />

      {state.error && (
        <div className="rounded-[var(--radius-card)] bg-red-50 border border-red-200 px-4 py-3 mb-4">
          <p className="text-sm text-red-700">{state.error}</p>
        </div>
      )}

      {/* Plan details */}
      <div className="rounded-[var(--radius-card)] bg-muted p-5 mb-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="font-heading font-semibold text-lg text-ink">
              StrataVerze Contractor
            </h3>
            <p className="text-sm text-ink-muted mt-0.5">Monthly membership plan</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-ink">$0.00</p>
            <p className="text-xs text-ink-muted">currently payable</p>
          </div>
        </div>

        <div className="border-t border-line pt-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-ink-muted">Promotional period</span>
            <span className="text-ink font-medium">Free through 31 March 2027</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-ink-muted">Future price</span>
            <span className="text-ink font-medium">$65.00 AUD/month (proposed GST-inclusive)</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-ink-muted">Paid availability</span>
            <span className="text-ink font-medium">From 1 April 2027</span>
          </div>
        </div>
      </div>

      {/* Promotion terms */}
      <div className="mb-6">
        <h4 className="text-sm font-semibold text-ink mb-3">Promotion Terms</h4>
        <ul className="space-y-2">
          {[
            "No credit card required",
            "No automatic charge when the promotional period ends",
            "Explicit paid subscription activation required",
            "Month-to-month billing (no minimum term)",
            "No additional per-lead fees under this plan",
            "No platform commission on awarded work under this plan",
            "No guarantee of leads, work or contract awards",
          ].map((term) => (
            <li key={term} className="flex items-start gap-2">
              <svg className="h-4 w-4 text-supplier shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              <span className="text-sm text-ink">{term}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Inclusions */}
      <div className="mb-6">
        <h4 className="text-sm font-semibold text-ink mb-3">What's Included</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
          {MEMBERSHIP_INCLUSIONS.map((item) => (
            <div key={item} className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-supplier shrink-0" />
              <span className="text-sm text-ink">{item}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Important notices */}
      <div className="rounded-[var(--radius-card)] bg-blue-50 border border-blue-200 px-4 py-3 mb-6">
        <p className="text-xs text-blue-700 leading-relaxed">
          Payment does not improve compliance status, guarantee selection, override scheme procurement decisions, or automatically improve contractor rankings.
        </p>
      </div>

      {hasAccepted ? (
        <div className="rounded-[var(--radius-card)] bg-emerald-50 border border-emerald-200 px-4 py-3 mb-4">
          <p className="text-sm text-emerald-700 font-medium">
            Promotional terms accepted
          </p>
          <p className="text-xs text-emerald-600 mt-0.5">
            {membership?.promotionEnd ? (
              <>Promotion valid through {new Date(membership.promotionEnd as string).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}</>
            ) : null}
          </p>
        </div>
      ) : (
        <form action={formAction}>
          {business?.id ? (
            <input type="hidden" name="contractorId" value={business.id as string} />
          ) : null}

          <div className="border-t border-line pt-4 mb-4">
            <CheckboxField
              label="I accept the promotional membership terms as described above"
              name="acceptTerms"
              helpText="By accepting, you agree to the current promotional period terms. No payment is required at this time."
            />
          </div>

          <div className="flex justify-between pt-2">
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
              {isPending ? "Accepting..." : "Accept & Continue"}
            </button>
          </div>
        </form>
      )}

      {hasAccepted && (
        <div className="flex justify-between pt-4">
          <button
            type="button"
            onClick={onBack}
            className="border border-line text-ink rounded-[var(--radius-card)] px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
          >
            Back
          </button>
          <button
            type="button"
            onClick={onNext}
            className="bg-supplier text-white rounded-[var(--radius-card)] px-6 py-2.5 text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Continue
          </button>
        </div>
      )}
    </Card>
  );
}
