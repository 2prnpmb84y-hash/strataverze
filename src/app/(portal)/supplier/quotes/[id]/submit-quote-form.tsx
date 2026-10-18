"use client";

import { useActionState } from "react";
import { submitQuoteAction } from "./actions";

export function SubmitQuoteForm({
  quoteRequestId,
}: {
  quoteRequestId: string;
}) {
  const [state, formAction, pending] = useActionState(
    (_prev: { error?: string }, formData: FormData) =>
      submitQuoteAction(quoteRequestId, formData),
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.error && (
        <div className="rounded-[var(--radius-card)] bg-danger/10 px-4 py-3 text-sm text-danger">
          {state.error}
        </div>
      )}

      <div>
        <label
          htmlFor="amount"
          className="block text-sm font-medium text-ink mb-1"
        >
          Amount (AUD) <span className="text-danger">*</span>
        </label>
        <input
          id="amount"
          name="amount"
          type="number"
          step="0.01"
          min="0.01"
          required
          className="w-full rounded-[var(--radius-card)] border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-supplier"
          placeholder="0.00"
        />
      </div>

      <div>
        <label
          htmlFor="description"
          className="block text-sm font-medium text-ink mb-1"
        >
          Description <span className="text-danger">*</span>
        </label>
        <textarea
          id="description"
          name="description"
          required
          rows={3}
          className="w-full rounded-[var(--radius-card)] border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-supplier"
          placeholder="Describe the work you would carry out..."
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label
            htmlFor="estimatedDays"
            className="block text-sm font-medium text-ink mb-1"
          >
            Estimated Days
          </label>
          <input
            id="estimatedDays"
            name="estimatedDays"
            type="number"
            min="1"
            step="1"
            className="w-full rounded-[var(--radius-card)] border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-supplier"
            placeholder="e.g. 5"
          />
        </div>

        <div>
          <label
            htmlFor="validUntil"
            className="block text-sm font-medium text-ink mb-1"
          >
            Valid Until
          </label>
          <input
            id="validUntil"
            name="validUntil"
            type="date"
            className="w-full rounded-[var(--radius-card)] border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-supplier"
          />
        </div>
      </div>

      <div>
        <label
          htmlFor="notes"
          className="block text-sm font-medium text-ink mb-1"
        >
          Notes
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={2}
          className="w-full rounded-[var(--radius-card)] border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-supplier"
          placeholder="Any additional notes or conditions..."
        />
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="rounded-[var(--radius-card)] bg-supplier px-4 py-2 text-sm font-medium text-white hover:bg-supplier/90 transition-colors disabled:opacity-50"
        >
          {pending ? "Submitting..." : "Submit Quote"}
        </button>
      </div>
    </form>
  );
}
