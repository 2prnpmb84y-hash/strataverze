"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { withdrawPaymentPlanRequestAction } from "@/lib/actions/payment-plans";

/** Withdraw a request at the owner's direction, with a confirmation step on the page. */
export function WithdrawRequestButton({ schemeId, requestId }: { schemeId: string; requestId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  if (!confirming) {
    return (
      <Button variant="ghost" type="button" onClick={() => setConfirming(true)}>
        The owner withdrew the request
      </Button>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <span>Withdraw this request? It can no longer be decided.</span>
      <Button
        variant="secondary"
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await withdrawPaymentPlanRequestAction(schemeId, requestId);
            if (r.error) setError(r.error);
            else router.refresh();
          })
        }
      >
        Withdraw
      </Button>
      <Button variant="ghost" type="button" onClick={() => setConfirming(false)}>
        Cancel
      </Button>
      {error && <span className="text-red-600">{error}</span>}
    </div>
  );
}
