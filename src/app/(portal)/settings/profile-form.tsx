"use client";

import { useActionState } from "react";
import { updateProfileAction, type ProfileFormState } from "./actions";
import { FormField } from "@/components/ui/form-field";

export function ProfileForm({
  profile,
}: {
  profile: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
  };
}) {
  const [state, formAction, isPending] = useActionState<
    ProfileFormState,
    FormData
  >(updateProfileAction, {});

  return (
    <form action={formAction} className="space-y-5">
      {state.error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {state.error}
        </div>
      )}
      {state.success && (
        <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
          Profile updated successfully.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <FormField
          label="First name"
          name="firstName"
          required
          defaultValue={profile.firstName}
          error={state.fieldErrors?.firstName}
        />
        <FormField
          label="Last name"
          name="lastName"
          required
          defaultValue={profile.lastName}
          error={state.fieldErrors?.lastName}
        />
      </div>

      <FormField
        label="Email"
        name="email"
        type="email"
        defaultValue={profile.email}
        helpText="Email cannot be changed here."
        className="opacity-60 pointer-events-none"
      />

      <FormField
        label="Phone"
        name="phone"
        type="tel"
        defaultValue={profile.phone ?? ""}
        placeholder="e.g. 0400 000 000"
      />

      <div className="pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center justify-center rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-400 disabled:opacity-50 transition-colors"
        >
          {isPending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
