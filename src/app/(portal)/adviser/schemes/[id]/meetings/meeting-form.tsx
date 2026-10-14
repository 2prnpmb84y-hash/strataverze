"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FormField, SelectField } from "@/components/ui/form-field";
import {
  createMeetingAction,
  updateMeetingAction,
  type MeetingFormState,
} from "./actions";

export function MeetingForm({
  mode,
  schemeId,
  meetingId,
  defaults,
}: {
  mode: "create" | "edit";
  schemeId: string;
  meetingId?: string;
  defaults?: {
    title: string;
    meetingType: string;
    scheduledAt: string;
    location?: string | null;
    agenda?: string | null;
  };
}) {
  const action =
    mode === "create"
      ? createMeetingAction.bind(null, schemeId)
      : updateMeetingAction.bind(null, schemeId, meetingId!);

  const [state, formAction, isPending] = useActionState<
    MeetingFormState,
    FormData
  >(action, {});

  // Format scheduledAt for datetime-local input
  const scheduledAtValue = defaults?.scheduledAt
    ? new Date(defaults.scheduledAt).toISOString().slice(0, 16)
    : "";

  return (
    <form action={formAction} className="space-y-4">
      {state.error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {state.error}
        </div>
      )}

      <FormField
        label="Meeting Title"
        name="title"
        required
        defaultValue={defaults?.title}
        placeholder="e.g. 2025 Annual General Meeting"
        error={state.fieldErrors?.title}
      />

      <SelectField
        label="Meeting Type"
        name="meetingType"
        required
        defaultValue={defaults?.meetingType ?? "AGM"}
        options={[
          { value: "AGM", label: "Annual General Meeting (AGM)" },
          { value: "SGM", label: "Special General Meeting (SGM)" },
          { value: "COMMITTEE", label: "Committee Meeting" },
        ]}
        error={state.fieldErrors?.meetingType}
      />

      <div>
        <label
          htmlFor="scheduledAt"
          className="block text-sm font-medium text-foreground mb-1.5"
        >
          Date & Time
          <span className="text-red-500 ml-0.5">*</span>
        </label>
        <input
          id="scheduledAt"
          name="scheduledAt"
          type="datetime-local"
          required
          defaultValue={scheduledAtValue}
          className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-400 transition-colors"
        />
        {state.fieldErrors?.scheduledAt && (
          <p className="mt-1.5 text-xs text-red-500">
            {state.fieldErrors.scheduledAt}
          </p>
        )}
      </div>

      <FormField
        label="Location"
        name="location"
        defaultValue={defaults?.location ?? ""}
        placeholder="e.g. Level 3, 123 Collins Street, Melbourne"
      />

      <div>
        <label
          htmlFor="agenda"
          className="block text-sm font-medium text-foreground mb-1.5"
        >
          Agenda
        </label>
        <textarea
          id="agenda"
          name="agenda"
          rows={4}
          defaultValue={defaults?.agenda ?? ""}
          placeholder="Meeting agenda items..."
          className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-400 transition-colors resize-y"
        />
      </div>

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
