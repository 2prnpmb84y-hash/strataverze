"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";

type DocumentRecord = {
  id: string;
  title: string;
  fileName: string;
  fileUrl: string;
  fileSize: number | null;
  mimeType: string | null;
  category: string;
  documentType: string | null;
  documentDate: string | null;
  strataPlan: string | null;
  schedule: string | null;
  lotNumber: string | null;
  supplier: string | null;
  comments: string | null;
  description: string | null;
  createdAt: string;
};

const DOCUMENT_TYPES = [
  { value: "", label: "Select type..." },
  { value: "STRATA_PLAN", label: "Strata Plan" },
  { value: "BY_LAW", label: "By-Law" },
  { value: "SCHEDULE", label: "Schedule" },
  { value: "NOTICE", label: "Notice" },
  { value: "CERTIFICATE", label: "Certificate" },
  { value: "CORRESPONDENCE", label: "Correspondence" },
  { value: "REPORT", label: "Report" },
  { value: "CONTRACT", label: "Contract" },
  { value: "MINUTES", label: "Minutes" },
  { value: "INSURANCE", label: "Insurance" },
  { value: "FINANCIAL", label: "Financial" },
  { value: "OTHER", label: "Other" },
];

export function DocumentViewer({
  document,
  filePublicUrl,
  schemePlanNumber,
  onUpdate,
  onRemove,
}: {
  document: DocumentRecord;
  filePublicUrl: string;
  schemePlanNumber: string;
  onUpdate: (data: Record<string, string>) => Promise<void>;
  onRemove: (docId: string) => Promise<void>;
}) {
  const [zoom, setZoom] = useState(100);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);

  const isPdf = document.mimeType?.includes("pdf") ||
    document.fileName.toLowerCase().endsWith(".pdf");

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setSaving(true);
      try {
        const fd = new FormData(e.currentTarget);
        const data: Record<string, string> = {};
        for (const [key, value] of fd.entries()) {
          data[key] = value as string;
        }
        await onUpdate(data);
      } finally {
        setSaving(false);
      }
    },
    [onUpdate],
  );

  const handleRemove = useCallback(async () => {
    setRemoving(true);
    try {
      await onRemove(document.id);
    } finally {
      setRemoving(false);
    }
  }, [document.id, onRemove]);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "";
    try {
      return new Date(dateStr).toISOString().split("T")[0];
    } catch {
      return "";
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-0 rounded-xl border border-border bg-background overflow-hidden">
      {/* Left pane: Document preview */}
      <div className="lg:w-[40%] flex flex-col border-b lg:border-b-0 lg:border-r border-border bg-muted/30">
        {/* Header bar with remove and zoom */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-background">
          <div className="flex items-center gap-2 min-w-0">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="flex-shrink-0 text-red-500">
              <path d="M3 1h7l4 4v10a1 1 0 01-1 1H3a1 1 0 01-1-1V2a1 1 0 011-1z" fill="currentColor" opacity="0.2" />
              <path d="M10 1l4 4h-3a1 1 0 01-1-1V1z" fill="currentColor" opacity="0.3" />
            </svg>
            <span className="text-sm font-medium text-foreground truncate">
              {document.fileName}
            </span>
          </div>
          <button
            type="button"
            onClick={handleRemove}
            disabled={removing}
            className="flex-shrink-0 text-xs text-red-500 hover:text-red-600 font-medium transition-colors disabled:opacity-50"
          >
            {removing ? "Removing..." : "Remove"}
          </button>
        </div>

        {/* Preview area */}
        <div className="flex-1 min-h-[300px] lg:min-h-[500px] overflow-auto p-2">
          {isPdf ? (
            <iframe
              src={`${filePublicUrl}#toolbar=0&view=FitH`}
              className="w-full h-full rounded-lg border border-border bg-white"
              style={{
                minHeight: "480px",
                transform: `scale(${zoom / 100})`,
                transformOrigin: "top left",
                width: `${10000 / zoom}%`,
                height: `${10000 / zoom}%`,
              }}
              title={`Preview: ${document.fileName}`}
            />
          ) : document.mimeType?.startsWith("image/") ? (
            <div className="flex items-center justify-center h-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={filePublicUrl}
                alt={document.fileName}
                className="max-w-full max-h-full object-contain rounded-lg"
                style={{
                  transform: `scale(${zoom / 100})`,
                  transformOrigin: "center",
                }}
              />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                <rect x="8" y="4" width="32" height="40" rx="4" stroke="currentColor" strokeWidth="2" />
                <path d="M16 16h16M16 24h16M16 32h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <p className="text-sm">Preview not available for this file type</p>
              <a
                href={filePublicUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary-500 hover:text-primary-600 font-medium"
              >
                Open file
              </a>
            </div>
          )}
        </div>

        {/* Zoom control */}
        <div className="flex items-center justify-center gap-3 px-4 py-2 border-t border-border bg-background">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(25, z - 25))}
            className="w-7 h-7 rounded-md border border-border text-foreground hover:bg-muted flex items-center justify-center text-sm font-medium transition-colors"
          >
            &minus;
          </button>
          <span className="text-xs text-muted-foreground font-medium w-10 text-center">
            {zoom}%
          </span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(200, z + 25))}
            className="w-7 h-7 rounded-md border border-border text-foreground hover:bg-muted flex items-center justify-center text-sm font-medium transition-colors"
          >
            +
          </button>
        </div>
      </div>

      {/* Right pane: Metadata form */}
      <div className="lg:w-[60%] p-6 overflow-y-auto">
        <h3 className="text-base font-heading font-semibold text-foreground mb-5">
          Document Details
        </h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="documentDate" className="block text-sm font-medium text-foreground mb-1.5">
              Date
            </label>
            <input
              id="documentDate"
              name="documentDate"
              type="date"
              defaultValue={formatDate(document.documentDate)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-400 transition-colors"
            />
          </div>

          <div>
            <label htmlFor="title" className="block text-sm font-medium text-foreground mb-1.5">
              Name
              <span className="text-red-500 ml-0.5">*</span>
            </label>
            <input
              id="title"
              name="title"
              type="text"
              required
              defaultValue={document.title}
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-400 transition-colors"
            />
          </div>

          <div>
            <label htmlFor="strataPlan" className="block text-sm font-medium text-foreground mb-1.5">
              S/Plan
            </label>
            <input
              id="strataPlan"
              name="strataPlan"
              type="text"
              defaultValue={document.strataPlan ?? schemePlanNumber}
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-400 transition-colors"
            />
          </div>

          <div>
            <label htmlFor="schedule" className="block text-sm font-medium text-foreground mb-1.5">
              Schedule
            </label>
            <input
              id="schedule"
              name="schedule"
              type="text"
              defaultValue={document.schedule ?? ""}
              placeholder="e.g. Schedule A"
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-400 transition-colors"
            />
          </div>

          <div>
            <label htmlFor="lotNumber" className="block text-sm font-medium text-foreground mb-1.5">
              Lot
            </label>
            <input
              id="lotNumber"
              name="lotNumber"
              type="text"
              defaultValue={document.lotNumber ?? ""}
              placeholder="e.g. Lot 1"
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-400 transition-colors"
            />
          </div>

          <div>
            <label htmlFor="supplier" className="block text-sm font-medium text-foreground mb-1.5">
              Supplier
            </label>
            <input
              id="supplier"
              name="supplier"
              type="text"
              defaultValue={document.supplier ?? ""}
              placeholder="e.g. ABC Insurance"
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-400 transition-colors"
            />
          </div>

          <div>
            <label htmlFor="documentType" className="block text-sm font-medium text-foreground mb-1.5">
              Document Type
              <span className="text-red-500 ml-0.5">*</span>
            </label>
            <select
              id="documentType"
              name="documentType"
              required
              defaultValue={document.documentType ?? ""}
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-400 transition-colors"
            >
              {DOCUMENT_TYPES.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="comments" className="block text-sm font-medium text-foreground mb-1.5">
              Comments
            </label>
            <textarea
              id="comments"
              name="comments"
              rows={3}
              defaultValue={document.comments ?? ""}
              placeholder="Additional notes about this document..."
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-400 transition-colors resize-y"
            />
          </div>

          <div className="pt-2">
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Submit"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
