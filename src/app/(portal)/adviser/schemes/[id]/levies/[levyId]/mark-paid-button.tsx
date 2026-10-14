"use client";

import { useTransition } from "react";
import { markItemPaidAction } from "../actions";

export function MarkPaidButton({
  schemeId,
  levyId,
  itemId,
  amount,
  lotNumber,
}: {
  schemeId: string;
  levyId: string;
  itemId: string;
  amount: number;
  lotNumber: string;
}) {
  const [isPending, startTransition] = useTransition();

  function handlePaid() {
    startTransition(async () => {
      await markItemPaidAction(schemeId, levyId, itemId, amount);
    });
  }

  return (
    <button
      type="button"
      onClick={handlePaid}
      disabled={isPending}
      className="text-xs font-medium text-primary-500 hover:text-primary-600 transition-colors disabled:opacity-50"
      title={`Mark Lot ${lotNumber} as paid`}
    >
      {isPending ? "Saving..." : "Mark Paid"}
    </button>
  );
}
