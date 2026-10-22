"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { saveInterestSettingAction, type ActionState } from "../actions";

export interface ResolutionMeeting {
  id: string;
  label: string;
  motions: { id: string; label: string }[];
}

/** Statutory interest or, by a recorded general meeting resolution, no interest. */
export function InterestSettingForm({
  schemeId,
  mode,
  meetingId,
  motionId,
  meetings,
}: {
  schemeId: string;
  mode: "STATUTORY" | "NO_INTEREST";
  meetingId: string | null;
  motionId: string | null;
  meetings: ResolutionMeeting[];
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    saveInterestSettingAction.bind(null, schemeId),
    {},
  );
  const [choice, setChoice] = useState(mode);
  const [meeting, setMeeting] = useState(meetingId ?? "");
  const motions = meetings.find((m) => m.id === meeting)?.motions ?? [];

  return (
    <form action={formAction} className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-ink">Interest on overdue levies</legend>
        <label className="flex items-start gap-2 text-sm text-ink">
          <input type="radio" name="mode" value="STATUTORY" checked={choice === "STATUTORY"} onChange={() => setChoice("STATUTORY")} className="mt-1" />
          <span>
            Statutory interest: simple interest at 10% a year on levies unpaid one month after the due date. This is the
            default under the Strata Schemes Management Act 2015 (NSW) s 85. The rate cannot be changed.
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm text-ink">
          <input type="radio" name="mode" value="NO_INTEREST" checked={choice === "NO_INTEREST"} onChange={() => setChoice("NO_INTEREST")} className="mt-1" />
          <span>No interest, because a general meeting resolved that contributions bear no interest (s 85(3)).</span>
        </label>
      </fieldset>

      {choice === "NO_INTEREST" && (
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
      {state.success && <p className="text-sm text-green-700">Interest setting saved.</p>}
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Saving..." : "Save interest setting"}
      </Button>
    </form>
  );
}
