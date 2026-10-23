"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ResolutionPicker, type ResolutionMeetingOption } from "@/components/finance/resolution-picker";
import { adoptStatutoryPackAction, setFundAccountingBasisAction } from "@/lib/actions/statutory";

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<{ error?: string }>) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (r.error) setError(r.error);
      else router.refresh();
    });
  return { pending, error, run };
}

export function AdoptPackForm({ schemeId, financialYear, meetings }: { schemeId: string; financialYear: number; meetings: ResolutionMeetingOption[] }) {
  const { pending, error, run } = useRun();
  const [choice, setChoice] = useState({ meetingId: "", motionId: "" });
  return (
    <div className="space-y-3">
      <ResolutionPicker meetings={meetings} idPrefix="pack" onChange={(meetingId, motionId) => setChoice({ meetingId, motionId })} />
      <Button
        type="button"
        disabled={pending || !choice.meetingId || !choice.motionId}
        onClick={() => run(() => adoptStatutoryPackAction(schemeId, financialYear, choice.meetingId, choice.motionId))}
      >
        {pending ? "Locking..." : "Record adoption and lock the statements"}
      </Button>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

export function FundBasisSelect({ schemeId, fundId, fundName, basis, locked }: { schemeId: string; fundId: string; fundName: string; basis: string; locked: boolean }) {
  const { pending, error, run } = useRun();
  return (
    <label className="flex flex-wrap items-center gap-2 text-sm text-ink">
      <span className="min-w-40 font-medium">{fundName}</span>
      <select
        defaultValue={basis}
        disabled={pending || locked}
        onChange={(e) => {
          const v = e.target.value;
          run(() => setFundAccountingBasisAction(schemeId, fundId, v));
        }}
        className="rounded-[var(--radius-card)] border border-line bg-white px-3 py-2 text-sm"
        aria-label={`Accounting basis for ${fundName}`}
      >
        <option value="CASH">Cash basis</option>
        <option value="ACCRUAL">Accrual basis</option>
      </select>
      {error && <span className="text-red-600">{error}</span>}
    </label>
  );
}
