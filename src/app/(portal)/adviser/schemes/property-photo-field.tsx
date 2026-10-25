"use client";

import { useEffect, useState } from "react";
import { PHOTO_ACCEPT, photoFileProblem } from "@/lib/schemes/upload-photo";

/**
 * The optional property photo in the Add Property wizard (25 Oct 2026). The
 * file stays in the browser until the building is created, then goes
 * straight to storage. It is never sent with the wizard's form.
 */
export function PropertyPhotoField({ value, onChange }: { value: File | null; onChange: (file: File | null) => void }) {
  const [problem, setProblem] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!value) return;
    const url = URL.createObjectURL(value);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- an object URL for the chosen file, released on change
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);

  return (
    <div className="mt-6 pt-6 border-t border-line">
      <h3 className="text-sm font-semibold text-ink mb-1">Property photo (optional)</h3>
      <p className="text-sm text-ink-muted mb-4">Shown on the building&apos;s page and beside it in your list of schemes. JPEG, PNG or WebP, up to 10 MB. You can add or change it later.</p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {value && preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Chosen property photo" className="h-24 w-36 rounded-lg object-cover border border-line" />
        ) : (
          <div className="flex h-24 w-36 items-center justify-center rounded-lg border border-dashed border-line text-xs text-ink-muted">No photo chosen</div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex h-10 cursor-pointer items-center rounded-full border-[1.5px] border-turquoise bg-white px-5 text-[13px] font-semibold uppercase tracking-[0.04em] text-turquoise hover:bg-turquoise/5 focus-within:ring-2 focus-within:ring-turquoise">
            {value ? "Choose another" : "Choose photo"}
            <input
              type="file"
              accept={PHOTO_ACCEPT}
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                e.target.value = "";
                if (!f) return;
                const p = photoFileProblem(f);
                setProblem(p);
                onChange(p ? null : f);
              }}
            />
          </label>
          {value && (
            <button type="button" onClick={() => { onChange(null); setPreview(null); }} className="text-sm font-medium text-ink-muted hover:text-ink">
              Remove
            </button>
          )}
        </div>
      </div>
      {value && <p className="mt-2 text-xs text-ink-muted break-all">{value.name}</p>}
      {problem && <p role="alert" className="mt-2 text-sm text-[#B33A3A]">{problem}</p>}
    </div>
  );
}
