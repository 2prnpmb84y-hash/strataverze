"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ownerWithdrawPaymentPlanRequestAction } from "@/lib/actions/payment-plans";

/** The owner withdraws their request before it is decided, with a confirmation step on the page. */
export function OwnerWithdrawButton({ schemeId, lotId, requestId }: { schemeId: string; lotId: string; requestId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  if (!confirming) {
    return (
      <Button variant="ghost" type="button" onClick={() => setConfirming(true)}>
        Withdraw request
      </Button>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <span>Withdraw your request?</span>
      <Button
        variant="secondary"
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await ownerWithdrawPaymentPlanRequestAction(schemeId, lotId, requestId);
            if (r.error) setError(r.error);
            else router.refresh();
          })
        }
      >
        Withdraw
      </Button>
      <Button variant="ghost" type="button" onClick={() => setConfirming(false)}>
        Keep it
      </Button>
      {error && <span className="text-red-600">{error}</span>}
    </div>
  );
}
