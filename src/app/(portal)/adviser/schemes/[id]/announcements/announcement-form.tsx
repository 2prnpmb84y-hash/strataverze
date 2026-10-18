"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FormField, SelectField } from "@/components/ui/form-field";
import {
  createAnnouncementAction,
  updateAnnouncementAction,
  type AnnouncementFormState,
} from "./actions";

const priorityOptions = [
  { value: "NORMAL", label: "Normal" },
  { value: "IMPORTANT", label: "Important" },
  { value: "URGENT", label: "Urgent" },
];

export function AnnouncementForm({
  schemeId,
}: {
  schemeId: string;
}) {
  const action = createAnnouncementAction.bind(null, schemeId);
  const [state, formAction, isPending] = useActionState<
    AnnouncementFormState,
    FormData
  >(action, {});

  return (
    <form action={formAction} className="space-y-4">
      {state.error && (
        <div className="rounded-[var(--radius-card)] bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {state.error}
        </div>
      )}

      <FormField
        label="Title"
        name="title"
        required
        placeholder="e.g. Annual General Meeting Notice"
        error={state.fieldErrors?.title}
      />

      <div>
        <label
          htmlFor="body"
          className="block text-sm font-medium text-ink mb-1.5"
        >
          Body
          <span className="text-red-500 ml-0.5">*</span>
        </label>
        <textarea
          id="body"
          name="body"
          required
          rows={6}
          placeholder="Write the announcement content here..."
          className="w-full rounded-[var(--radius-card)] border border-line bg-white px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-turquoise focus:border-turquoise transition-colors resize-y"
        />
        {state.fieldErrors?.body && (
          <p className="mt-1.5 text-xs text-red-500">
            {state.fieldErrors.body}
          </p>
        )}
      </div>

      <SelectField
        label="Priority"
        name="priority"
        required
        defaultValue="NORMAL"
        options={priorityOptions}
        error={state.fieldErrors?.priority}
      />

      <div className="flex items-center gap-2">
        <input
          id="isPinned"
          name="isPinned"
          type="checkbox"
          className="h-4 w-4 rounded border-line text-turquoise focus:ring-turquoise"
        />
        <label htmlFor="isPinned" className="text-sm text-ink">
          Pin this announcement to the top
        </label>
      </div>

      <FormField
        label="Expires At (optional)"
        name="expiresAt"
        type="date"
        placeholder="Leave blank for no expiry"
      />

      <Button type="submit" disabled={isPending}>
        {isPending ? "Publishing..." : "Publish Announcement"}
      </Button>
    </form>
  );
}

export function AnnouncementEditForm({
  schemeId,
  announcementId,
  defaults,
}: {
  schemeId: string;
  announcementId: string;
  defaults: {
    title: string;
    body: string;
    priority: string;
    isPinned: boolean;
    expiresAt?: string | null;
  };
}) {
  const action = updateAnnouncementAction.bind(null, schemeId, announcementId);
  const [state, formAction, isPending] = useActionState<
    AnnouncementFormState,
    FormData
  >(action, {});

  const expiresDate = defaults.expiresAt
    ? new Date(defaults.expiresAt).toISOString().split("T")[0]
    : "";

  return (
    <form action={formAction} className="space-y-4">
      {state.error && (
        <div className="rounded-[var(--radius-card)] bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {state.error}
        </div>
      )}

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
          Body
          <span className="text-red-500 ml-0.5">*</span>
        </label>
        <textarea
          id="body"
          name="body"
          required
          rows={6}
          defaultValue={defaults.body}
          className="w-full rounded-[var(--radius-card)] border border-line bg-white px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-turquoise focus:border-turquoise transition-colors resize-y"
        />
        {state.fieldErrors?.body && (
          <p className="mt-1.5 text-xs text-red-500">
            {state.fieldErrors.body}
          </p>
        )}
      </div>

      <SelectField
        label="Priority"
        name="priority"
        required
        defaultValue={defaults.priority}
        options={priorityOptions}
        error={state.fieldErrors?.priority}
      />

      <div className="flex items-center gap-2">
        <input
          id="isPinned"
          name="isPinned"
          type="checkbox"
          defaultChecked={defaults.isPinned}
          className="h-4 w-4 rounded border-line text-turquoise focus:ring-turquoise"
        />
        <label htmlFor="isPinned" className="text-sm text-ink">
          Pin this announcement to the top
        </label>
      </div>

      <FormField
        label="Expires At (optional)"
        name="expiresAt"
        type="date"
        defaultValue={expiresDate}
      />

      <Button type="submit" disabled={isPending}>
        {isPending ? "Saving..." : "Save Changes"}
      </Button>
    </form>
  );
}
