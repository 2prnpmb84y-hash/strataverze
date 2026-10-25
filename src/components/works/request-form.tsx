"use client";

/**
 * Raise a works request, or change a returned one and send it again
 * (works marketplace stage 1, 25 Oct 2026). Photos go straight to storage
 * through one-time links; the form then sends their upload ids.
 */
import { startTransition, useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { stageUpload } from "@/lib/storage/client-upload";
import { Button } from "@/components/ui/button";
import { FormField, SelectField, TextareaField } from "@/components/ui/form-field";
import { WORKS_PHOTOS_MAX, WORKS_TRADES } from "@/config/works";
import { resubmitWorksRequestAction, submitWorksRequestAction, type WorksFormState } from "@/lib/actions/works-marketplace";

export interface RequestFormDefaults {
  title?: string;
  trade?: string | null;
  location?: string | null;
  description?: string;
  isEmergency?: boolean;
}

export function WorksRequestForm({
  schemeId,
  requestId,
  defaults = {},
  existingPhotos = 0,
  doneHref,
}: {
  schemeId: string;
  /** Set when changing a returned request. */
  requestId?: string;
  defaults?: RequestFormDefaults;
  existingPhotos?: number;
  /** Where to go once sent; the request's id is appended. */
  doneHref: string;
}) {
  const router = useRouter();
  const action = requestId ? resubmitWorksRequestAction.bind(null, schemeId, requestId) : submitWorksRequestAction.bind(null, schemeId);
  const [state, formAction, isPending] = useActionState<WorksFormState, FormData>(action, {});
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const room = Math.max(0, WORKS_PHOTOS_MAX - existingPhotos);

  useEffect(() => {
    if (state.done && state.requestId) router.push(`${doneHref}/${state.requestId}`);
  }, [state.done, state.requestId, doneHref, router]);

  function choose(list: FileList | null) {
    setPhotoError(null);
    const chosen = Array.from(list ?? []);
    if (chosen.length > room) {
      setPhotoError(`Choose up to ${room} photo${room === 1 ? "" : "s"}.`);
      setFiles(chosen.slice(0, room));
      return;
    }
    setFiles(chosen);
  }

  async function submit(formData: FormData) {
    setPhotoError(null);
    formData.delete("photos");
    if (files.length) {
      setUploading(true);
      for (const file of files) {
        const staged = await stageUpload(schemeId, "works_photo", file);
        if ("error" in staged) {
          setUploading(false);
          setPhotoError(`${file.name}: ${staged.error}`);
          return;
        }
        formData.append("photoUploadId", staged.uploadId);
      }
      setUploading(false);
    }
    startTransition(() => formAction(formData));
  }

  const busy = uploading || isPending;
  const trades = WORKS_TRADES.map((t) => ({ value: t, label: t }));

  return (
    <form action={submit} className="space-y-5">
      {state.error && <div className="rounded-[var(--radius-card)] bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700" role="alert">{state.error}</div>}
      {state.done && <div className="rounded-[var(--radius-card)] bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800" role="status">{state.done}</div>}

      <FormField label="What needs fixing" name="title" required defaultValue={defaults.title} placeholder="e.g. Water leaking from the ceiling in the car park" error={state.fieldErrors?.title} />

      <SelectField
        label="Kind of work"
        name="trade"
        required
        defaultValue={defaults.trade ?? ""}
        options={[{ value: "", label: "Choose the kind of work" }, ...trades]}
        error={state.fieldErrors?.trade}
        helpText="This decides which contractors can quote. If unsure, choose Other."
      />

      <FormField label="Where in the building" name="location" defaultValue={defaults.location ?? undefined} placeholder="e.g. Basement level 1, near bay 14" error={state.fieldErrors?.location} />

      <TextareaField
        label="Describe the problem"
        name="description"
        required
        rows={5}
        defaultValue={defaults.description}
        placeholder="What you saw, where, and since when. Is anything damaged or unsafe?"
        error={state.fieldErrors?.description}
      />

      <label className="flex items-start gap-3 rounded-[var(--radius-card)] border border-line bg-white p-4">
        <input type="checkbox" name="isEmergency" defaultChecked={!!defaults.isEmergency} className="mt-0.5 h-4 w-4 accent-turquoise" />
        <span className="text-sm text-ink">
          <span className="font-medium">This is urgent</span>
          <span className="block text-ink-muted mt-0.5">A risk to safety, security or further damage, such as a burst pipe, a broken entry door or no power to common areas. In an emergency that puts anyone at risk, call 000 first.</span>
        </span>
      </label>

      <div>
        <label htmlFor="photos" className="block text-sm font-medium text-ink mb-1.5">
          Photos <span className="font-normal text-ink-muted">(optional, up to {room}, JPEG, PNG or WebP, 10MB each)</span>
        </label>
        {room > 0 ? (
          <input
            id="photos"
            name="photos"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={(e) => choose(e.target.files)}
            className="block w-full text-sm text-ink file:mr-3 file:rounded-full file:border-0 file:bg-muted file:px-4 file:py-2 file:text-sm file:font-medium"
          />
        ) : (
          <p className="text-sm text-ink-muted">This request already has {WORKS_PHOTOS_MAX} photos.</p>
        )}
        {files.length > 0 && <p className="mt-1.5 text-xs text-ink-muted">{files.length} photo{files.length === 1 ? "" : "s"} chosen: {files.map((f) => f.name).join(", ")}</p>}
        {(photoError ?? state.fieldErrors?.photos) && <p className="mt-1.5 text-xs text-red-500">{photoError ?? state.fieldErrors?.photos}</p>}
      </div>

      <div className="flex items-center gap-3 pt-1">
        <Button type="submit" disabled={busy || !!state.done}>
          {uploading ? "Uploading photos..." : isPending ? "Sending..." : requestId ? "Send back to the committee" : "Send to the committee"}
        </Button>
      </div>
    </form>
  );
}
