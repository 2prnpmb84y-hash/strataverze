"use client";

import { useState } from "react";
import { getOwnerInsuranceDocumentUrlAction } from "../actions";
import { DOCUMENT_CATEGORY_LABELS } from "@/lib/insurance/constants";

export interface OwnerDocView {
  id: string;
  title: string;
  category: string;
  fileName: string;
  fileUrl: string;
  version: number;
  uploadedAt: string;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function OwnerDocuments({
  schemeId,
  documents,
}: {
  schemeId: string;
  documents: OwnerDocView[];
}) {
  const [error, setError] = useState<string | null>(null);

  async function download(documentId: string) {
    setError(null);
    const res = await getOwnerInsuranceDocumentUrlAction(schemeId, documentId);
    if (res.url) window.open(res.url, "_blank", "noopener");
    else setError(res.error ?? "Could not open the document.");
  }

  if (documents.length === 0) {
    return <p className="text-sm text-ink-muted">No documents available.</p>;
  }

  return (
    <div>
      {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
      <ul className="space-y-1.5">
        {documents.map((d) => (
          <li
            key={d.id}
            className="flex items-center justify-between gap-3 text-sm border-b border-line/60 pb-1.5"
          >
            <span className="text-ink truncate">
              {d.title}
              <span className="text-ink-muted">
                {" "}
                · {DOCUMENT_CATEGORY_LABELS[d.category] ?? d.category}
                {d.version > 1 ? ` · v${d.version}` : ""} · {fmtDate(d.uploadedAt)}
              </span>
            </span>
            <button
              type="button"
              className="text-turquoise text-xs hover:underline shrink-0"
              onClick={() => download(d.id)}
            >
              Download
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
