"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setTreasurerAction } from "@/lib/actions/payment-controls";

/** Mark a committee member as the treasurer (an eligible payment approver). */
export function TreasurerToggle({ schemeId, membershipId, isTreasurer }: { schemeId: string; membershipId: string; isTreasurer: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const id = `treasurer-${membershipId}`;
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <label htmlFor={id} className="inline-flex items-center gap-2 text-xs text-ink cursor-pointer">
        <input
          id={id}
          type="checkbox"
          checked={isTreasurer}
          disabled={pending}
          onChange={(e) =>
            start(async () => {
              setError(null);
              const r = await setTreasurerAction(schemeId, membershipId, e.target.checked);
              if (r.error) setError(r.error);
              else router.refresh();
            })
          }
        />
        Treasurer
      </label>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
