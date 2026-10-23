"use client";

import { useState } from "react";

export interface ResolutionMeetingOption {
  id: string;
  label: string;
  motions: { id: string; label: string }[];
}

/** Choose a general meeting and the carried motion. Calls back with both ids. */
export function ResolutionPicker({
  meetings,
  onChange,
  idPrefix,
}: {
  meetings: ResolutionMeetingOption[];
  onChange: (meetingId: string, motionId: string) => void;
  idPrefix: string;
}) {
  const [meeting, setMeeting] = useState("");
  const [motion, setMotion] = useState("");
  const motions = meetings.find((m) => m.id === meeting)?.motions ?? [];
  const cls = "w-full rounded-[var(--radius-card)] border border-line bg-white px-3 py-2 text-sm";
  if (meetings.length === 0) {
    return <p className="text-sm text-ink-muted">No general meeting with a carried motion is recorded for this scheme. Record the meeting and its minutes first.</p>;
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm text-ink" htmlFor={`${idPrefix}-meeting`}>
        <span className="mb-1 block font-medium">General meeting</span>
        <select
          id={`${idPrefix}-meeting`}
          value={meeting}
          onChange={(e) => {
            setMeeting(e.target.value);
            setMotion("");
            onChange(e.target.value, "");
          }}
          className={cls}
        >
          <option value="">Choose the meeting</option>
          {meetings.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm text-ink" htmlFor={`${idPrefix}-motion`}>
        <span className="mb-1 block font-medium">Motion carried</span>
        <select
          id={`${idPrefix}-motion`}
          value={motion}
          onChange={(e) => {
            setMotion(e.target.value);
            onChange(meeting, e.target.value);
          }}
          className={cls}
        >
          <option value="">Choose the motion</option>
          {motions.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
