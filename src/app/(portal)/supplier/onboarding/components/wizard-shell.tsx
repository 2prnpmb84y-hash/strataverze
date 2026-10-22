"use client";

import { useState, useCallback } from "react";
import { StepAccount } from "./step-account";
import { StepBusiness } from "./step-business";
import { StepServices } from "./step-services";
import { StepLicences } from "./step-licences";
import { StepInsurance } from "./step-insurance";
import { StepBanking } from "./step-banking";
import { StepMembership, type MembershipPricing } from "./step-membership";
import { StepReview } from "./step-review";

const STEPS = [
  { number: 1, label: "Account" },
  { number: 2, label: "Business" },
  { number: 3, label: "Services" },
  { number: 4, label: "Licences" },
  { number: 5, label: "Insurance" },
  { number: 6, label: "Banking" },
  { number: 7, label: "Membership" },
  { number: 8, label: "Review" },
] as const;

export interface WizardShellProps {
  initialStep: number;
  onboarding: Record<string, unknown> | null;
  business: Record<string, unknown> | null;
  licences: Record<string, unknown>[];
  insurances: Record<string, unknown>[];
  bankDetails: Record<string, unknown>[];
  membership: Record<string, unknown> | null;
  declarations: Record<string, unknown>[];
  abnLookups: Record<string, unknown>[];
  profile: Record<string, unknown>;
  pricing: MembershipPricing;
}

export function WizardShell({
  initialStep,
  onboarding,
  business,
  licences,
  insurances,
  bankDetails,
  membership,
  declarations,
  abnLookups,
  profile,
  pricing,
}: WizardShellProps) {
  const [currentStep, setCurrentStep] = useState(initialStep);

  const completedSteps = new Set<number>();
  if (onboarding) {
    const ob = onboarding as Record<string, boolean>;
    if (ob.stepAccountComplete) completedSteps.add(1);
    if (ob.stepBusinessComplete) completedSteps.add(2);
    if (ob.stepServicesComplete) completedSteps.add(3);
    if (ob.stepLicencesComplete) completedSteps.add(4);
    if (ob.stepInsuranceComplete) completedSteps.add(5);
    if (ob.stepBankingComplete) completedSteps.add(6);
    if (ob.stepMembershipComplete) completedSteps.add(7);
    if (ob.stepReviewComplete) completedSteps.add(8);
  }

  const goNext = useCallback(() => {
    setCurrentStep((s) => Math.min(s + 1, 8));
  }, []);

  const goBack = useCallback(() => {
    setCurrentStep((s) => Math.max(s - 1, 1));
  }, []);

  const goToStep = useCallback((step: number) => {
    if (step >= 1 && step <= 8) {
      setCurrentStep(step);
    }
  }, []);

  return (
    <div className="space-y-6">
      {/* Progress bar */}
      <nav aria-label="Onboarding progress" className="py-2">
        <ol className="flex items-center">
          {STEPS.map((step, idx) => {
            const isCompleted = completedSteps.has(step.number);
            const isCurrent = currentStep === step.number;

            return (
              <li
                key={step.number}
                className={`flex items-center ${idx < STEPS.length - 1 ? "flex-1" : ""}`}
              >
                <button
                  type="button"
                  onClick={() => goToStep(step.number)}
                  className={`
                    relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors
                    ${
                      isCurrent
                        ? "bg-supplier text-white ring-2 ring-supplier/30"
                        : isCompleted
                          ? "bg-supplier/20 text-supplier"
                          : "bg-muted text-ink-muted"
                    }
                  `}
                  aria-current={isCurrent ? "step" : undefined}
                  title={step.label}
                >
                  {isCompleted && !isCurrent ? (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  ) : (
                    step.number
                  )}
                </button>
                {idx < STEPS.length - 1 && (
                  <div
                    className={`mx-1 h-0.5 flex-1 transition-colors ${
                      completedSteps.has(step.number) ? "bg-supplier/30" : "bg-muted"
                    }`}
                  />
                )}
              </li>
            );
          })}
        </ol>
        <div className="mt-2 flex items-center justify-between">
          <p className="text-xs text-ink-muted">
            Step {currentStep} of 8
          </p>
          <p className="text-xs font-medium text-ink">
            {STEPS[currentStep - 1].label}
          </p>
        </div>
      </nav>

      {/* Step content */}
      <div>
        {currentStep === 1 && (
          <StepAccount
            business={business}
            profile={profile}
            onNext={goNext}
          />
        )}
        {currentStep === 2 && (
          <StepBusiness
            business={business}
            abnLookups={abnLookups}
            onNext={goNext}
            onBack={goBack}
          />
        )}
        {currentStep === 3 && (
          <StepServices
            business={business}
            profile={profile}
            onNext={goNext}
            onBack={goBack}
          />
        )}
        {currentStep === 4 && (
          <StepLicences
            business={business}
            licences={licences}
            onNext={goNext}
            onBack={goBack}
          />
        )}
        {currentStep === 5 && (
          <StepInsurance
            business={business}
            insurances={insurances}
            onNext={goNext}
            onBack={goBack}
          />
        )}
        {currentStep === 6 && (
          <StepBanking
            business={business}
            bankDetails={bankDetails}
            onNext={goNext}
            onBack={goBack}
          />
        )}
        {currentStep === 7 && (
          <StepMembership
            business={business}
            membership={membership}
            pricing={pricing}
            onNext={goNext}
            onBack={goBack}
          />
        )}
        {currentStep === 8 && (
          <StepReview
            business={business}
            onboarding={onboarding}
            licences={licences}
            insurances={insurances}
            bankDetails={bankDetails}
            membership={membership}
            declarations={declarations}
            abnLookups={abnLookups}
            profile={profile}
            onBack={goBack}
          />
        )}
      </div>

      {/* Bottom navigation (non-first/last steps get generic Back/Next) */}
    </div>
  );
}
