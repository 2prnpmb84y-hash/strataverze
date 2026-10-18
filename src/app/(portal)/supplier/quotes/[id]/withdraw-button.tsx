"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { withdrawQuoteAction } from "./actions";

export function WithdrawQuoteButton({ quoteId }: { quoteId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleWithdraw() {
    setLoading(true);
    setError(null);
    const result = await withdrawQuoteAction(quoteId);
    if (result.error) {
      setError(result.error);
      setLoading(false);
      setConfirming(false);
    }
    // On success the page revalidates automatically
  }

  if (!confirming) {
    return (
      <Button
        variant="ghost"
        onClick={() => setConfirming(true)}
        className="text-danger hover:text-danger"
      >
        Withdraw
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-ink-muted">Are you sure?</span>
      <Button
        variant="danger"
        onClick={handleWithdraw}
        disabled={loading}
      >
        {loading ? "Withdrawing…" : "Confirm"}
      </Button>
      <Button
        variant="ghost"
        onClick={() => setConfirming(false)}
        disabled={loading}
      >
        Cancel
      </Button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
