"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { FormField, SelectField } from "@/components/ui/form-field";
import { sendInvitationAction, type InvitationFormState } from "./actions";

const roleOptions = [
  { value: "OWNER", label: "Owner" },
  { value: "COMMITTEE", label: "Committee Member" },
];

/**
 * The invitation form. It only collects the fields: every check (who may
 * invite, the address, the role, that the lot is this building's, the rate
 * limits) is made by sendInvitationAction on the server.
 */
export function InviteForm({ schemeId, lots }: { schemeId: string; lots: { value: string; label: string }[] }) {
  const action = sendInvitationAction.bind(null, schemeId);
  const [role, setRole] = useState("OWNER");

  const [state, formAction, isPending] = useActionState<
    InvitationFormState,
    FormData
  >(action, {});

  const lotOptions = [
    { value: "", label: role === "OWNER" ? "Choose a lot" : "No lot" },
    ...lots,
  ];

  return (
    <form action={formAction} className="space-y-4">
      {state.error && (
        <div role="alert" className="rounded-[var(--radius-card)] bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {state.error}
        </div>
      )}

      {state.success && (
        <div role="status" className="rounded-[var(--radius-card)] bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
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
        value={role}
        onChange={(e) => setRole(e.target.value)}
        options={roleOptions}
        error={state.fieldErrors?.role}
      />

      <SelectField
        label="Lot"
        name="lotId"
        required={role === "OWNER"}
        options={lotOptions}
        error={state.fieldErrors?.lotId}
        helpText={role === "OWNER" ? "The lot this person owns." : "Optional: the lot this committee member owns."}
      />

      <Button type="submit" disabled={isPending}>
        {isPending ? "Sending..." : "Send Invitation"}
      </Button>
    </form>
  );
}
