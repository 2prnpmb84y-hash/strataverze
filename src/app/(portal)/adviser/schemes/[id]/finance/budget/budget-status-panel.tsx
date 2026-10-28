"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ResolutionPicker, type ResolutionMeetingOption } from "@/components/finance/resolution-picker";
import { adoptBudgetAction, proposeBudgetAction, reviseBudgetAction } from "@/lib/actions/budgets";

export interface FundBudgetStatus {
  fundId: string;
  fundName: string;
  budgetId: string | null;
  version: number | null;
  status: string | null;
  adoptedLabel: string | null;
}

const STATUS: Record<string, string> = {
  DRAFT: "Draft",
  PROPOSED: "Proposed to the owners",
  ADOPTED: "Adopted",
};

function Row({ schemeId, row, meetings }: { schemeId: string; row: FundBudgetStatus; meetings: ResolutionMeetingOption[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [adopting, setAdopting] = useState(false);
  const [choice, setChoice] = useState({ meetingId: "", motionId: "" });
  const run = (fn: () => Promise<{ error?: string }>) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (r.error) setError(r.error);
      else {
        setAdopting(false);
        router.refresh();
      }
    });

  return (
    <li className="space-y-3 py-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>
          <span className="font-medium text-ink">{row.fundName}</span>
          <span className="text-ink-muted">
            {" "}
            · {row.status ? `version ${row.version}, ${STATUS[row.status] ?? row.status}` : "no budget yet"}
            {row.adoptedLabel ? ` at ${row.adoptedLabel}` : ""}
          </span>
        </span>
        <span className="flex flex-wrap gap-2">
          {row.budgetId && row.status === "DRAFT" && (
            <Button type="button" variant="secondary" disabled={pending} onClick={() => run(() => proposeBudgetAction(schemeId, row.budgetId!))}>
              Propose
            </Button>
          )}
          {row.budgetId && (row.status === "DRAFT" || row.status === "PROPOSED") && (
            <Button type="button" variant="secondary" onClick={() => setAdopting(!adopting)}>
              {adopting ? "Close" : "Record adoption"}
            </Button>
          )}
          {row.budgetId && row.status === "ADOPTED" && (
            <Button type="button" variant="secondary" disabled={pending} onClick={() => run(() => reviseBudgetAction(schemeId, row.budgetId!))}>
              Start a revision
            </Button>
          )}
        </span>
      </div>
      {adopting && row.budgetId && (
        <div className="space-y-3 rounded-[var(--radius-card)] border border-line bg-zinc-50 p-4">
          <ResolutionPicker meetings={meetings} idPrefix={`budget-${row.fundId}`} onChange={(meetingId, motionId) => setChoice({ meetingId, motionId })} />
          <Button
            type="button"
            disabled={pending || !choice.meetingId || !choice.motionId}
            onClick={() => run(() => adoptBudgetAction(schemeId, row.budgetId!, choice.meetingId, choice.motionId))}
          >
            {pending ? "Saving..." : "Record adoption"}
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-red-600">
          {error}
        </p>
      )}
    </li>
  );
}

/** Each fund's budget for the year: its version, status and adoption. */
/** `levies` is the building's word for levies (packWordsFor). */
export function BudgetStatusPanel({ schemeId, rows, meetings, levies }: { schemeId: string; rows: FundBudgetStatus[]; meetings: ResolutionMeetingOption[]; levies: string }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-white p-6">
      <p className="font-medium text-ink">Budget adoption</p>
      <p className="mt-1 text-sm text-ink-muted">
        Budget {levies} can only be issued once the budget for that fund and year is adopted at a general meeting. An adopted budget is
        read-only; start a revision to change it, and adopt the revision at a later meeting.
      </p>
      <ul className="divide-y divide-line">
        {rows.map((r) => (
          <Row key={r.fundId} schemeId={schemeId} row={r} meetings={meetings} />
        ))}
      </ul>
    </div>
  );
}
