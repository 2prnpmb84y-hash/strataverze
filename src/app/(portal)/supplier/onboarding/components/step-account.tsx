"use client";

import { useActionState } from "react";
import { Card, CardHeader } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { CheckboxField } from "@/components/ui/form-field";
import {
  registerContractorAccount,
  updateOnboardingStep,
} from "@/lib/actions/contractor-onboarding";

interface StepAccountProps {
  business: Record<string, unknown> | null;
  profile: Record<string, unknown>;
  onNext: () => void;
}

export function StepAccount({ business, profile, onNext }: StepAccountProps) {
  const isNewRegistration = !business;

  const [state, formAction, isPending] = useActionState(
    async (_prev: { error: string | null }, formData: FormData) => {
      if (isNewRegistration) {
        // Register creates the contractor business and contacts
        const result = await registerContractorAccount();
        if (result.success) {
          onNext();
        }
        return result;
      }
      // Already registered: mark step complete and advance
      const stepData = new FormData();
      stepData.set("contractorId", business.id as string);
      stepData.set("step", "1");
      const result = await updateOnboardingStep({ error: null }, stepData);
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
        title="Your Account"
        description={
          isNewRegistration
            ? "Create your contractor account to get started."
            : "Review and update your account details."
        }
      />

      <form action={formAction} className="space-y-4">
        {state.error && (
          <div className="rounded-[var(--radius-card)] bg-red-50 border border-red-200 px-4 py-3">
            <p className="text-sm text-red-700">{state.error}</p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField
            label="First name"
            name="firstName"
            required
            defaultValue={(profile.firstName as string) ?? ""}
          />
          <FormField
            label="Last name"
            name="lastName"
            required
            defaultValue={(profile.lastName as string) ?? ""}
          />
        </div>

        <FormField
          label="Work email"
          name="email"
          type="email"
          required
          defaultValue={(profile.email as string) ?? ""}
        />

        <FormField
          label="Mobile"
          name="mobile"
          type="tel"
          required
          defaultValue={(profile.phone as string) ?? ""}
          placeholder="04XX XXX XXX"
        />

        <FormField
          label="Position / Title"
          name="position"
          defaultValue={(profile.position as string) ?? ""}
          placeholder="e.g. Director, Project Manager"
        />

        <div className="border-t border-line pt-4 mt-6">
          <CheckboxField
            label="I confirm I am authorised to act on behalf of this business"
            name="authorityDeclaration"
            helpText="You must have authority to register and manage this business account."
          />
        </div>

        <div className="flex justify-end pt-4">
          <button
            type="submit"
            disabled={isPending}
            className="bg-supplier text-white rounded-[var(--radius-card)] px-6 py-2.5 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {isPending
              ? "Saving..."
              : isNewRegistration
                ? "Create Account"
                : "Save & Continue"}
          </button>
        </div>
      </form>
    </Card>
  );
}
