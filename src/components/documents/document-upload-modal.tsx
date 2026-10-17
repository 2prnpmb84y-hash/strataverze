"use client";

import { useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import type { DocumentMetadata } from "./documents-tab-content";

type UploadFile = {
  id: string;
  file: File;
};

type Step = "files" | "metadata";

const CATEGORIES = [
  { value: "MINUTES", label: "Minutes" },
  { value: "INSURANCE", label: "Insurance" },
  { value: "BYLAW", label: "By-laws" },
  { value: "FINANCIAL", label: "Financial" },
  { value: "COMPLIANCE", label: "Compliance" },
  { value: "OTHER", label: "Other" },
];

const DOCUMENT_TYPES = [
  { value: "", label: "Select type..." },
  { value: "AGM_MINUTES", label: "AGM Minutes" },
  { value: "SGM_MINUTES", label: "SGM Minutes" },
  { value: "COMMITTEE_MINUTES", label: "Committee Minutes" },
  { value: "INSURANCE_CERTIFICATE", label: "Insurance Certificate" },
  { value: "INSURANCE_VALUATION", label: "Insurance Valuation" },
  { value: "BY_LAW_REGISTRATION", label: "By-law Registration" },
  { value: "BUDGET", label: "Budget" },
  { value: "FINANCIAL_STATEMENT", label: "Financial Statement" },
  { value: "AUDIT_REPORT", label: "Audit Report" },
  { value: "LEVY_NOTICE", label: "Levy Notice" },
  { value: "FIRE_SAFETY", label: "Fire Safety" },
  { value: "COMPLIANCE_CERTIFICATE", label: "Compliance Certificate" },
  { value: "WORK_ORDER", label: "Work Order" },
  { value: "QUOTE", label: "Quote" },
  { value: "INVOICE", label: "Invoice" },
  { value: "CONTRACT", label: "Contract" },
  { value: "CORRESPONDENCE", label: "Correspondence" },
  { value: "NOTICE", label: "Notice" },
  { value: "OTHER", label: "Other" },
];

export function DocumentUploadModal({
  open,
  onClose,
  onFilesReady,
  schemePlanNumber,
}: {
  open: boolean;
  onClose: () => void;
  onFilesReady: (files: File[], metadata: DocumentMetadata) => void;
  schemePlanNumber: string;
}) {
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [step, setStep] = useState<Step>("files");
  const [metadata, setMetadata] = useState<DocumentMetadata>({
    category: "OTHER",
    documentType: "",
    strataPlan: "",
    schedule: "",
    lotNumber: "",
    supplier: "",
    comments: "",
  });
  const inputRef = useRef<HTMLInputElement>(null);

  const resetState = useCallback(() => {
    setFiles([]);
    setStep("files");
    setMetadata({
      category: "OTHER",
      documentType: "",
      strataPlan: "",
      schedule: "",
      lotNumber: "",
      supplier: "",
      comments: "",
    });
  }, []);

  const handleClose = useCallback(() => {
    resetState();
    onClose();
  }, [resetState, onClose]);

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const incoming = Array.from(newFiles).filter((f) => {
      const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
      return ["pdf", "docx", "doc", "xls", "xlsx", "csv", "txt", "png", "jpg", "jpeg"].includes(ext);
    });

    setFiles((prev) => [
      ...prev,
      ...incoming.map((file) => ({
        id: crypto.randomUUID(),
        file,
      })),
    ]);
  }, []);

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      if (e.dataTransfer.files.length > 0) {
        addFiles(e.dataTransfer.files);
      }
    },
    [addFiles],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleNext = useCallback(() => {
    if (files.length === 0) return;
    setStep("metadata");
  }, [files]);

  const handleUpload = useCallback(() => {
    onFilesReady(files.map((f) => f.file), metadata);
    resetState();
  }, [files, metadata, onFilesReady, resetState]);

  const updateMetadata = useCallback((field: keyof DocumentMetadata, value: string) => {
    setMetadata((prev) => ({ ...prev, [field]: value }));
  }, []);

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (!open) return null;

  const stepTitle =
    step === "files"
      ? files.length === 0
        ? "Upload Documents"
        : `${files.length} file${files.length === 1 ? "" : "s"} selected`
      : "Document Details";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-lg mx-4 bg-background rounded-2xl shadow-xl max-h-[90vh] flex flex-col">
        <div className="px-6 pt-6 pb-2 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            {step === "metadata" && (
              <button
                type="button"
                onClick={() => setStep("files")}
                className="text-muted-foreground hover:text-foreground transition-colors p-1"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M12 4L6 10l6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
            <h2 className="text-lg font-heading font-semibold text-foreground">
              {stepTitle}
            </h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="text-muted-foreground hover:text-foreground transition-colors p-1"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M15 5L5 15M5 5l10 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Step indicator */}
        <div className="px-6 pb-3 flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className={`h-1 flex-1 rounded-full ${step === "files" ? "bg-primary-400" : "bg-primary-400"}`} />
            <div className={`h-1 flex-1 rounded-full ${step === "metadata" ? "bg-primary-400" : "bg-gray-200"}`} />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-xs text-muted-foreground">Select files</span>
            <span className="text-xs text-muted-foreground">Allocate details</span>
          </div>
        </div>

        {step === "files" && files.length === 0 && (
          /* Drop zone state */
          <div className="px-6 pb-6 flex-1 overflow-y-auto">
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => inputRef.current?.click()}
              className={`mt-2 flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-10 cursor-pointer transition-colors ${
                isDragOver
                  ? "border-primary-400 bg-primary-50"
                  : "border-border hover:border-primary-300 hover:bg-muted/50"
              }`}
            >
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none" className="mb-3 text-muted-foreground">
                <path d="M24 32V16m0 0l-6 6m6-6l6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M40 30v6a4 4 0 01-4 4H12a4 4 0 01-4-4v-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <p className="text-sm font-medium text-foreground mb-1">Drag and drop files here</p>
              <p className="text-xs text-muted-foreground">or click to browse</p>
              <p className="text-xs text-muted-foreground mt-2">Supports .pdf, .docx, .xlsx and more (max 30 MB each)</p>
            </div>

            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg"
              className="hidden"
              onChange={(e) => {
                if (e.target.files) addFiles(e.target.files);
                e.target.value = "";
              }}
            />

            <div className="mt-4 flex justify-end">
              <Button variant="primary" onClick={() => inputRef.current?.click()}>
                Browse Files
              </Button>
            </div>
          </div>
        )}

        {step === "files" && files.length > 0 && (
          /* File list state */
          <div className="px-6 pb-6 flex-1 overflow-y-auto">
            <div className="mt-2 space-y-2 max-h-64 overflow-y-auto">
              {files.map((f, idx) => (
                <div key={f.id} className="flex items-center gap-3 rounded-lg bg-muted px-4 py-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary-100 text-primary-700 text-xs font-medium flex items-center justify-center">
                    {idx + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{f.file.name}</p>
                    <p className="text-xs text-muted-foreground">{formatSize(f.file.size)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFile(f.id)}
                    className="flex-shrink-0 text-muted-foreground hover:text-red-500 transition-colors p-1"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>

            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg"
              className="hidden"
              onChange={(e) => {
                if (e.target.files) addFiles(e.target.files);
                e.target.value = "";
              }}
            />

            <div className="mt-4 flex items-center justify-between">
              <Button variant="secondary" onClick={() => inputRef.current?.click()}>
                Add More
              </Button>
              <Button variant="primary" onClick={handleNext}>
                Next
              </Button>
            </div>
          </div>
        )}

        {step === "metadata" && (
          /* Metadata form */
          <div className="px-6 pb-6 flex-1 overflow-y-auto">
            <p className="text-xs text-muted-foreground mb-4">
              Set the details below for {files.length === 1 ? "this document" : `all ${files.length} documents`}. You can update individual documents later.
            </p>

            <div className="space-y-4">
              {/* Category */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Category <span className="text-red-500">*</span>
                </label>
                <select
                  value={metadata.category}
                  onChange={(e) => updateMetadata("category", e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary-400"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat.value} value={cat.value}>{cat.label}</option>
                  ))}
                </select>
              </div>

              {/* Document Type */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Document Type
                </label>
                <select
                  value={metadata.documentType}
                  onChange={(e) => updateMetadata("documentType", e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary-400"
                >
                  {DOCUMENT_TYPES.map((dt) => (
                    <option key={dt.value} value={dt.value}>{dt.label}</option>
                  ))}
                </select>
              </div>

              {/* Strata Plan */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Strata Plan
                </label>
                <input
                  type="text"
                  value={metadata.strataPlan}
                  onChange={(e) => updateMetadata("strataPlan", e.target.value)}
                  placeholder={schemePlanNumber || "e.g. SP 12345"}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary-400"
                />
              </div>

              {/* Schedule and Lot Number in a row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Schedule
                  </label>
                  <input
                    type="text"
                    value={metadata.schedule}
                    onChange={(e) => updateMetadata("schedule", e.target.value)}
                    placeholder="e.g. Schedule A"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary-400"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Lot Number
                  </label>
                  <input
                    type="text"
                    value={metadata.lotNumber}
                    onChange={(e) => updateMetadata("lotNumber", e.target.value)}
                    placeholder="e.g. 42"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary-400"
                  />
                </div>
              </div>

              {/* Supplier */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Supplier
                </label>
                <input
                  type="text"
                  value={metadata.supplier}
                  onChange={(e) => updateMetadata("supplier", e.target.value)}
                  placeholder="e.g. ABC Building Services"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary-400"
                />
              </div>

              {/* Comments */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Comments
                </label>
                <textarea
                  value={metadata.comments}
                  onChange={(e) => updateMetadata("comments", e.target.value)}
                  placeholder="Any additional notes..."
                  rows={3}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary-400 resize-none"
                />
              </div>
            </div>

            <div className="mt-5 flex items-center justify-between">
              <Button variant="secondary" onClick={() => setStep("files")}>
                Back
              </Button>
              <Button variant="primary" onClick={handleUpload}>
                Upload {files.length === 1 ? "Document" : `${files.length} Documents`}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
