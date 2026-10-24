"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { updateRollOwnerNameAction, type RollOwnerNameState } from "./lot-workflow-actions";

/** The owner's name as it appears on the strata roll, editable in place. */
export function RollOwnerName({ schemeId, lotId, value }: { schemeId: string; lotId: string; value: string | null }) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, isPending] = useActionState<RollOwnerNameState, FormData>(
    updateRollOwnerNameAction.bind(null, schemeId, lotId),
    {},
  );

  // Close the editor once a save succeeds.
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state.saved) setEditing(false);
  }

  if (!editing) {
    return (
      <div className="col-span-2">
        <dt className="text-ink-muted text-xs mb-0.5">Owner name (strata roll)</dt>
        <dd className="mt-0.5 flex flex-wrap items-baseline justify-between gap-2">
          <span className="font-medium text-ink break-words min-w-0">{value || "Not recorded"}</span>
          <button type="button" onClick={() => setEditing(true)} className="text-sm font-medium text-turquoise hover:underline">
            Edit
          </button>
        </dd>
      </div>
    );
  }

  return (
    <div className="col-span-2">
      <form action={formAction}>
        <label htmlFor="rollOwnerName" className="block text-ink-muted text-xs">
          Owner name (strata roll)
        </label>
        <input
          id="rollOwnerName"
          name="rollOwnerName"
          defaultValue={value ?? ""}
          required
          maxLength={500}
          autoFocus
          className="mt-1 w-full rounded-[var(--radius-card)] border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-turquoise focus:border-turquoise"
        />
        <p className="mt-1 text-xs text-ink-muted">Exactly as it appears on the strata roll, for example joint owners, or a company with its ACN.</p>
        {state.error && <p className="mt-1 text-xs text-red-600">{state.error}</p>}
        <div className="mt-2 flex gap-2">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving..." : "Save"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
