"use client";

/** The contractor accepts or declines an urgent work order (works stage 2, 25 Oct 2026). */
import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { respondToWorkOrderAction, type WorksFormState } from "@/lib/actions/works-marketplace";

export function OrderAnswer({ workOrderId }: { workOrderId: string }) {
  const router = useRouter();
  const [declining, setDeclining] = useState(false);
  const [state, formAction, isPending] = useActionState<WorksFormState, FormData>(async (prev, fd) => {
    const r = await respondToWorkOrderAction(workOrderId, prev, fd);
    if (r.done) router.refresh();
    return r;
  }, {});
  if (state.done) return <p className="text-sm text-emerald-700" role="status">{state.done}</p>;
  return (
    <div className="space-y-3">
      {state.error && <p className="text-sm text-red-600" role="alert">{state.error}</p>}
      {!declining ? (
        <form action={formAction} className="flex flex-wrap gap-3">
          <Button type="submit" name="answer" value="ACCEPT" disabled={isPending}>{isPending ? "Saving..." : "Accept the job"}</Button>
          <Button type="button" variant="danger" onClick={() => setDeclining(true)} disabled={isPending}>I cannot take it</Button>
        </form>
      ) : (
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="answer" value="DECLINE" />
          <label htmlFor="reason" className="block text-sm font-medium text-ink">Why can you not take it?<span className="text-red-500 ml-0.5">*</span></label>
          <textarea id="reason" name="reason" rows={3} required maxLength={2000} className="w-full rounded-[var(--radius-card)] border border-line bg-white px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-turquoise" placeholder="e.g. No one free until Thursday. The building is told, so it can arrange someone else." />
          <div className="flex flex-wrap gap-3">
            <Button type="submit" variant="danger" disabled={isPending}>{isPending ? "Saving..." : "Decline the job"}</Button>
            <Button type="button" variant="ghost" onClick={() => setDeclining(false)}>Back</Button>
          </div>
        </form>
      )}
    </div>
  );
}
