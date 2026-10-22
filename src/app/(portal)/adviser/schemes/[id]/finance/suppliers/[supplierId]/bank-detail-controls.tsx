"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  changeSupplierBankDetailsAction,
  verifySupplierBankDetailsAction,
  type ControlActionState,
} from "@/lib/actions/payment-controls";

const field =
  "w-full rounded-[var(--radius-card)] border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-turquoise";

function Message({ state }: { state: ControlActionState }) {
  if (state.error) return <p role="alert" className="text-sm text-red-600">{state.error}</p>;
  if (state.success) return <p className="text-sm text-green-700">{state.success}</p>;
  return null;
}

/** Change a supplier's bank details. Payments stop until someone else verifies them. */
export function BankChangeForm({ schemeId, supplierId }: { schemeId: string; supplierId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(changeSupplierBankDetailsAction.bind(null, schemeId, supplierId), {});
  if (!open) {
    return (
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        Change bank details
      </Button>
    );
  }
  return (
    <form action={action} className="space-y-3 rounded-[var(--radius-card)] border border-line p-4">
      <p className="text-sm text-ink-muted">
        Confirm new details with the supplier on a number you already hold, never one given in the same email as the change.
        Payments to this supplier stop until someone else verifies the change.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="text-sm">
          <span className="block mb-1 font-medium">BSB</span>
          <input name="bankBsb" required placeholder="000-000" className={field} />
        </label>
        <label className="text-sm">
          <span className="block mb-1 font-medium">Account number</span>
          <input name="bankAccountNumber" required inputMode="numeric" className={field} />
        </label>
        <label className="text-sm">
          <span className="block mb-1 font-medium">Account name</span>
          <input name="bankAccountName" required className={field} />
        </label>
      </div>
      <Message state={state} />
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : "Save new bank details"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/** Verify or reject a pending bank detail change, or give the second verification. */
export function VerifyBankChangeForm({
  schemeId,
  versionId,
  slot,
}: {
  schemeId: string;
  versionId: string;
  slot: "FIRST" | "SECOND";
}) {
  const [state, action, pending] = useActionState(verifySupplierBankDetailsAction.bind(null, schemeId, versionId), {});
  const [rejecting, setRejecting] = useState(false);
  return (
    <form action={action} className="space-y-3">
      {rejecting ? (
        <>
          <input type="hidden" name="decision" value="REJECT" />
          <label className="block text-sm">
            <span className="block mb-1 font-medium">Why are you rejecting this change?</span>
            <input name="reason" required className={field} />
          </label>
        </>
      ) : (
        <>
          <input type="hidden" name="decision" value="VERIFY" />
          <label className="block text-sm">
            <span className="block mb-1 font-medium">How did you verify the new details?</span>
            <select name="method" required className={field} defaultValue="">
              <option value="" disabled>
                Choose a method
              </option>
              <option value="CALLBACK">Called the supplier on a number already on file</option>
              <option value="SUPPLIER_PORTAL_CONFIRMED">Supplier confirmed in the supplier portal</option>
              <option value="DOCUMENT">Document from the supplier (bank letter or statement)</option>
            </select>
          </label>
        </>
      )}
      <Message state={state} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant={rejecting ? "danger" : "primary"} disabled={pending}>
          {pending ? "Saving..." : rejecting ? "Reject change" : slot === "FIRST" ? "Verify bank details" : "Give second verification"}
        </Button>
        {slot === "FIRST" && (
          <Button type="button" variant="secondary" onClick={() => setRejecting((r) => !r)}>
            {rejecting ? "Back" : "Reject instead"}
          </Button>
        )}
      </div>
    </form>
  );
}
