"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FormField, SelectField } from "@/components/ui/form-field";
import {
  createContactAction,
  updateContactAction,
  type ContactFormState,
} from "./actions";

const categoryOptions = [
  { value: "PLUMBER", label: "Plumber" },
  { value: "ELECTRICIAN", label: "Electrician" },
  { value: "BUILDER", label: "Builder" },
  { value: "GARDENER", label: "Gardener / Landscaper" },
  { value: "CLEANER", label: "Cleaner" },
  { value: "LOCKSMITH", label: "Locksmith" },
  { value: "PEST_CONTROL", label: "Pest Control" },
  { value: "FIRE_SAFETY", label: "Fire Safety" },
  { value: "LIFT", label: "Lift / Elevator" },
  { value: "POOL", label: "Pool Maintenance" },
  { value: "BODY_CORPORATE", label: "Body Corporate" },
  { value: "LEGAL", label: "Legal" },
  { value: "ACCOUNTING", label: "Accounting" },
  { value: "INSURANCE_BROKER", label: "Insurance Broker" },
  { value: "OTHER", label: "Other" },
];

export function ContactForm({ schemeId }: { schemeId: string }) {
  const action = createContactAction.bind(null, schemeId);
  const [state, formAction, isPending] = useActionState<
    ContactFormState,
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
        label="Contact Name"
        name="name"
        required
        placeholder="e.g. John Smith"
        error={state.fieldErrors?.name}
      />

      <FormField
        label="Company"
        name="company"
        placeholder="e.g. Smith Plumbing Pty Ltd"
      />

      <SelectField
        label="Category"
        name="category"
        required
        defaultValue="PLUMBER"
        options={categoryOptions}
        error={state.fieldErrors?.category}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField
          label="Phone"
          name="phone"
          type="tel"
          placeholder="e.g. 0412 345 678"
        />
        <FormField
          label="Email"
          name="email"
          type="email"
          placeholder="e.g. john@smithplumbing.com.au"
          error={state.fieldErrors?.email}
        />
      </div>

      <FormField
        label="Address"
        name="address"
        placeholder="Business address (optional)"
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
          placeholder="Optional notes about this contact..."
          className="w-full rounded-[var(--radius-card)] border border-line bg-white px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-turquoise focus:border-turquoise transition-colors resize-y"
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          name="isPreferred"
          className="rounded border-line text-primary-600 focus:ring-turquoise"
        />
        Preferred contractor
      </label>

      <Button type="submit" variant="primary" disabled={isPending}>
        {isPending ? "Creating..." : "Create Contact"}
      </Button>
    </form>
  );
}

export function ContactEditForm({
  schemeId,
  contactId,
  defaults,
}: {
  schemeId: string;
  contactId: string;
  defaults: {
    name: string;
    company: string | null;
    category: string;
    phone: string | null;
    email: string | null;
    address: string | null;
    notes: string | null;
    isPreferred: boolean;
  };
}) {
  const action = updateContactAction.bind(null, schemeId, contactId);
  const [state, formAction, isPending] = useActionState<
    ContactFormState,
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
        label="Contact Name"
        name="name"
        required
        defaultValue={defaults.name}
        error={state.fieldErrors?.name}
      />

      <FormField
        label="Company"
        name="company"
        defaultValue={defaults.company ?? ""}
        placeholder="e.g. Smith Plumbing Pty Ltd"
      />

      <SelectField
        label="Category"
        name="category"
        required
        defaultValue={defaults.category}
        options={categoryOptions}
        error={state.fieldErrors?.category}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField
          label="Phone"
          name="phone"
          type="tel"
          defaultValue={defaults.phone ?? ""}
          placeholder="e.g. 0412 345 678"
        />
        <FormField
          label="Email"
          name="email"
          type="email"
          defaultValue={defaults.email ?? ""}
          placeholder="e.g. john@smithplumbing.com.au"
          error={state.fieldErrors?.email}
        />
      </div>

      <FormField
        label="Address"
        name="address"
        defaultValue={defaults.address ?? ""}
        placeholder="Business address (optional)"
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
          placeholder="Optional notes about this contact..."
          className="w-full rounded-[var(--radius-card)] border border-line bg-white px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-turquoise focus:border-turquoise transition-colors resize-y"
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          name="isPreferred"
          defaultChecked={defaults.isPreferred}
          className="rounded border-line text-primary-600 focus:ring-turquoise"
        />
        Preferred contractor
      </label>

      <Button type="submit" variant="primary" disabled={isPending}>
        {isPending ? "Saving..." : "Save Changes"}
      </Button>
    </form>
  );
}
