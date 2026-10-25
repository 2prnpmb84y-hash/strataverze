"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PHOTO_ACCEPT, uploadSchemePhoto } from "@/lib/schemes/upload-photo";

/** Add or change the building's property photo, over the photo area. */
export function SchemePhotoButton({ schemeId, hasPhoto }: { schemeId: string; hasPhoto: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const choose = (file: File) =>
    startTransition(async () => {
      setMessage(null);
      const r = await uploadSchemePhoto(schemeId, file);
      if ("error" in r) setMessage({ ok: false, text: r.error });
      else {
        setMessage({ ok: true, text: "Photo saved." });
        router.refresh();
      }
    });

  return (
    <div className="flex flex-col items-end gap-1">
      <input
        ref={input}
        type="file"
        accept={PHOTO_ACCEPT}
        className="sr-only"
        aria-label={hasPhoto ? "Choose a new property photo" : "Choose a property photo"}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) choose(f);
        }}
      />
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={busy}
        className="inline-flex h-9 items-center gap-2 rounded-full bg-white/95 px-4 text-[12px] font-semibold uppercase tracking-[0.04em] text-turquoise shadow-sm ring-1 ring-line hover:bg-white disabled:opacity-60"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M4 7h3l2-3h6l2 3h3v12H4z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          <circle cx="12" cy="13" r="3.5" stroke="currentColor" strokeWidth="1.8" />
        </svg>
        {busy ? "Uploading…" : hasPhoto ? "Change photo" : "Add photo"}
      </button>
      {message && (
        <p role="status" className={`rounded-md bg-white/95 px-2 py-1 text-xs ${message.ok ? "text-[#1A7A63]" : "text-[#B33A3A]"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
