"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FormField, SelectField } from "@/components/ui/form-field";
import {
  createCommitteeMeetingAction,
  type CommitteeMeetingFormState,
} from "./actions";

export function CommitteeMeetingForm({
  schemes,
}: {
  schemes: { id: string; name: string }[];
}) {
  const [state, formAction, isPending] = useActionState<
    CommitteeMeetingFormState,
    FormData
  >(createCommitteeMeetingAction, {});

  const schemeOptions = schemes.map((s) => ({
    value: s.id,
    label: s.name,
  }));

  return (
    <form action={formAction} className="space-y-4">
      {state.error && (
        <div className="rounded-[var(--radius-card)] bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {state.error}
        </div>
      )}

      {schemes.length > 1 && (
        <SelectField
          label="Scheme"
          name="schemeId"
          required
          options={schemeOptions}
          error={state.fieldErrors?.schemeId}
        />
      )}

      {schemes.length === 1 && (
        <input type="hidden" name="schemeId" value={schemes[0].id} />
      )}

      <FormField
        label="Meeting Title"
        name="title"
        required
        placeholder="e.g. 2025 Annual General Meeting"
        error={state.fieldErrors?.title}
      />

      <SelectField
        label="Meeting Type"
        name="meetingType"
        required
        defaultValue="COMMITTEE"
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
          className="block text-sm font-medium text-ink mb-1.5"
        >
          Date & Time
          <span className="text-red-500 ml-0.5">*</span>
        </label>
        <input
          id="scheduledAt"
          name="scheduledAt"
          type="datetime-local"
          required
          className="w-full rounded-[var(--radius-card)] border border-line bg-white px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-turquoise focus:border-turquoise transition-colors"
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
        placeholder="e.g. Level 3, 123 Collins Street, Sydney"
      />

      <div>
        <label
          htmlFor="agenda"
          className="block text-sm font-medium text-ink mb-1.5"
        >
          Agenda
        </label>
        <textarea
          id="agenda"
          name="agenda"
          rows={4}
          placeholder="Meeting agenda items..."
          className="w-full rounded-[var(--radius-card)] border border-line bg-white px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-turquoise focus:border-turquoise transition-colors resize-y"
        />
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending ? "Creating..." : "Schedule Meeting"}
      </Button>
    </form>
  );
}
