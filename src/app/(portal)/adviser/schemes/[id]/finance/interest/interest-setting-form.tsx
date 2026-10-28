"use client";

import { useActionState, useState } from "react";
import type { LateChargeWords } from "@/lib/jurisdiction/wording";
import { Button } from "@/components/ui/button";
import { saveInterestSettingAction, type ActionState } from "../actions";

export interface ResolutionMeeting {
  id: string;
  label: string;
  motions: { id: string; label: string }[];
}

/**
 * The building's late charge setting, from the modes its pack allows (given
 * in `words.options`). NSW: statutory interest or, by a recorded general
 * meeting resolution, no interest. Queensland: no penalty or, by a recorded
 * general meeting resolution, a penalty at the monthly rate it set. VIC, ACT
 * and WA (`words.annualRate`): a yearly rate within the pack's range, by the
 * resolution the pack names.
 */
export function InterestSettingForm({
  schemeId,
  mode,
  monthlyRatePercent,
  annualRatePercent = null,
  meetingId,
  motionId,
  meetings,
  words,
}: {
  schemeId: string;
  mode: string;
  /** The recorded monthly rate (a resolved rate only). */
  monthlyRatePercent: number | null;
  /** The recorded yearly rate (a resolved yearly rate only; VIC, ACT and WA). */
  annualRatePercent?: number | null;
  meetingId: string | null;
  motionId: string | null;
  meetings: ResolutionMeeting[];
  /** The building's late charge wording and the settings its pack allows. */
  words: LateChargeWords;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    saveInterestSettingAction.bind(null, schemeId),
    {},
  );
  // A setting the pack does not offer starts on the pack's first one.
  const [choice, setChoice] = useState(words.options.some((o) => o.mode === mode) ? mode : (words.options[0]?.mode ?? mode));
  const [meeting, setMeeting] = useState(meetingId ?? "");
  const motions = meetings.find((m) => m.id === meeting)?.motions ?? [];
  const chosen = words.options.find((o) => o.mode === choice);

  return (
    <form action={formAction} className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-ink">{words.legend}</legend>
        {words.options.map((o) => (
          <label key={o.mode} className="flex items-start gap-2 text-sm text-ink">
            <input type="radio" name="mode" value={o.mode} checked={choice === o.mode} onChange={() => setChoice(o.mode)} className="mt-1" />
            <span>{o.label}</span>
          </label>
        ))}
      </fieldset>

      {chosen?.needsRate && words.annualRate && (
        <label className="block text-sm text-ink sm:max-w-xs">
          <span className="mb-1 block font-medium">{words.rateLabel}</span>
          <input
            type="number"
            name="annualRatePercent"
            inputMode="decimal"
            min={words.annualRate.min ?? 0}
            max={words.annualRate.max == null ? undefined : words.annualRate.maxInclusive ? words.annualRate.max : words.annualRate.max - 0.01}
            step="0.01"
            required
            disabled={!words.annualRate.canRecord}
            defaultValue={annualRatePercent ?? ""}
            className="w-full rounded-[var(--radius-card)] border border-line bg-white px-3 py-2 text-sm"
          />
          <span className="mt-1 block text-xs text-ink-muted">{words.rateHelp}</span>
        </label>
      )}

      {chosen?.needsRate && !words.annualRate && (
        <label className="block text-sm text-ink sm:max-w-xs">
          <span className="mb-1 block font-medium">{words.rateLabel}</span>
          <input
            type="number"
            name="monthlyRatePercent"
            inputMode="decimal"
            min="0.01"
            max={words.maxMonthlyRatePercent ?? undefined}
            step="0.01"
            required
            defaultValue={monthlyRatePercent ?? ""}
            className="w-full rounded-[var(--radius-card)] border border-line bg-white px-3 py-2 text-sm"
          />
          <span className="mt-1 block text-xs text-ink-muted">{words.rateHelp}</span>
        </label>
      )}

      {chosen?.needsResolution && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm text-ink">
            <span className="mb-1 block font-medium">General meeting</span>
            <select
              name="meetingId"
              value={meeting}
              onChange={(e) => setMeeting(e.target.value)}
              required
              className="w-full rounded-[var(--radius-card)] border border-line bg-white px-3 py-2 text-sm"
            >
              <option value="">Choose the meeting</option>
              {meetings.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-ink">
            <span className="mb-1 block font-medium">Motion carried</span>
            <select
              name="motionId"
              defaultValue={motionId ?? ""}
              key={meeting}
              required
              className="w-full rounded-[var(--radius-card)] border border-line bg-white px-3 py-2 text-sm"
            >
              <option value="">Choose the motion</option>
              {motions.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          {meetings.length === 0 && (
            <p className="text-xs text-ink-muted sm:col-span-2">
              No general meeting with a carried motion is recorded for this scheme. Record the meeting and its minutes first.
            </p>
          )}
        </div>
      )}

      {state.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
      {state.success && <p className="text-sm text-green-700">{words.Term} setting saved.</p>}
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Saving..." : `Save ${words.term} setting`}
      </Button>
    </form>
  );
}
