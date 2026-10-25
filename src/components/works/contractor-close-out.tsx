"use client";

/**
 * A contractor finishing a job (works stage 4, 25 Oct 2026): report it
 * done with a note and photos, then invoice it with their tax invoice.
 */
import { startTransition, useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { stageUpload } from "@/lib/storage/client-upload";
import { reportCompletionAction, submitWorksInvoiceAction } from "@/lib/actions/works-completion";
import type { WorksFormState } from "@/lib/actions/works-marketplace";

const field = "w-full rounded-[var(--radius-card)] border border-line bg-white px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-turquoise";
const fileField = "block w-full text-sm text-ink file:mr-3 file:rounded-full file:border-0 file:bg-muted file:px-4 file:py-2 file:text-sm file:font-medium";
const PHOTOS_MAX = 6;

function Message({ state }: { state: WorksFormState }) {
  if (state.error) return <p className="text-sm text-red-600" role="alert">{state.error}</p>;
  if (state.done) return <p className="text-sm text-emerald-700" role="status">{state.done}</p>;
  return null;
}

function FieldError({ text }: { text?: string | null }) {
  return text ? <p className="mt-1 text-xs text-red-500">{text}</p> : null;
}

export function ReportDoneForm({ workOrderId, schemeId, today }: { workOrderId: string; schemeId: string; today: string }) {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [state, formAction, pending] = useActionState<WorksFormState, FormData>(async (prev, fd) => {
    const r = await reportCompletionAction(workOrderId, prev, fd);
    if (r.done) router.refresh();
    return r;
  }, {});

  async function submit(fd: FormData) {
    setFileError(null);
    fd.delete("photos");
    if (files.length > PHOTOS_MAX) {
      setFileError(`Add up to ${PHOTOS_MAX} photos.`);
      return;
    }
    setUploading(true);
    for (const file of files) {
      const staged = await stageUpload(schemeId, "works_completion", file);
      if ("error" in staged) {
        setUploading(false);
        setFileError(`${file.name}: ${staged.error}`);
        return;
      }
      fd.append("photoUploadId", staged.uploadId);
    }
    setUploading(false);
    startTransition(() => formAction(fd));
  }
  const err = state.fieldErrors ?? {};
  return (
    <form action={submit} className="space-y-4">
      <div>
        <label htmlFor="c-summary" className="block text-sm font-medium text-ink mb-1.5">What was done<span className="text-red-500 ml-0.5">*</span></label>
        <textarea id="c-summary" name="summary" required rows={4} maxLength={5000} placeholder="e.g. Replaced the burst section of pipe under the basement stairs and tested for leaks." className={field} />
        <FieldError text={err.summary} />
      </div>
      <div className="max-w-xs">
        <label htmlFor="c-date" className="block text-sm font-medium text-ink mb-1.5">Date finished<span className="text-red-500 ml-0.5">*</span></label>
        <input id="c-date" name="completedOn" type="date" required max={today} defaultValue={today} className={field} />
        <FieldError text={err.completedOn} />
      </div>
      <div>
        <label htmlFor="c-photos" className="block text-sm font-medium text-ink mb-1.5">Photos of the finished work <span className="font-normal text-ink-muted">(optional, up to {PHOTOS_MAX}, JPEG, PNG or WebP)</span></label>
        <input id="c-photos" name="photos" type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} className={fileField} />
        <FieldError text={fileError ?? err.photos} />
      </div>
      <Message state={state} />
      <Button type="submit" disabled={pending || uploading}>{uploading ? "Uploading photos..." : pending ? "Sending..." : "Report the job done"}</Button>
      <p className="text-xs text-ink-muted">The building checks the work and confirms it. You can send your invoice straight after reporting it done.</p>
    </form>
  );
}

const dollars = (n: number) => `$${n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function WorksInvoiceForm({ workOrderId, schemeId, today, amountLimit, gstRegistered }: { workOrderId: string; schemeId: string; today: string; amountLimit: number | null; gstRegistered: boolean }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [total, setTotal] = useState("");
  const [uploading, setUploading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [state, formAction, pending] = useActionState<WorksFormState, FormData>(async (prev, fd) => {
    const r = await submitWorksInvoiceAction(workOrderId, prev, fd);
    if (r.done) router.refresh();
    return r;
  }, {});
  const totalNumber = Number(total.replace(/[$,\s]/g, ""));
  const over = amountLimit != null && Number.isFinite(totalNumber) && Math.round(totalNumber * 100) > Math.round(amountLimit * 100);

  async function submit(fd: FormData) {
    setFileError(null);
    fd.delete("document");
    if (!file) {
      setFileError("Attach your tax invoice (PDF or a photo of it).");
      return;
    }
    setUploading(true);
    const staged = await stageUpload(schemeId, "works_invoice", file);
    setUploading(false);
    if ("error" in staged) {
      setFileError(staged.error);
      return;
    }
    fd.set("uploadId", staged.uploadId);
    startTransition(() => formAction(fd));
  }
  const err = state.fieldErrors ?? {};
  return (
    <form action={submit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="i-number" className="block text-sm font-medium text-ink mb-1.5">Invoice number<span className="text-red-500 ml-0.5">*</span></label>
          <input id="i-number" name="invoiceNumber" required maxLength={50} className={field} />
          <FieldError text={err.invoiceNumber} />
        </div>
        <div>
          <label htmlFor="i-date" className="block text-sm font-medium text-ink mb-1.5">Invoice date<span className="text-red-500 ml-0.5">*</span></label>
          <input id="i-date" name="invoiceDate" type="date" required max={today} defaultValue={today} className={field} />
          <FieldError text={err.invoiceDate} />
        </div>
        <div>
          <label htmlFor="i-total" className="block text-sm font-medium text-ink mb-1.5">Total{gstRegistered ? ", including GST" : ""} ($)<span className="text-red-500 ml-0.5">*</span></label>
          <input id="i-total" name="total" required inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} className={field} />
          <FieldError text={err.total} />
        </div>
        {gstRegistered ? (
          <div>
            <label htmlFor="i-gst" className="block text-sm font-medium text-ink mb-1.5">Of which GST ($)</label>
            <input id="i-gst" name="gst" inputMode="decimal" placeholder="0" className={field} />
            <FieldError text={err.gst} />
          </div>
        ) : (
          <input type="hidden" name="gst" value="0" />
        )}
        <div>
          <label htmlFor="i-due" className="block text-sm font-medium text-ink mb-1.5">Due date <span className="font-normal text-ink-muted">(optional, 30 days if blank)</span></label>
          <input id="i-due" name="dueDate" type="date" className={field} />
          <FieldError text={err.dueDate} />
        </div>
      </div>
      {amountLimit != null && <p className="text-sm text-ink-muted">The work order allows up to {dollars(amountLimit)}.</p>}
      {over && (
        <div>
          <label htmlFor="i-excess" className="block text-sm font-medium text-ink mb-1.5">Why is it more than the work order allowed?<span className="text-red-500 ml-0.5">*</span></label>
          <textarea id="i-excess" name="excessReason" required rows={3} maxLength={2000} placeholder="e.g. The pipe behind the wall was also corroded. I rang the committee on 12 October before replacing it." className={field} />
          <p className="mt-1 text-xs text-ink-muted">The committee votes on whether to agree the extra before the invoice can be paid.</p>
          <FieldError text={err.excessReason} />
        </div>
      )}
      <div>
        <label htmlFor="i-doc" className="block text-sm font-medium text-ink mb-1.5">Your tax invoice<span className="text-red-500 ml-0.5">*</span> <span className="font-normal text-ink-muted">(PDF, JPEG or PNG, up to 20MB)</span></label>
        <input id="i-doc" name="document" type="file" required accept="application/pdf,image/jpeg,image/png" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className={fileField} />
        <FieldError text={fileError ?? err.document} />
      </div>
      {!gstRegistered && <p className="text-xs text-ink-muted">Your business is not registered for GST on StrataVerze, so the invoice has no GST. If it is registered, update your business details first.</p>}
      <Message state={state} />
      <Button type="submit" disabled={pending || uploading}>{uploading ? "Uploading..." : pending ? "Sending..." : "Send the invoice"}</Button>
    </form>
  );
}
