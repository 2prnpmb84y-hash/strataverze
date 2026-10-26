"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { addVaultVersionAction, annotateVaultRecordAction, getVaultRecordAction, getVaultVersionUrlAction } from "@/lib/actions/vault";
import { stageUpload } from "@/lib/storage/client-upload";
import { auDate, auDateTime } from "@/lib/vault/labels";
import { describeEvent } from "@/lib/vault/event-text";
import type { vaultRecordDetail } from "@/lib/vault/queries";
import { VaultLabelChip } from "./vault-label";

type Detail = NonNullable<Awaited<ReturnType<typeof vaultRecordDetail>>>;

const size = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / (1024 * 1024)).toFixed(1)} MB`);
const SOURCE_TEXT: Record<string, string> = { UPLOAD: "Uploaded", STRATAVERZE: "Issued by StrataVerze" };

/**
 * The vault side of a document: what was checked, every version, every
 * receipt, its history, and notes. Shown under the document viewer in a
 * trial building's library, and on the vault page.
 */
export function VaultRecordPanel({
  schemeId,
  documentId,
  recordId,
  allowNewVersion = true,
  initialDetail,
  timeZone,
}: {
  schemeId: string;
  documentId?: string;
  recordId?: string;
  allowNewVersion?: boolean;
  /** Already loaded (skips the first fetch). */
  initialDetail?: Detail;
  /** The building's time zone, for the times shown. */
  timeZone: string;
}) {
  const router = useRouter();
  const [detail, setDetail] = useState<Detail | null | undefined>(initialDetail);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [noteKind, setNoteKind] = useState<"note" | "correction">("note");
  const [busy, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  const [sharedCopy, setSharedCopy] = useState(false);
  const load = useCallback(() => {
    getVaultRecordAction(schemeId, { documentId, recordId })
      .then((r) => {
        startTransition(() => {
          setDetail(r.record ?? null);
          setSharedCopy(!!r.sharedCopy);
          setError("error" in r && r.error ? r.error : null);
        });
      })
      .catch(() => {
        startTransition(() => {
          setDetail(null);
          setError("The vault record could not be loaded. Please reload the page.");
        });
      });
  }, [schemeId, documentId, recordId]);

  const preloaded = useRef(!!initialDetail);
  useEffect(() => {
    if (preloaded.current) {
      preloaded.current = false;
      return;
    }
    load();
  }, [load]);

  const open = (versionId: string) => {
    // Opened now, while the click still counts, so the browser does not block it.
    const tab = window.open("", "_blank");
    if (tab) tab.opener = null;
    startTransition(async () => {
      const r = await getVaultVersionUrlAction(schemeId, versionId);
      if (r.url && tab) tab.location.href = r.url;
      else if (r.url) window.location.assign(r.url);
      else {
        tab?.close();
        setError(r.error ?? "Could not open the file.");
      }
    });
  };

  const addNote = () =>
    startTransition(async () => {
      if (!detail) return;
      const r = await annotateVaultRecordAction(schemeId, detail.id, noteKind, note);
      if (r.error) setError(r.error);
      else {
        setMessage(r.message ?? "Added.");
        setNote("");
        load();
      }
    });

  const addVersion = (file: File) =>
    startTransition(async () => {
      if (!documentId) return;
      setError(null);
      setMessage(null);
      const staged = await stageUpload(schemeId, "library", file);
      if ("error" in staged) return setError(staged.error);
      const r = await addVaultVersionAction(schemeId, documentId, staged.uploadId);
      if (r.error) setError(r.error);
      else {
        setMessage(r.message ?? "Added.");
        load();
        router.refresh();
      }
    });

  if (detail === undefined) return <div className="mt-4 rounded-[var(--radius-card)] border border-line bg-white p-4 text-sm text-ink-muted">Loading the vault record…</div>;
  if (detail === null) {
    return (
      <div className="mt-4 rounded-[var(--radius-card)] border border-line bg-white p-4 text-sm text-ink-muted">
        {error ?? "This document is not in the vault yet. Use “Bring them in” at the top of the library."}
      </div>
    );
  }

  const latest = detail.versions[0];
  return (
    <section aria-labelledby={`vault-${detail.id}`} className="mt-4 rounded-[var(--radius-card)] border border-line bg-white p-4 sm:p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 id={`vault-${detail.id}`} className="font-heading font-semibold text-ink">In the building vault</h3>
          <p className="text-xs text-ink-muted">
            {SOURCE_TEXT[detail.source] ?? detail.source} · captured {auDateTime(detail.createdAt, timeZone)}
            {detail.reportedDate ? ` · dated ${auDate(detail.reportedDate)} (as reported)` : ""}
          </p>
        </div>
        {allowNewVersion && documentId && !sharedCopy && (
          <div className="sm:shrink-0">
            <input
              ref={fileInput}
              type="file"
              className="sr-only"
              aria-label="Choose a new version"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) addVersion(f);
              }}
            />
            <Button variant="secondary" onClick={() => fileInput.current?.click()} disabled={busy}>
              Add a new version
            </Button>
          </div>
        )}
      </div>

      {sharedCopy && (
        <p className="mt-3 rounded-lg bg-muted px-3 py-2 text-xs text-ink-muted">
          This document is the same file as &ldquo;{detail.title}&rdquo;, so the vault keeps it once, under that record, and records this copy as received again.
        </p>
      )}

      {latest && (
        <ul className="mt-3 space-y-2" aria-label="What was checked">
          {latest.labels.map((l) => (
            <li key={l.text} className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-3">
              <span className="sm:w-64 sm:shrink-0">
                <VaultLabelChip tone={l.tone} text={l.text} />
              </span>
              <span className="min-w-0 text-xs text-ink-muted">{l.detail}</span>
            </li>
          ))}
        </ul>
      )}

      <h4 className="mt-5 text-xs font-semibold uppercase tracking-wide text-ink-muted">Versions</h4>
      <ol className="mt-2 divide-y divide-line rounded-lg border border-line">
        {detail.versions.map((v) => (
          <li key={v.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">
                Version {v.versionNo}
                {v === latest ? " (current)" : ""} · <span className="break-all font-normal">{v.fileName}</span>
              </p>
              <p className="text-xs text-ink-muted">
                Captured {auDateTime(v.capturedAt, timeZone)} · {size(v.sizeBytes)} · received {v.receipts.length} time{v.receipts.length === 1 ? "" : "s"}
              </p>
              <p className="mt-0.5 break-all font-mono text-[11px] text-ink-muted" title="SHA-256 fingerprint of the exact file">
                SHA-256 {v.contentHash}
              </p>
            </div>
            <Button variant="ghost" onClick={() => open(v.id)} disabled={busy} className="sm:shrink-0">
              Open original
            </Button>
          </li>
        ))}
      </ol>

      <h4 className="mt-5 text-xs font-semibold uppercase tracking-wide text-ink-muted">History</h4>
      <ol className="mt-2 space-y-1.5">
        {detail.history.map((h) => (
          <li key={h.seq} className="text-sm text-ink">
            <span className="text-xs text-ink-muted">{auDateTime(h.occurredAt, timeZone)} · event {h.seq}</span>
            <br />
            {describeEvent(h.eventType)}
            {typeof h.details.text === "string" && <span className="block whitespace-pre-wrap text-ink-muted">&ldquo;{h.details.text}&rdquo;</span>}
            {h.eventType === "library.metadata_changed" && typeof h.details.title === "string" && (
              <span className="block text-ink-muted">Name in the library now: {h.details.title}</span>
            )}
          </li>
        ))}
      </ol>

      <div className="mt-5">
        <label htmlFor={`note-${detail.id}`} className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Add a note or correction
        </label>
        <p className="text-xs text-ink-muted">The record itself never changes. A note or correction is added to its history with your name and the time.</p>
        <div className="mt-2 flex flex-col gap-2">
          <textarea
            id={`note-${detail.id}`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={2000}
            className="w-full rounded-lg border border-line px-3 py-2 text-sm"
          />
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1.5 text-sm text-ink">
              <input type="radio" name={`kind-${detail.id}`} checked={noteKind === "note"} onChange={() => setNoteKind("note")} /> Note
            </label>
            <label className="flex items-center gap-1.5 text-sm text-ink">
              <input type="radio" name={`kind-${detail.id}`} checked={noteKind === "correction"} onChange={() => setNoteKind("correction")} /> Correction
            </label>
            <Button variant="secondary" onClick={addNote} disabled={busy || !note.trim()}>
              Add
            </Button>
          </div>
        </div>
      </div>

      {(error || message) && (
        <p role="status" className={`mt-3 text-sm ${error ? "text-[#B33A3A]" : "text-[#1A7A63]"}`}>
          {error ?? message}
        </p>
      )}
    </section>
  );
}
