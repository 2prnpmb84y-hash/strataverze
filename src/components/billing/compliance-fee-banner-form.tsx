"use client";

import { useActionState } from "react";
import { confirmComplianceFee } from "@/lib/actions/contractor-onboarding";
import type { FeeView } from "@/lib/billing/disclosure";
import { FeeDisclosure, useFeeConfirmation } from "./fee-disclosure";

/** Asks a contractor to confirm the annual compliance verification charge. */
export function ComplianceFeeBannerForm({ contractorId, fee }: { contractorId: string; fee: FeeView }) {
  const confirmation = useFeeConfirmation(fee);
  const [state, formAction, pending] = useActionState(confirmComplianceFee, { error: null });

  if (state.success) {
    return <p className="text-sm text-emerald-700">Thank you. Your confirmation has been recorded.</p>;
  }

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="contractorId" value={contractorId} />
      <FeeDisclosure
        fee={fee}
        scheduleHref="/supplier/settings#strataverze-billing"
        confirmed={confirmation.confirmed}
        onConfirmedChange={confirmation.setConfirmed}
        idSuffix="-banner"
      />
      {state.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending || !confirmation.ready}
        className="bg-supplier text-white rounded-[var(--radius-card)] px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        {pending ? "Saving..." : "Confirm"}
      </button>
    </form>
  );
}
