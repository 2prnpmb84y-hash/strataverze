"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { recordLateChargeWaiverAction, type ActionState } from "../actions";
import type { ResolutionMeeting } from "./interest-setting-form";
import type { LateChargeWaiverWords as WaiverWords } from "@/lib/jurisdiction/wording";

/** A waiver already recorded, as the page lists it. */
export interface RecordedWaiver {
  id: string;
  notice: string;
  what: string;
  decidedOn: string;
  reasons: string | null;
}

/**
 * Record a waiver of the late charge on one notice in a particular case (VIC,
 * ACT and WA stage 2, PR 5), where the building's pack allows one: all of it,
 * an amount, or the days of a period, with the resolution that decided it.
 */
export function LateChargeWaiverForm({
  schemeId,
  notices,
  meetings,
  waivers,
  words,
}: {
  schemeId: string;
  notices: { id: string; label: string }[];
  meetings: ResolutionMeeting[];
  waivers: RecordedWaiver[];
  words: WaiverWords;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(recordLateChargeWaiverAction.bind(null, schemeId), {});
  const [kind, setKind] = useState(words.kinds[0]?.value ?? "");
  const [meeting, setMeeting] = useState("");
  const motions = meetings.find((m) => m.id === meeting)?.motions ?? [];
  const field = "w-full rounded-[var(--radius-card)] border border-line bg-white px-3 py-2 text-sm";

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-medium text-ink">{words.heading}</h2>
        <p className="mt-1 text-xs text-ink-muted">{words.description}</p>
      </div>

      {waivers.length > 0 && (
        <ul className="space-y-1 text-sm text-ink">
          {waivers.map((w) => (
            <li key={w.id}>
              {w.notice}: {w.what}, decided {w.decidedOn}
              {w.reasons ? `. Reasons: ${w.reasons}` : ""}
            </li>
          ))}
        </ul>
      )}

      {words.canRecord && (
        <form action={formAction} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm text-ink">
              <span className="mb-1 block font-medium">Notice</span>
              <select name="levyNoticeId" required defaultValue="" className={field}>
                <option value="">Choose the notice</option>
                {notices.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-ink">
              <span className="mb-1 block font-medium">What is waived</span>
              <select name="kind" value={kind} onChange={(e) => setKind(e.target.value)} className={field}>
                {words.kinds.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
            </label>
            {kind === "AMOUNT" && (
              <label className="text-sm text-ink">
                <span className="mb-1 block font-medium">Amount waived ($)</span>
                <input type="number" name="amount" inputMode="decimal" min="0.01" step="0.01" required className={field} />
              </label>
            )}
            {kind === "PERIOD" && (
              <>
                <label className="text-sm text-ink">
                  <span className="mb-1 block font-medium">First day waived</span>
                  <input type="date" name="fromDate" required className={field} />
                </label>
                <label className="text-sm text-ink">
                  <span className="mb-1 block font-medium">Last day waived</span>
                  <input type="date" name="toDate" required className={field} />
                </label>
              </>
            )}
            <label className="text-sm text-ink">
              <span className="mb-1 block font-medium">General meeting</span>
              <select name="meetingId" value={meeting} onChange={(e) => setMeeting(e.target.value)} required className={field}>
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
              <select name="motionId" defaultValue="" key={meeting} required className={field}>
                <option value="">Choose the motion</option>
                {motions.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block text-sm text-ink">
            <span className="mb-1 block font-medium">Reasons{words.reasonsRequired ? "" : " (optional)"}</span>
            <textarea name="reasons" rows={2} required={words.reasonsRequired} className={field} />
          </label>
          {state.error && (
            <p role="alert" className="text-sm text-red-600">
              {state.error}
            </p>
          )}
          {state.success && <p className="text-sm text-green-700">Waiver recorded.</p>}
          <Button type="submit" variant="secondary" disabled={pending}>
            {pending ? "Saving..." : "Record waiver"}
          </Button>
        </form>
      )}
    </div>
  );
}
