"use client";

import { useState, useMemo } from "react";

type DocumentItem = {
  id: string;
  title: string;
  category: string;
  fileName: string;
  fileSize: number | null;
  createdAt: string;
  fileUrl: string;
};

const CATEGORIES = [
  { value: "ALL", label: "All Types" },
  { value: "MINUTES", label: "Minutes" },
  { value: "INSURANCE", label: "Insurance" },
  { value: "BYLAW", label: "By-Law" },
  { value: "FINANCIAL", label: "Financial" },
  { value: "COMPLIANCE", label: "Compliance" },
  { value: "OTHER", label: "Other" },
];

function formatDate(dateStr: string) {
  // A fixed time zone, so the server and the browser show the same day (React error 418).
  return new Date(dateStr).toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Australia/Sydney",
  });
}

function formatFileSize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function categoryLabel(cat: string) {
  return CATEGORIES.find((c) => c.value === cat)?.label ?? cat;
}

const fileIcons: Record<string, string> = {
  pdf: "📄",
  doc: "📝",
  docx: "📝",
  xls: "📊",
  xlsx: "📊",
  jpg: "🖼️",
  jpeg: "🖼️",
  png: "🖼️",
};

function fileIcon(fileName: string) {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return fileIcons[ext] ?? "📎";
}

export function LotDocuments({ documents }: { documents: DocumentItem[] }) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("ALL");
  const [sortBy, setSortBy] = useState<"latest" | "oldest" | "name">("latest");

  const filtered = useMemo(() => {
    let result = documents;

    if (category !== "ALL") {
      result = result.filter((d) => d.category === category);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (d) =>
          d.title.toLowerCase().includes(q) ||
          d.fileName.toLowerCase().includes(q),
      );
    }

    if (sortBy === "latest") {
      result = [...result].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    } else if (sortBy === "oldest") {
      result = [...result].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
    } else {
      result = [...result].sort((a, b) => a.title.localeCompare(b.title));
    }

    return result;
  }, [documents, search, category, sortBy]);

  return (
    <div>
      <p className="text-sm text-ink-muted mb-4">
        Scheme documents accessible to this lot.
      </p>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-4">
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          className="rounded-[var(--radius-card)] border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-turquoise"
        >
          <option value="latest">Sort: Latest</option>
          <option value="oldest">Sort: Oldest</option>
          <option value="name">Sort: Name</option>
        </select>

        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-[var(--radius-card)] border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-turquoise"
        >
          {CATEGORIES.map((cat) => (
            <option key={cat.value} value={cat.value}>
              {cat.label}
            </option>
          ))}
        </select>

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search documents..."
          className="w-full sm:w-56 rounded-[var(--radius-card)] border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-turquoise transition-colors"
        />
      </div>

      {/* Document list */}
      {filtered.length === 0 ? (
        <div className="rounded-[var(--radius-card)] border border-line px-4 py-8 text-center text-sm text-ink-muted">
          {documents.length === 0
            ? "No documents uploaded for this scheme yet."
            : "No documents match your filters."}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center gap-3 rounded-[var(--radius-card)] border border-line bg-white px-4 py-3 hover:bg-muted/30 transition-colors"
            >
              <span className="text-lg shrink-0">{fileIcon(doc.fileName)}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink truncate">
                  {doc.title}
                </p>
                <p className="text-xs text-ink-muted">
                  {categoryLabel(doc.category)}
                  {doc.fileSize ? ` · ${formatFileSize(doc.fileSize)}` : ""}
                  {" · "}
                  {formatDate(doc.createdAt)}
                </p>
              </div>
              {doc.fileUrl ? (
                <a
                  href={doc.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 rounded-[var(--radius-card)] px-3 py-1.5 text-xs font-medium text-turquoise hover:bg-mint-soft transition-colors"
                >
                  View
                </a>
              ) : (
                <span className="shrink-0 px-3 py-1.5 text-xs text-ink-muted">Unavailable</span>
              )}
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-ink-muted text-center mt-3">
        {filtered.length} {filtered.length === 1 ? "document" : "documents"}
        {search && ` matching "${search}"`}
      </p>
    </div>
  );
}
