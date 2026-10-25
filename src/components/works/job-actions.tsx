"use client";

/**
 * A contractor's actions on a marketplace job (works stage 3, 25 Oct 2026):
 * express interest, decline an invitation, quote (with an optional PDF), or
 * withdraw a quote.
 */
import { startTransition, useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { stageUpload } from "@/lib/storage/client-upload";
import {
  declineJobInvitationAction,
  setJobInterestAction,
  submitJobQuoteAction,
  withdrawJobQuoteAction,
  type WorksFormState,
} from "@/lib/actions/works-marketplace";

const field = "w-full rounded-[var(--radius-card)] border border-line bg-white px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-turquoise";

function Message({ state }: { state: WorksFormState }) {
  if (state.error) return <p className="text-sm text-red-600" role="alert">{state.error}</p>;
  if (state.done) return <p className="text-sm text-emerald-700" role="status">{state.done}</p>;
  return null;
}

export function InterestButton({ rfqId, interested }: { rfqId: string; interested: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [state, setState] = useState<WorksFormState>({});
  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant={interested ? "ghost" : "primary"}
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await setJobInterestAction(rfqId, !interested);
            setState(r);
            if (r.done) router.refresh();
          })
        }
      >
        {pending ? "Saving..." : interested ? "Withdraw my interest" : "I'm interested in quoting"}
      </Button>
      <Message state={state} />
    </div>
  );
}

export function DeclineInvitation({ rfqId }: { rfqId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<WorksFormState, FormData>(async (prev, fd) => {
    const r = await declineJobInvitationAction(rfqId, prev, fd);
    if (r.done) router.refresh();
    return r;
  }, {});
  if (!open) return <Button type="button" variant="ghost" onClick={() => setOpen(true)}>I cannot quote for this</Button>;
  return (
    <form action={formAction} className="space-y-2">
      <label htmlFor="decline-reason" className="block text-sm text-ink">Why not? <span className="text-ink-muted">(optional, the building is told)</span></label>
      <input id="decline-reason" name="reason" maxLength={2000} className={field} />
      <Message state={state} />
      <div className="flex gap-2">
        <Button type="submit" variant="danger" disabled={pending}>{pending ? "Saving..." : "Decline the invitation"}</Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Back</Button>
      </div>
    </form>
  );
}

export interface QuoteDefaults {
  total: number;
  gst: number;
  validUntil: string | null;
  durationDays: number | null;
  inclusions: string;
  exclusions: string;
  conditions: string;
  documentName: string | null;
}

export function QuoteForm({ rfqId, schemeId, current }: { rfqId: string; schemeId: string; current: QuoteDefaults | null }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [state, formAction, pending] = useActionState<WorksFormState, FormData>(async (prev, fd) => {
    const r = await submitJobQuoteAction(rfqId, prev, fd);
    if (r.done) router.refresh();
    return r;
  }, {});

  async function submit(fd: FormData) {
    setFileError(null);
    fd.delete("document");
    if (file) {
      setUploading(true);
      const staged = await stageUpload(schemeId, "works_quote", file);
      setUploading(false);
      if ("error" in staged) {
        setFileError(staged.error);
        return;
      }
      fd.set("uploadId", staged.uploadId);
    }
    startTransition(() => formAction(fd));
  }
  const err = state.fieldErrors ?? {};
  return (
    <form action={submit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="q-total" className="block text-sm font-medium text-ink mb-1.5">Total, including GST ($)<span className="text-red-500 ml-0.5">*</span></label>
          <input id="q-total" name="total" required inputMode="decimal" defaultValue={current ? String(current.total) : ""} className={field} />
          {err.total && <p className="mt-1 text-xs text-red-500">{err.total}</p>}
        </div>
        <div>
          <label htmlFor="q-gst" className="block text-sm font-medium text-ink mb-1.5">Of which GST ($)</label>
          <input id="q-gst" name="gst" inputMode="decimal" defaultValue={current ? String(current.gst) : ""} placeholder="0 if not registered" className={field} />
          {err.gst && <p className="mt-1 text-xs text-red-500">{err.gst}</p>}
        </div>
        <div>
          <label htmlFor="q-days" className="block text-sm font-medium text-ink mb-1.5">Days to do the work</label>
          <input id="q-days" name="durationDays" inputMode="numeric" defaultValue={current?.durationDays ?? ""} className={field} />
          {err.durationDays && <p className="mt-1 text-xs text-red-500">{err.durationDays}</p>}
        </div>
        <div>
          <label htmlFor="q-valid" className="block text-sm font-medium text-ink mb-1.5">Quote valid until</label>
          <input id="q-valid" name="validUntil" type="date" defaultValue={current?.validUntil ?? ""} className={field} />
          {err.validUntil && <p className="mt-1 text-xs text-red-500">{err.validUntil}</p>}
        </div>
      </div>
      <div>
        <label htmlFor="q-inc" className="block text-sm font-medium text-ink mb-1.5">What the price includes</label>
        <textarea id="q-inc" name="inclusions" rows={3} maxLength={5000} defaultValue={current?.inclusions ?? ""} className={field} />
      </div>
      <div>
        <label htmlFor="q-exc" className="block text-sm font-medium text-ink mb-1.5">What it does not include</label>
        <textarea id="q-exc" name="exclusions" rows={2} maxLength={5000} defaultValue={current?.exclusions ?? ""} className={field} />
      </div>
      <div>
        <label htmlFor="q-cond" className="block text-sm font-medium text-ink mb-1.5">Conditions</label>
        <textarea id="q-cond" name="conditions" rows={2} maxLength={5000} defaultValue={current?.conditions ?? ""} placeholder="e.g. Access to the plant room needed" className={field} />
      </div>
      <div>
        <label htmlFor="q-doc" className="block text-sm font-medium text-ink mb-1.5">Your quote document <span className="font-normal text-ink-muted">(optional, PDF, JPEG or PNG, up to 20MB)</span></label>
        {current?.documentName && <p className="text-xs text-ink-muted mb-1">Attached: {current.documentName}. Choose a file to replace it.</p>}
        <input id="q-doc" name="document" type="file" accept="application/pdf,image/jpeg,image/png" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full text-sm text-ink file:mr-3 file:rounded-full file:border-0 file:bg-muted file:px-4 file:py-2 file:text-sm file:font-medium" />
        {(fileError || err.photos) && <p className="mt-1 text-xs text-red-500">{fileError ?? err.photos}</p>}
      </div>
      <Message state={state} />
      <Button type="submit" disabled={pending || uploading}>{uploading ? "Uploading..." : pending ? "Saving..." : current ? "Update my quote" : "Submit my quote"}</Button>
      <p className="text-xs text-ink-muted">You can change your quote until quotes close. The committee sees every quote side by side after that.</p>
    </form>
  );
}

export function WithdrawQuote({ rfqId }: { rfqId: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  const [state, setState] = useState<WorksFormState>({});
  if (!confirm) return <Button type="button" variant="ghost" onClick={() => setConfirm(true)}>Withdraw my quote</Button>;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-ink">Withdraw it? You can quote again before quotes close.</span>
      <Button
        type="button"
        variant="danger"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await withdrawJobQuoteAction(rfqId);
            setState(r);
            if (r.done) router.refresh();
          })
        }
      >
        {pending ? "Withdrawing..." : "Yes, withdraw"}
      </Button>
      <Button type="button" variant="ghost" onClick={() => setConfirm(false)}>Keep it</Button>
      <Message state={state} />
    </div>
  );
}
