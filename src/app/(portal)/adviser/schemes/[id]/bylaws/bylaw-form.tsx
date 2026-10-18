"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FormField, SelectField } from "@/components/ui/form-field";
import {
  createBylawAction,
  updateBylawAction,
  type BylawFormState,
} from "./actions";

const categoryOptions = [
  { value: "GENERAL", label: "General" },
  { value: "SAFETY", label: "Safety and Security" },
  { value: "PARKING", label: "Parking" },
  { value: "PETS", label: "Pets" },
  { value: "NOISE", label: "Noise" },
  { value: "APPEARANCE", label: "Appearance" },
  { value: "BEHAVIOUR", label: "Behaviour" },
  { value: "OTHER", label: "Other" },
];

const statusOptions = [
  { value: "ACTIVE", label: "Active" },
  { value: "AMENDED", label: "Amended" },
  { value: "REPEALED", label: "Repealed" },
];

export function BylawForm({ schemeId }: { schemeId: string }) {
  const action = createBylawAction.bind(null, schemeId);
  const [state, formAction, isPending] = useActionState<
    BylawFormState,
    FormData
  >(action, {});

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? (
        <div className="rounded-[var(--radius-card)] bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {state.error}
        </div>
      ) : null}

      <FormField
        label="Title"
        name="title"
        required
        placeholder="e.g. Noise Restrictions"
        error={state.fieldErrors?.title}
      />

      <div>
        <label
          htmlFor="body"
          className="block text-sm font-medium text-ink mb-1.5"
        >
          By-law Text
          <span className="text-red-500 ml-0.5">*</span>
        </label>
        <textarea
          id="body"
          name="body"
          required
          rows={8}
          placeholder="Enter the full text of the by-law..."
          className="w-full rounded-[var(--radius-card)] border border-line bg-white px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-turquoise focus:border-turquoise transition-colors resize-y"
        />
        {state.fieldErrors?.body ? (
          <p className="mt-1.5 text-xs text-red-500">
            {state.fieldErrors.body}
          </p>
        ) : null}
      </div>

      <SelectField
        label="Category"
        name="category"
        required
        defaultValue="GENERAL"
        options={categoryOptions}
        error={state.fieldErrors?.category}
      />

      <FormField
        label="Effective Date"
        name="effectiveDate"
        type="date"
        required
        error={state.fieldErrors?.effectiveDate}
      />

      <FormField
        label="Motion/Resolution Reference"
        name="motionRef"
        placeholder="e.g. AGM 2024 Resolution 5"
      />

      <div>
        <label
          htmlFor="notes"
          className="block text-sm font-medium text-ink mb-1.5"
        >
          Notes
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          placeholder="Optional notes about this by-law..."
          className="w-full rounded-[var(--radius-card)] border border-line bg-white px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-turquoise focus:border-turquoise transition-colors resize-y"
        />
      </div>

      <Button type="submit" variant="primary" disabled={isPending}>
        {isPending ? "Creating..." : "Create By-law"}
      </Button>
    </form>
  );
}

function formatDateForInput(isoString: string): string {
  return new Date(isoString).toISOString().split("T")[0];
}

export function BylawEditForm({
  schemeId,
  bylawId,
  defaults,
}: {
  schemeId: string;
  bylawId: string;
  defaults: {
    title: string;
    body: string;
    category: string;
    status: string;
    effectiveDate: string;
    amendedDate: string | null;
    repealedDate: string | null;
    motionRef: string | null;
    notes: string | null;
  };
}) {
  const action = updateBylawAction.bind(null, schemeId, bylawId);
  const [state, formAction, isPending] = useActionState<
    BylawFormState,
    FormData
  >(action, {});

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? (
        <div className="rounded-[var(--radius-card)] bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {state.error}
        </div>
      ) : null}

      <FormField
        label="Title"
        name="title"
        required
        defaultValue={defaults.title}
        error={state.fieldErrors?.title}
      />

      <div>
        <label
          htmlFor="body"
          className="block text-sm font-medium text-ink mb-1.5"
        >
          By-law Text
          <span className="text-red-500 ml-0.5">*</span>
        </label>
        <textarea
          id="body"
          name="body"
          required
          rows={8}
          defaultValue={defaults.body}
          className="w-full rounded-[var(--radius-card)] border border-line bg-white px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-turquoise focus:border-turquoise transition-colors resize-y"
        />
        {state.fieldErrors?.body ? (
          <p className="mt-1.5 text-xs text-red-500">
            {state.fieldErrors.body}
          </p>
        ) : null}
      </div>

      <SelectField
        label="Category"
        name="category"
        required
        defaultValue={defaults.category}
        options={categoryOptions}
        error={state.fieldErrors?.category}
      />

      <SelectField
        label="Status"
        name="status"
        required
        defaultValue={defaults.status}
        options={statusOptions}
        error={state.fieldErrors?.status}
      />

      <FormField
        label="Effective Date"
        name="effectiveDate"
        type="date"
        required
        defaultValue={formatDateForInput(defaults.effectiveDate)}
        error={state.fieldErrors?.effectiveDate}
      />

      <FormField
        label="Amended Date"
        name="amendedDate"
        type="date"
        defaultValue={
          defaults.amendedDate
            ? formatDateForInput(defaults.amendedDate)
            : undefined
        }
      />

      <FormField
        label="Repealed Date"
        name="repealedDate"
        type="date"
        defaultValue={
          defaults.repealedDate
            ? formatDateForInput(defaults.repealedDate)
            : undefined
        }
      />

      <FormField
        label="Motion/Resolution Reference"
        name="motionRef"
        defaultValue={defaults.motionRef ?? ""}
        placeholder="e.g. AGM 2024 Resolution 5"
      />

      <div>
        <label
          htmlFor="notes"
          className="block text-sm font-medium text-ink mb-1.5"
        >
          Notes
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          defaultValue={defaults.notes ?? ""}
          placeholder="Optional notes about this by-law..."
          className="w-full rounded-[var(--radius-card)] border border-line bg-white px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-turquoise focus:border-turquoise transition-colors resize-y"
        />
      </div>

      <Button type="submit" variant="primary" disabled={isPending}>
        {isPending ? "Saving..." : "Save Changes"}
      </Button>
    </form>
  );
}
