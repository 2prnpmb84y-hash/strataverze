"use client";

import { useActionState, useState } from "react";
import { Card, CardHeader } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { saveBankDetails } from "@/lib/actions/contractor-onboarding";

const STATUS_COLOURS: Record<string, string> = {
  NOT_PROVIDED: "bg-gray-100 text-gray-700",
  SUBMITTED_UNVERIFIED: "bg-amber-50 text-amber-700",
  VERIFICATION_PENDING: "bg-blue-50 text-blue-700",
  VERIFIED: "bg-emerald-50 text-emerald-700",
  CHANGE_PENDING: "bg-amber-50 text-amber-700",
  REJECTED: "bg-red-50 text-red-700",
  SUPERSEDED: "bg-gray-100 text-gray-600",
};

function formatStatus(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function maskAccountNumber(num: string): string {
  if (!num || num.length <= 4) return num;
  return "•".repeat(num.length - 4) + num.slice(-4);
}

interface StepBankingProps {
  business: Record<string, unknown> | null;
  bankDetails: Record<string, unknown>[];
  onNext: () => void;
  onBack: () => void;
}

export function StepBanking({ business, bankDetails, onNext, onBack }: StepBankingProps) {
  const currentBank = bankDetails.length > 0 ? bankDetails[0] : null;
  const accountName = (currentBank?.accountName as string) ?? "";
  const businessName = (business?.companyName as string) ?? (business?.tradingName as string) ?? "";
  const [showDifference, setShowDifference] = useState(
    currentBank?.entityDifferenceExplanation ? true : false,
  );

  const [state, formAction, isPending] = useActionState(
    async (_prev: { error: string | null }, formData: FormData) => {
      const result = await saveBankDetails({ error: null }, formData);
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
        title="Payout Banking Details"
        description="Provide your bank account details for receiving payments."
      />

      {/* Current bank details summary */}
      {currentBank && (
        <div className="rounded-[var(--radius-card)] bg-muted p-4 mb-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-ink-muted">Current bank details</p>
              <p className="text-sm font-medium text-ink mt-0.5">
                {currentBank.accountName as string}
              </p>
              <p className="text-xs text-ink-muted mt-0.5">
                {currentBank.bankName as string}
                {currentBank.bsb ? ` · BSB ${currentBank.bsb as string}` : null}
                {currentBank.accountNumber ? ` · ${maskAccountNumber(currentBank.accountNumber as string)}` : null}
              </p>
            </div>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                STATUS_COLOURS[(currentBank.status as string) ?? "NOT_PROVIDED"] ?? STATUS_COLOURS.NOT_PROVIDED
              }`}
            >
              {formatStatus((currentBank.status as string) ?? "NOT_PROVIDED")}
            </span>
          </div>
        </div>
      )}

      <form action={formAction} className="space-y-4">
        {state.error && (
          <div className="rounded-[var(--radius-card)] bg-red-50 border border-red-200 px-4 py-3">
            <p className="text-sm text-red-700">{state.error}</p>
          </div>
        )}

        {business?.id ? (
          <input type="hidden" name="contractorId" value={business.id as string} />
        ) : null}

        <FormField
          label="Account holder name"
          name="accountName"
          required
          defaultValue={accountName}
          helpText="As shown on the bank account"
        />

        <FormField
          label="Bank name"
          name="bankName"
          required
          defaultValue={(currentBank?.bankName as string) ?? ""}
          placeholder="e.g. Commonwealth Bank, ANZ"
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField
            label="BSB"
            name="bsb"
            required
            defaultValue={(currentBank?.bsb as string) ?? ""}
            placeholder="XXX-XXX"
            helpText="6 digits"
          />
          <FormField
            label="Account number"
            name="accountNumber"
            required
            defaultValue=""
            placeholder="Enter account number"
            helpText="You must re-enter account number each time for security."
          />
        </div>

        <FormField
          label="Remittance email"
          name="remittanceEmail"
          type="email"
          defaultValue={(currentBank?.remittanceEmail as string) ?? ""}
          placeholder="accounts@yourbusiness.com.au"
          helpText="Where remittance advices will be sent."
        />

        {/* Entity difference explanation */}
        {accountName && businessName && accountName.toLowerCase() !== businessName.toLowerCase() && (
          <div className="rounded-[var(--radius-card)] bg-amber-50 border border-amber-200 p-4">
            <p className="text-sm text-amber-800 font-medium mb-2">
              The account holder name differs from your business name.
            </p>
            <p className="text-xs text-amber-700 mb-3">
              Please explain why the bank account is in a different name.
            </p>
            <FormField
              label="Explanation"
              name="entityDifferenceExplanation"
              required
              defaultValue={(currentBank?.entityDifferenceExplanation as string) ?? ""}
              placeholder="e.g. Trading under personal account, trust structure"
            />
          </div>
        )}

        <div className="rounded-[var(--radius-card)] bg-blue-50 border border-blue-200 px-4 py-3">
          <p className="text-xs text-blue-700 leading-relaxed">
            Bank details are stored securely and will require independent verification before use for payments. Account numbers are masked in ordinary views.
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
            {isPending ? "Saving..." : "Save & Continue"}
          </button>
        </div>
      </form>
    </Card>
  );
}
