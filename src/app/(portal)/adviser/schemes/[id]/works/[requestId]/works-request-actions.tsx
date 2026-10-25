"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  submitWorksRequest,
  assignWorksRequest,
  type ActionResult,
} from "@/lib/actions/works";

/* ------------------------------------------------------------------ */
/*  Submit (DRAFT → SUBMITTED)                                        */
/* ------------------------------------------------------------------ */
function SubmitAction({
  requestId,
  schemeId,
}: {
  requestId: string;
  schemeId: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setPending(true);
    setError(null);
    const result = await submitWorksRequest(requestId, schemeId);
    setPending(false);
    if (result.error) {
      setError(result.error);
    } else {
      router.refresh();
    }
  }

  return (
    <div>
      {error && (
        <p className="text-sm text-red-600 mb-2">{error}</p>
      )}
      <Button onClick={handleSubmit} disabled={pending}>
        {pending ? "Submitting..." : "Submit for Review"}
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Assign                                                             */
/* ------------------------------------------------------------------ */
function AssignAction({
  requestId,
  schemeId,
  members,
}: {
  requestId: string;
  schemeId: string;
  members: { id: string; firstName: string; lastName: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState<ActionResult, FormData>(
    async (_prev: ActionResult, formData: FormData) => assignWorksRequest(formData),
    { error: null },
  );

  useEffect(() => {
    if (state.success) {
      queueMicrotask(() => {
        setOpen(false);
        router.refresh();
      });
    }
  }, [state.success, router]);

  if (!open) {
    return (
      <Button variant="ghost" onClick={() => setOpen(true)}>
        Assign
      </Button>
    );
  }

  return (
    <form
      action={formAction}
      className="rounded-[var(--radius-card)] border border-line bg-white p-4 space-y-3"
    >
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="schemeId" value={schemeId} />

      {state.error && (
        <p className="text-sm text-red-600">{state.error}</p>
      )}

      <div>
        <label
          htmlFor="assignedToId"
          className="block text-xs font-medium text-ink-muted mb-1"
        >
          Assign To
        </label>
        <select
          id="assignedToId"
          name="assignedToId"
          required
          className="rounded-[var(--radius-card)] border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-turquoise w-full"
        >
          <option value="">Select a member</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.firstName} {m.lastName}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Assigning..." : "Assign"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => setOpen(false)}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/*  Main actions bar                                                   */
/* ------------------------------------------------------------------ */
export function WorksRequestActions({
  requestId,
  schemeId,
  status,
  members,
}: {
  requestId: string;
  schemeId: string;
  status: string;
  members: { id: string; firstName: string; lastName: string }[];
}) {
  return (
    <div className="flex flex-wrap items-start gap-3">
      {status === "DRAFT" && (
        <SubmitAction requestId={requestId} schemeId={schemeId} />
      )}
      {members.length > 0 && (
        <AssignAction
          requestId={requestId}
          schemeId={schemeId}
          members={members}
        />
      )}
    </div>
  );
}
