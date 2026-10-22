"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader } from "@/components/ui/card";
import {
  uploadInsuranceDocumentAction,
  getInsuranceDocumentUrlAction,
  deleteInsuranceDocumentAction,
} from "./document-actions";
import {
  DOCUMENT_CATEGORIES,
  DOCUMENT_CATEGORY_LABELS,
} from "@/lib/insurance/constants";
import type { PolicyDocumentView } from "@/lib/queries/insurance-documents";

const categoryOptions = DOCUMENT_CATEGORIES.map((v) => ({
  value: v,
  label: DOCUMENT_CATEGORY_LABELS[v] ?? v,
}));

function formatSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

interface UploadItem {
  name: string;
  status: "uploading" | "done" | "error";
  error?: string;
}

const inputClass =
  "rounded-[var(--radius-card)] border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-turquoise focus:border-turquoise";

export function InsuranceDocumentsSection({
  schemeId,
  policyId,
  documents,
}: {
  schemeId: string;
  policyId: string;
  documents: PolicyDocumentView[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [category, setCategory] = useState<string>("POLICY_SCHEDULE");
  const [queue, setQueue] = useState<UploadItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string>("ALL");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const fileRef = useRef<HTMLInputElement>(null);
  const versionRef = useRef<HTMLInputElement>(null);
  const [versionTarget, setVersionTarget] = useState<string | null>(null);

  async function uploadFiles(files: File[], supersedesId?: string) {
    if (files.length === 0) return;
    setError(null);
    const items: UploadItem[] = files.map((f) => ({
      name: f.name,
      status: "uploading",
    }));
    setQueue(items);

    for (let i = 0; i < files.length; i++) {
      const fd = new FormData();
      fd.set("file", files[i]);
      fd.set("category", supersedesId ? documentCategoryOf(supersedesId) : category);
      if (supersedesId) fd.set("supersedesId", supersedesId);
      const res = await uploadInsuranceDocumentAction(schemeId, policyId, fd);
      setQueue((q) =>
        q.map((it, j) =>
          j === i
            ? {
                ...it,
                status: res.error ? "error" : "done",
                error: res.error,
              }
            : it,
        ),
      );
    }
    startTransition(() => router.refresh());
    setTimeout(() => setQueue([]), 2500);
  }

  function documentCategoryOf(docId: string): string {
    return documents.find((d) => d.id === docId)?.category ?? "OTHER";
  }

  async function download(fileUrl: string) {
    const res = await getInsuranceDocumentUrlAction(schemeId, fileUrl);
    if (res.url) window.open(res.url, "_blank", "noopener");
    else setError(res.error ?? "Could not open the document.");
  }

  function remove(documentId: string) {
    setError(null);
    startTransition(async () => {
      const res = await deleteInsuranceDocumentAction(schemeId, policyId, documentId);
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  const filtered = documents.filter((d) => {
    if (filter !== "ALL" && d.category !== filter) return false;
    if (search && !`${d.title} ${d.fileName}`.toLowerCase().includes(search.toLowerCase()))
      return false;
    return true;
  });

  const usedCategories = Array.from(new Set(documents.map((d) => d.category)));

  return (
    <Card className="mb-6">
      <CardHeader
        title="Documents"
        description="Policy schedules, certificates, invoices and other supporting files. New uploads of the same document are kept as versions, never overwritten."
      />

      {error && (
        <div className="mb-4 rounded-[var(--radius-card)] bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Upload zone */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <select
          className={inputClass}
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          aria-label="Document category"
        >
          {categoryOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            uploadFiles(Array.from(e.dataTransfer.files));
          }}
          className={`flex-1 rounded-[var(--radius-card)] border border-dashed px-4 py-4 text-center text-sm transition-colors ${
            dragOver ? "border-turquoise bg-turquoise/5" : "border-line"
          }`}
        >
          <span className="text-ink-muted">
            Drag files here, or{" "}
            <button
              type="button"
              className="text-turquoise font-medium hover:underline"
              onClick={() => fileRef.current?.click()}
            >
              choose files
            </button>
          </span>
          <input
            ref={fileRef}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              uploadFiles(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
        </div>
      </div>

      {/* Hidden input for uploading a new version of a specific document */}
      <input
        ref={versionRef}
        type="file"
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length && versionTarget) uploadFiles(files, versionTarget);
          setVersionTarget(null);
          e.target.value = "";
        }}
      />

      {/* Upload progress */}
      {queue.length > 0 && (
        <div className="mb-4 space-y-1">
          {queue.map((it, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span
                className={
                  it.status === "error"
                    ? "text-red-600"
                    : it.status === "done"
                      ? "text-green-600"
                      : "text-ink-muted"
                }
              >
                {it.status === "uploading"
                  ? "Uploading"
                  : it.status === "done"
                    ? "Uploaded"
                    : "Failed"}
              </span>
              <span className="text-ink truncate">{it.name}</span>
              {it.error && <span className="text-red-600">— {it.error}</span>}
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      {documents.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-2 mb-3">
          <input
            className={`${inputClass} flex-1`}
            placeholder="Search documents"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className={inputClass}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            aria-label="Filter by category"
          >
            <option value="ALL">All categories</option>
            {usedCategories.map((c) => (
              <option key={c} value={c}>
                {DOCUMENT_CATEGORY_LABELS[c] ?? c}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* List */}
      {documents.length === 0 ? (
        <p className="text-sm text-ink-muted">
          No documents yet. Upload the policy schedule, certificate of currency,
          premium invoice and other supporting files.
        </p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-ink-muted">No documents match your filter.</p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((d) => {
            const isOpen = expanded.has(d.id);
            return (
              <li
                key={d.id}
                className="rounded-[var(--radius-card)] border border-line p-3"
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-ink truncate">
                        {d.title}
                      </span>
                      <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-paper-2 text-ink-muted">
                        {DOCUMENT_CATEGORY_LABELS[d.category] ?? d.category}
                      </span>
                      {d.version > 1 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-turquoise/10 text-turquoise">
                          v{d.version}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-ink-muted mt-0.5 truncate">
                      {d.fileName}
                      {formatSize(d.fileSize) ? ` · ${formatSize(d.fileSize)}` : ""} ·{" "}
                      {formatDate(d.uploadedAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <button
                      type="button"
                      className="text-turquoise hover:underline"
                      onClick={() => download(d.fileUrl)}
                    >
                      Download
                    </button>
                    <button
                      type="button"
                      className="text-ink-muted hover:underline"
                      onClick={() => {
                        setVersionTarget(d.id);
                        versionRef.current?.click();
                      }}
                    >
                      New version
                    </button>
                    {d.versions.length > 1 && (
                      <button
                        type="button"
                        className="text-ink-muted hover:underline"
                        onClick={() =>
                          setExpanded((s) => {
                            const n = new Set(s);
                            if (n.has(d.id)) n.delete(d.id);
                            else n.add(d.id);
                            return n;
                          })
                        }
                      >
                        {isOpen ? "Hide history" : `History (${d.versions.length})`}
                      </button>
                    )}
                    <button
                      type="button"
                      className="text-red-600 hover:underline disabled:opacity-50"
                      disabled={pending}
                      onClick={() => remove(d.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {isOpen && (
                  <ul className="mt-2 pl-3 border-l border-line space-y-1">
                    {d.versions.map((v) => (
                      <li
                        key={v.id}
                        className="flex items-center justify-between gap-2 text-xs text-ink-muted"
                      >
                        <span>
                          v{v.version} · {v.fileName} · {formatDate(v.uploadedAt)}
                        </span>
                        <button
                          type="button"
                          className="text-turquoise hover:underline"
                          onClick={() => download(v.fileUrl)}
                        >
                          Download
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
