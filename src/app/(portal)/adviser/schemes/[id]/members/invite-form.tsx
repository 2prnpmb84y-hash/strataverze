"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FormField, SelectField } from "@/components/ui/form-field";
import { sendInvitationAction, type InvitationFormState } from "./actions";

const roleOptions = [
  { value: "OWNER", label: "Owner" },
  { value: "COMMITTEE", label: "Committee Member" },
];

export function InviteForm({ schemeId }: { schemeId: string }) {
  const action = sendInvitationAction.bind(null, schemeId);

  const [state, formAction, isPending] = useActionState<
    InvitationFormState,
    FormData
  >(action, {});

  return (
    <form action={formAction} className="space-y-4">
      {state.error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {state.error}
        </div>
      )}

      {state.success && (
        <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
          {state.success}
        </div>
      )}

      <FormField
        label="Email Address"
        name="email"
        type="email"
        required
        placeholder="owner@example.com"
        error={state.fieldErrors?.email}
      />

      <SelectField
        label="Role"
        name="role"
        required
        options={roleOptions}
        error={state.fieldErrors?.role}
      />

      <Button type="submit" disabled={isPending}>
        {isPending ? "Sending..." : "Send Invitation"}
      </Button>
    </form>
  );
}
