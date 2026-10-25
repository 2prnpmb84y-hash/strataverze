"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserRoundPen, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { changeOwnerAction, type ChangeOwnerState } from "@/lib/actions/change-owner";
import { stageFormFile } from "@/lib/storage/client-upload";

const input = "w-full rounded-[var(--radius-card)] border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-turquoise";

/**
 * Change owner (25 Oct 2026): on the lot page, for the Adviser and the
 * committee. Records the new owner on the strata roll, ends the outgoing
 * owner's portal access and invites the new owner.
 */
export function ChangeOwnerButton({
  schemeId,
  lotId,
  lotLabel,
  currentOwner,
  today,
}: {
  schemeId: string;
  lotId: string;
  lotLabel: string;
  currentOwner: string | null;
  /** Sydney's date, yyyy-mm-dd: the latest settlement date allowed. */
  today: string;
}) {
  const [open, setOpen] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [staging, startStaging] = useTransition();
  const router = useRouter();
  const action = changeOwnerAction.bind(null, schemeId, lotId);
  const [state, formAction, saving] = useActionState<ChangeOwnerState, FormData>(action, {});
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) first.current?.focus();
  }, [open]);
  useEffect(() => {
    if (state.done) router.refresh();
  }, [state.done, router]);

  // The notice of transfer goes to storage first; the form then carries its upload id.
  const submit = (formData: FormData) =>
    startStaging(async () => {
      setUploadError(null);
      const problem = await stageFormFile(formData, schemeId, "committee_library", "notice");
      if (problem) return setUploadError(problem);
      // After an await, the action must be started in a transition again.
      startStaging(() => formAction(formData));
    });

  const busy = staging || saving;
  const err = state.fieldErrors ?? {};

  return (
    <>
      <Button variant="secondary" className="text-xs h-9 px-4" onClick={() => setOpen(true)}>
        <UserRoundPen size={14} />
        Change owner
      </Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="change-owner-title">
          <div className="absolute inset-0 bg-black/40" onClick={() => !busy && setOpen(false)} aria-hidden="true" />
          <div className="relative mx-4 max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-[var(--radius-card)] bg-white shadow-xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-white px-6 py-4">
              <h2 id="change-owner-title" className="font-heading text-lg font-semibold text-ink">Change owner, {lotLabel}</h2>
              <button type="button" onClick={() => setOpen(false)} disabled={busy} className="p-1 text-ink-muted hover:text-ink" aria-label="Close">
                <X size={18} />
              </button>
            </div>

            {state.done ? (
              <div className="space-y-4 px-6 py-5">
                <p role="status" className="text-sm text-[#1A7A63]">{state.done}</p>
                <Button onClick={() => setOpen(false)}>Done</Button>
              </div>
            ) : (
              <form action={submit} className="space-y-4 px-6 py-5">
                <p className="text-sm text-ink-muted">
                  Current owner on the roll: <span className="font-medium text-ink">{currentOwner || "none recorded"}</span>. Saving records the new owner, removes the outgoing owner&apos;s contact details from this lot, ends their portal access and any committee seat from the settlement date (unless they still own another lot here), and sends notices to the new owner.
                </p>

                <Field label="New owner's name, as it will appear on the strata roll" error={err.ownerName}>
                  <input ref={first} name="ownerName" required maxLength={500} className={input} />
                </Field>
                <Field label="Settlement date" error={err.settlementDate}>
                  <input type="date" name="settlementDate" required max={today} className={`${input} sm:w-48`} />
                </Field>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Email" error={err.email}>
                    <input type="email" name="email" maxLength={255} className={input} />
                  </Field>
                  <Field label="Mobile" error={err.mobile}>
                    <input type="tel" name="mobile" maxLength={40} className={input} />
                  </Field>
                  <Field label="Phone" error={err.phone}>
                    <input type="tel" name="phone" maxLength={40} className={input} />
                  </Field>
                  <Field label="Postal address" error={err.address}>
                    <input name="address" maxLength={500} className={input} />
                  </Field>
                </div>
                <Field label="Notice of transfer (optional, PDF or image)" error={err.notice ?? uploadError ?? undefined}>
                  <input type="file" name="notice" accept="application/pdf,image/png,image/jpeg" className="block w-full text-sm text-ink-muted" />
                  <span className="mt-1 block text-xs text-ink-muted">Filed in the document library, visible to the managers only.</span>
                </Field>
                <label className="flex items-start gap-2 text-sm text-ink">
                  <input type="checkbox" name="invite" defaultChecked className="mt-1" />
                  <span>Invite the new owner to StrataVerze by email (needs the email above)</span>
                </label>

                {state.error && <p role="alert" className="text-sm text-[#B33A3A]">{state.error}</p>}
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Record change of owner"}</Button>
                  <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
                </div>
                <p className="text-xs text-ink-muted">You may be asked for your authenticator code first.</p>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ink-muted">{label}</span>
      {children}
      {error && <span role="alert" className="mt-1 block text-xs text-[#B33A3A]">{error}</span>}
    </label>
  );
}
