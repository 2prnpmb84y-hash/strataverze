"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ResolutionPicker, type ResolutionMeetingOption } from "@/components/finance/resolution-picker";
import {
  addPlanItemAction,
  adoptPlanAction,
  createPlanAction,
  generateLevyFromPlanAction,
  removePlanItemAction,
  reviewPlanAction,
  updatePlanSettingsAction,
  type PlanActionState,
} from "@/lib/actions/capital-works-plans";

const input = "w-full rounded-[var(--radius-card)] border border-line bg-white px-3 py-2 text-sm text-ink";
const Label = ({ text, children }: { text: string; children: React.ReactNode }) => (
  <label className="text-sm text-ink">
    <span className="mb-1 block font-medium">{text}</span>
    {children}
  </label>
);
function Result({ state, ok }: { state: PlanActionState; ok?: string }) {
  if (state.error) return <p role="alert" className="text-sm text-red-600">{state.error}</p>;
  if (state.success && ok) return <p className="text-sm text-green-700">{ok}</p>;
  return null;
}

const METHODS = (
  <>
    <option value="LEVEL">Level contribution (keeps the fund above zero every year)</option>
    <option value="AVERAGE">Average over the plan</option>
  </>
);

/** `fundName` is the plan's fund as the building's pack names it ("capital works fund"), from the server page. */
export function NewPlanForm({ schemeId, defaultStartYear, today, fundName }: { schemeId: string; defaultStartYear: number; today: string; fundName: string }) {
  const fundWords = fundName ? fundName[0].toUpperCase() + fundName.slice(1) : fundName;
  const router = useRouter();
  const [state, action, pending] = useActionState<PlanActionState, FormData>(async (prev, fd) => {
    const r = await createPlanAction(schemeId, prev, fd);
    if (r.id) router.push(`/adviser/schemes/${schemeId}/finance/capital-works/${r.id}`);
    return r;
  }, {});
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <Label text="Title">
        <input name="title" required defaultValue={`${fundWords} plan`} className={input} />
      </Label>
      <Label text="Prepared by (person or firm)">
        <input name="preparedBy" className={input} />
      </Label>
      <Label text="Date prepared">
        <input name="preparedAt" type="date" required defaultValue={today} className={input} />
      </Label>
      <Label text="First financial year (FY starting 1 July)">
        <input name="periodStartYear" type="number" min="2000" max="2100" required defaultValue={defaultStartYear} className={input} />
      </Label>
      <Label text={`${fundWords} balance at the start`}>
        <input name="openingBalance" type="number" step="0.01" min="0" defaultValue="0" className={input} />
      </Label>
      <Label text="How the yearly contribution is worked out">
        <select name="method" defaultValue="LEVEL" className={input}>
          {METHODS}
        </select>
      </Label>
      <div className="flex items-center gap-3 sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Creating..." : "Create plan"}
        </Button>
        <Result state={state} />
      </div>
    </form>
  );
}

export function PlanSettingsForm({ schemeId, planId, openingBalance, method }: { schemeId: string; planId: string; openingBalance: string; method: string }) {
  const [state, action, pending] = useActionState<PlanActionState, FormData>(updatePlanSettingsAction.bind(null, schemeId, planId), {});
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-3 sm:items-end">
      <Label text="Fund balance at the start">
        <input name="openingBalance" type="number" step="0.01" min="0" defaultValue={openingBalance} className={input} />
      </Label>
      <Label text="Contribution method">
        <select name="method" defaultValue={method} className={input}>
          {METHODS}
        </select>
      </Label>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Saving..." : "Recalculate"}
        </Button>
        <Result state={state} ok="Saved." />
      </div>
    </form>
  );
}

export function AddItemForm({ schemeId, planId, years }: { schemeId: string; planId: string; years: number[] }) {
  const [state, action, pending] = useActionState<PlanActionState, FormData>(addPlanItemAction.bind(null, schemeId, planId), {});
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-4 sm:items-end">
      <div className="sm:col-span-2">
        <Label text="Work">
          <input name="description" required placeholder="For example, repaint external walls" className={input} />
        </Label>
      </div>
      <Label text="Component">
        <input name="component" placeholder="For example, facade" className={input} />
      </Label>
      <Label text="Year">
        <select name="plannedYear" className={input}>
          {years.map((y) => (
            <option key={y} value={y}>
              FY {y}/{String(y + 1).slice(2)}
            </option>
          ))}
        </select>
      </Label>
      <Label text="Estimated cost">
        <input name="estimatedCost" type="number" step="0.01" min="0" required className={input} />
      </Label>
      <div className="sm:col-span-2">
        <Label text="Notes">
          <input name="notes" className={input} />
        </Label>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Adding..." : "Add item"}
        </Button>
        <Result state={state} />
      </div>
    </form>
  );
}

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<PlanActionState>, after?: (r: PlanActionState) => void) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (r.error) setError(r.error);
      else {
        after?.(r);
        router.refresh();
      }
    });
  return { pending, error, run };
}

export function RemoveItemButton({ schemeId, planId, itemId }: { schemeId: string; planId: string; itemId: string }) {
  const { pending, error, run } = useRun();
  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" disabled={pending} onClick={() => run(() => removePlanItemAction(schemeId, planId, itemId))} className="text-xs text-red-700 underline">
        Remove
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}

export function AdoptPlanForm({ schemeId, planId, meetings }: { schemeId: string; planId: string; meetings: ResolutionMeetingOption[] }) {
  const { pending, error, run } = useRun();
  const [choice, setChoice] = useState({ meetingId: "", motionId: "" });
  return (
    <div className="space-y-3">
      <ResolutionPicker meetings={meetings} idPrefix={`plan-${planId}`} onChange={(meetingId, motionId) => setChoice({ meetingId, motionId })} />
      <Button type="button" disabled={pending || !choice.meetingId || !choice.motionId} onClick={() => run(() => adoptPlanAction(schemeId, planId, choice.meetingId, choice.motionId))}>
        {pending ? "Saving..." : "Record adoption"}
      </Button>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

export function ReviewPlanButton({ schemeId, planId }: { schemeId: string; planId: string }) {
  const router = useRouter();
  const { pending, error, run } = useRun();
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="secondary"
        disabled={pending}
        onClick={() => run(() => reviewPlanAction(schemeId, planId), (r) => r.id && router.push(`/adviser/schemes/${schemeId}/finance/capital-works/${r.id}`))}
      >
        Start the review
      </Button>
      {error && <span className="text-sm text-red-600">{error}</span>}
    </span>
  );
}

export function GenerateLevyForm({ schemeId, years }: { schemeId: string; years: number[] }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<PlanActionState, FormData>(async (prev, fd) => {
    const r = await generateLevyFromPlanAction(schemeId, prev, fd);
    if (r.id) router.push(`/adviser/schemes/${schemeId}/finance/levies/${r.id}`);
    return r;
  }, {});
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-3 sm:items-end">
      <Label text="Financial year">
        <select name="financialYear" className={input}>
          {years.map((y) => (
            <option key={y} value={y}>
              FY {y}/{String(y + 1).slice(2)}
            </option>
          ))}
        </select>
      </Label>
      <Label text="Instalments">
        <select name="frequency" defaultValue="QUARTERLY" className={input}>
          <option value="QUARTERLY">Quarterly</option>
          <option value="MONTHLY">Monthly</option>
          <option value="HALF_YEARLY">Half-yearly</option>
          <option value="ANNUALLY">Annually</option>
        </select>
      </Label>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Creating..." : "Create capital works levy schedule"}
        </Button>
        <Result state={state} />
      </div>
    </form>
  );
}
