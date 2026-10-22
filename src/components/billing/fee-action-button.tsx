"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { FeeView } from "@/lib/billing/disclosure";
import { FeeDisclosure, useFeeConfirmation } from "./fee-disclosure";

/**
 * A button for an action that attracts a StrataVerze fee. Shows the fee and
 * keeps the button disabled until it is confirmed, then sends the confirmed
 * amount to the server action. Behaves as a plain button when there is no fee.
 */
export function FeeActionButton({
  fee,
  scheduleHref,
  label,
  pendingLabel = "Saving...",
  successMessage,
  variant = "primary",
  action,
  idSuffix = "",
}: {
  fee: FeeView | null;
  scheduleHref: string;
  label: string;
  pendingLabel?: string;
  successMessage?: string;
  variant?: "primary" | "secondary" | "danger";
  action: (feeConfirmedCents: number | null) => Promise<{ error?: string | null } | void>;
  idSuffix?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const confirmation = useFeeConfirmation(fee);

  function run() {
    setError(null);
    start(async () => {
      const result = await action(confirmation.confirmedCents);
      if (result && result.error) {
        setError(result.error);
        return;
      }
      setDone(true);
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <FeeDisclosure
        fee={fee}
        scheduleHref={scheduleHref}
        confirmed={confirmation.confirmed}
        onConfirmedChange={confirmation.setConfirmed}
        idSuffix={idSuffix}
      />
      <Button type="button" variant={variant} onClick={run} disabled={pending || !confirmation.ready}>
        {pending ? pendingLabel : label}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      {done && successMessage && !error && <p className="text-sm text-green-700">{successMessage}</p>}
    </div>
  );
}
