"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

/** Approve button for an invoice. Disabled, with the reason shown, when the controls block the viewer. */
export function ApproveButton({
  action,
  blockedReason = null,
  label = "Approve for payment",
}: {
  action: () => Promise<{ error?: string | null; success?: boolean | true }>;
  blockedReason?: string | null;
  label?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <Button
        type="button"
        disabled={pending || !!blockedReason}
        onClick={() =>
          start(async () => {
            setError(null);
            const result = await action();
            if (result?.error) setError(result.error);
            else router.refresh();
          })
        }
      >
        {pending ? "Approving..." : label}
      </Button>
      {blockedReason && <p className="text-sm text-ink-muted">{blockedReason}</p>}
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
