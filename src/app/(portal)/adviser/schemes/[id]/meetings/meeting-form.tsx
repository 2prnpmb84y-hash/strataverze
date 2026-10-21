"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { FormField, SelectField, TextareaField } from "@/components/ui/form-field";
import {
  createMeetingAction,
  updateMeetingAction,
  type MeetingFormState,
} from "./actions";

const MEETING_TYPE_OPTIONS = [
  { value: "AGM", label: "Annual General Meeting (AGM)" },
  { value: "EGM", label: "Extraordinary / General Meeting (EGM)" },
  { value: "COMMITTEE", label: "Committee Meeting" },
  { value: "FIRST_AGM", label: "First AGM" },
];

const FORMAT_OPTIONS = [
  { value: "IN_PERSON", label: "In person" },
  { value: "VIRTUAL", label: "Virtual" },
  { value: "HYBRID", label: "Hybrid" },
];

/** SGM is a legacy alias for EGM. */
function normaliseType(value: string): string {
  return value === "SGM" ? "EGM" : value;
}

function wholeDaysFromToday(iso: string): number | null {
  if (!iso) return null;
  const target = new Date(iso);
  if (Number.isNaN(target.getTime())) return null;
  const ms = 24 * 60 * 60 * 1000;
  const today = new Date();
  const a = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const b = Date.UTC(target.getFullYear(), target.getMonth(), target.getDate());
  return Math.round((b - a) / ms);
}

export function MeetingForm({
  mode,
  schemeId,
  meetingId,
  defaults,
  noticePeriods = {},
}: {
  mode: "create" | "edit";
  schemeId: string;
  meetingId?: string;
  defaults?: {
    title: string;
    meetingType: string;
    scheduledAt: string;
    endTime?: string | null;
    timezone?: string | null;
    format?: string | null;
    location?: string | null;
    agenda?: string | null;
    joinUrl?: string | null;
    joinDetails?: string | null;
  };
  /** Minimum notice days by meeting type, for the live notice-period hint. */
  noticePeriods?: Partial<Record<string, number>>;
}) {
  const action =
    mode === "create"
      ? createMeetingAction.bind(null, schemeId)
      : updateMeetingAction.bind(null, schemeId, meetingId!);

  const [state, formAction, isPending] = useActionState<
    MeetingFormState,
    FormData
  >(action, {});

  const [meetingType, setMeetingType] = useState(
    defaults?.meetingType ?? "AGM",
  );
  const [format, setFormat] = useState(defaults?.format ?? "IN_PERSON");
  const [startValue, setStartValue] = useState(
    defaults?.scheduledAt
      ? new Date(defaults.scheduledAt).toISOString().slice(0, 16)
      : "",
  );
  const endValue = defaults?.endTime
    ? new Date(defaults.endTime).toISOString().slice(0, 16)
    : "";

  const requiredDays = noticePeriods[normaliseType(meetingType)];
  const daysAway = wholeDaysFromToday(startValue);
  const isVirtual = format === "VIRTUAL" || format === "HYBRID";
  const needsLocation = format === "IN_PERSON" || format === "HYBRID";

  const inputClasses =
    "w-full rounded-[var(--radius-card)] border border-line bg-white px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-turquoise focus:border-turquoise transition-colors";

  return (
    <form action={formAction} className="space-y-4">
      {state.error && (
        <div className="rounded-[var(--radius-card)] bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {state.error}
        </div>
      )}

      <FormField
        label="Meeting Title"
        name="title"
        required
        defaultValue={defaults?.title}
        placeholder="e.g. 2026 Annual General Meeting"
        error={state.fieldErrors?.title}
      />

      <SelectField
        label="Meeting Type"
        name="meetingType"
        required
        value={meetingType}
        onChange={(e) => setMeetingType(e.target.value)}
        options={MEETING_TYPE_OPTIONS}
        error={state.fieldErrors?.meetingType}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="scheduledAt" className="block text-sm font-medium text-ink mb-1.5">
            Date &amp; Start Time<span className="text-red-500 ml-0.5">*</span>
          </label>
          <input
            id="scheduledAt"
            name="scheduledAt"
            type="datetime-local"
            required
            value={startValue}
            onChange={(e) => setStartValue(e.target.value)}
            className={inputClasses}
          />
          {state.fieldErrors?.scheduledAt && (
            <p className="mt-1.5 text-xs text-red-500">{state.fieldErrors.scheduledAt}</p>
          )}
          {state.fieldErrors?.startTime && (
            <p className="mt-1.5 text-xs text-red-500">{state.fieldErrors.startTime}</p>
          )}
        </div>
        <div>
          <label htmlFor="endTime" className="block text-sm font-medium text-ink mb-1.5">
            End Time
          </label>
          <input
            id="endTime"
            name="endTime"
            type="datetime-local"
            defaultValue={endValue}
            className={inputClasses}
          />
          {state.fieldErrors?.endTime && (
            <p className="mt-1.5 text-xs text-red-500">{state.fieldErrors.endTime}</p>
          )}
        </div>
      </div>

      {requiredDays != null && (
        <div
          className={`rounded-[var(--radius-card)] px-4 py-2.5 text-xs ${
            daysAway != null && daysAway < requiredDays
              ? "bg-amber-50 border border-amber-200 text-amber-800"
              : "bg-turquoise/5 border border-turquoise/20 text-ink-muted"
          }`}
        >
          This meeting type requires at least <strong>{requiredDays} days</strong> notice.
          {daysAway != null && daysAway < requiredDays
            ? ` The selected date is only ${daysAway} day(s) away, which is short of the notice period.`
            : daysAway != null
              ? ` The selected date is ${daysAway} days away.`
              : ""}
        </div>
      )}

      <SelectField
        label="Format"
        name="format"
        value={format}
        onChange={(e) => setFormat(e.target.value)}
        options={FORMAT_OPTIONS}
      />

      <FormField
        label={needsLocation ? "Location" : "Location (optional)"}
        name="location"
        required={needsLocation}
        defaultValue={defaults?.location ?? ""}
        placeholder="e.g. Level 3, 123 Collins Street"
        error={state.fieldErrors?.location}
      />

      {isVirtual && (
        <>
          <FormField
            label="Video Join Link"
            name="joinUrl"
            required
            defaultValue={defaults?.joinUrl ?? ""}
            placeholder="https://zoom.us/j/..."
            error={state.fieldErrors?.joinUrl}
            helpText="Paste the meeting join link. It will be added to the notice."
          />
          <FormField
            label="Dial-in / Passcode (optional)"
            name="joinDetails"
            defaultValue={defaults?.joinDetails ?? ""}
            placeholder="Passcode 123456, dial-in +61 2 ..."
          />
        </>
      )}

      <FormField
        label="Timezone"
        name="timezone"
        defaultValue={defaults?.timezone ?? "Australia/Sydney"}
        helpText="IANA timezone for the meeting."
      />

      <TextareaField
        label="Agenda (optional)"
        name="agenda"
        defaultValue={defaults?.agenda ?? ""}
        placeholder="Structured agenda items are added in the next stage."
        rows={3}
      />

      <Button type="submit" disabled={isPending}>
        {isPending
          ? "Saving..."
          : mode === "create"
            ? "Create Meeting"
            : "Save Changes"}
      </Button>
    </form>
  );
}
