"use client";
import { keepUntil, type RetentionRules } from "@/lib/compliance/annual-report";

import { useState, useCallback, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { DocumentUploadModal } from "./document-upload-modal";
import { DocumentViewer } from "./document-viewer";
import { stageUpload } from "@/lib/storage/client-upload";
import { VaultLabelChip } from "@/components/vault/vault-label";
import { VaultRecordPanel } from "@/components/vault/vault-record-panel";
import type { LabelTone } from "@/lib/vault/labels";
import { formatDateIn, storedDayIn } from "@/lib/jurisdiction/time-zone";
import {
  uploadFileAction,
  updateDocumentMetadataAction,
  removeDocumentAction,
  getDocumentSignedUrlAction,
} from "@/app/(portal)/adviser/schemes/[id]/documents/actions";

export type DocumentMetadata = {
  category: string;
  documentType: string;
  strataPlan: string;
  schedule: string;
  lotNumber: string;
  supplier: string;
  comments: string;
  /** Who can see it (S3). */
  visibility: string;
};

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
  /** Who can see it (S3). */
  visibility?: string;
};

type Props = {
  schemeId: string;
  schemePlanNumber: string;
  documents: DocumentRecord[];
  /** Building vault trial: each document's vault label, when the vault is open. */
  vaultLabels?: Record<string, { tone: LabelTone; text: string; detail: string }>;
  /** How long the building's records are kept (its rule pack), to show "keep until" on each document. */
  retention?: RetentionRules;
  /** The building's time zone, for upload dates and the day a document was added. */
  timeZone: string;
};

export function DocumentsTabContent({
  schemeId,
  schemePlanNumber,
  documents: initialDocuments,
  vaultLabels,
  retention,
  timeZone,
}: Props) {
  const router = useRouter();
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [documents, setDocuments] = useState(initialDocuments);
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loadingUrl, setLoadingUrl] = useState(false);
  const [, startTransition] = useTransition();

  // Sync documents state when server data changes (after router.refresh).
  // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: syncing prop into state on server re-render
  useEffect(() => { setDocuments(initialDocuments); }, [initialDocuments]);

  // Fetch a signed URL whenever the selected document changes
  useEffect(() => {
    if (!selectedDocId) {
      startTransition(() => { setSignedUrl(null); });
      return;
    }
    const doc = documents.find((d) => d.id === selectedDocId);
    if (!doc) return;

    let cancelled = false;
    startTransition(() => {
      setLoadingUrl(true);
      setSignedUrl(null);
    });
    getDocumentSignedUrlAction(schemeId, doc.id).then((result) => {
      if (cancelled) return;
      startTransition(() => {
        if (result.url) setSignedUrl(result.url);
        setLoadingUrl(false);
      });
    });
    return () => { cancelled = true; };
  }, [selectedDocId, schemeId, documents, startTransition]);

  const handleFilesReady = useCallback(
    async (files: File[], metadata: DocumentMetadata) => {
      setShowUploadModal(false);
      setUploading(true);
      setUploadProgress({ current: 0, total: files.length });
      setUploadErrors([]);

      const newDocIds: string[] = [];
      const errors: string[] = [];

      for (let i = 0; i < files.length; i++) {
        setUploadProgress({ current: i + 1, total: files.length });

        // Straight to storage through a one-time link the server issues; the
        // server then checks what arrived (S3).
        const staged = await stageUpload(schemeId, "library", files[i]);
        if ("error" in staged) {
          errors.push(`${files[i].name}: ${staged.error}`);
          continue;
        }
        const fd = new FormData();
        fd.append("uploadId", staged.uploadId);
        fd.append("category", metadata.category || "OTHER");
        fd.append("visibility", metadata.visibility || "ALL_MEMBERS");
        if (metadata.documentType) fd.append("documentType", metadata.documentType);
        if (metadata.strataPlan) fd.append("strataPlan", metadata.strataPlan);
        if (metadata.schedule) fd.append("schedule", metadata.schedule);
        if (metadata.lotNumber) fd.append("lotNumber", metadata.lotNumber);
        if (metadata.supplier) fd.append("supplier", metadata.supplier);
        if (metadata.comments) fd.append("comments", metadata.comments);

        const result = await uploadFileAction(schemeId, fd);
        if (result.id) {
          newDocIds.push(result.id);
        } else if (result.error) {
          errors.push(`${files[i].name}: ${result.error}`);
        }
      }

      setUploading(false);
      setUploadProgress(null);

      if (errors.length > 0) {
        setUploadErrors(errors);
      }

      // Refresh data
      startTransition(() => {
        router.refresh();
      });

      // Select the first uploaded doc for review
      if (newDocIds.length > 0) {
        setSelectedDocId(newDocIds[0]);
      }
    },
    [schemeId, router],
  );

  const handleUpdate = useCallback(
    async (data: Record<string, string>) => {
      if (!selectedDocId) return;
      const result = await updateDocumentMetadataAction(
        schemeId,
        selectedDocId,
        data,
      );
      if (result.error) {
        // Could add toast here
        console.error(result.error);
        return;
      }
      // Update local state
      setDocuments((prev) =>
        prev.map((d) =>
          d.id === selectedDocId
            ? {
                ...d,
                title: data.title || d.title,
                documentType: data.documentType || null,
                documentDate: data.documentDate || null,
                strataPlan: data.strataPlan || null,
                schedule: data.schedule || null,
                lotNumber: data.lotNumber || null,
                supplier: data.supplier || null,
                comments: data.comments || null,
                visibility: data.visibility || d.visibility,
              }
            : d,
        ),
      );
    },
    [schemeId, selectedDocId],
  );

  const handleRemove = useCallback(
    async (docId: string) => {
      const result = await removeDocumentAction(schemeId, docId);
      if (result.error) {
        console.error(result.error);
        return;
      }
      setDocuments((prev) => prev.filter((d) => d.id !== docId));
      if (selectedDocId === docId) {
        setSelectedDocId(null);
      }
      startTransition(() => {
        router.refresh();
      });
    },
    [schemeId, selectedDocId, router],
  );

  const selectedDoc = documents.find((d) => d.id === selectedDocId);

  const categoryLabels: Record<string, string> = {
    MINUTES: "Minutes",
    INSURANCE: "Insurance",
    BYLAW: "By-laws",
    FINANCIAL: "Financial",
    COMPLIANCE: "Compliance",
    OTHER: "Other",
  };

  const formatDate = (dateStr: string) => {
    return formatDateIn(timeZone, dateStr, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const formatSize = (bytes: number | null) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="font-heading font-semibold text-ink">
            Documents
          </h2>
          <p className="text-sm text-ink-muted">
            {documents.length === 0
              ? "No documents uploaded yet."
              : `${documents.length} document${documents.length === 1 ? "" : "s"} on file.`}
          </p>
        </div>
        <Button
          variant="primary"
          onClick={() => setShowUploadModal(true)}
          disabled={uploading}
        >
          Upload Documents
        </Button>
      </div>

      {/* Upload progress */}
      {uploading && uploadProgress && (
        <div className="mb-5 rounded-[var(--radius-card)] bg-mint-soft border border-mint px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-turquoise border-t-transparent" />
            <p className="text-sm font-medium text-turquoise">
              Uploading file {uploadProgress.current} of {uploadProgress.total}...
            </p>
          </div>
        </div>
      )}

      {/* Upload errors */}
      {uploadErrors.length > 0 && (
        <div className="mb-5 rounded-[var(--radius-card)] bg-red-50 border border-red-200 px-4 py-3">
          <div className="flex items-start gap-3">
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              className="flex-shrink-0 mt-0.5 text-red-500"
            >
              <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5" />
              <path d="M10 6v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <circle cx="10" cy="14" r="0.75" fill="currentColor" />
            </svg>
            <div className="flex-1">
              <p className="text-sm font-medium text-red-800 mb-1">
                {uploadErrors.length === 1 ? "Upload failed" : `${uploadErrors.length} uploads failed`}
              </p>
              {uploadErrors.map((err, i) => (
                <p key={i} className="text-xs text-red-700">{err}</p>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setUploadErrors([])}
              className="flex-shrink-0 text-red-400 hover:text-red-600 transition-colors p-1"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Document viewer (when a doc is selected) */}
      {selectedDoc && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <button
              type="button"
              onClick={() => setSelectedDocId(null)}
              className="text-sm text-turquoise hover:text-turquoise font-medium transition-colors"
            >
              &larr; Back to list
            </button>
          </div>
          {loadingUrl ? (
            <div className="flex items-center justify-center py-12 text-ink-muted">
              Loading document…
            </div>
          ) : signedUrl ? (
            <DocumentViewer
              document={selectedDoc}
              filePublicUrl={signedUrl}
              schemePlanNumber={schemePlanNumber}
              onUpdate={handleUpdate}
              onRemove={handleRemove}
            />
          ) : (
            <div className="flex items-center justify-center py-12 text-ink-muted">
              Unable to load document preview.
            </div>
          )}
          {vaultLabels && <VaultRecordPanel key={selectedDoc.id} schemeId={schemeId} documentId={selectedDoc.id} timeZone={timeZone} />}
        </div>
      )}

      {/* Document list (when no doc is selected) */}
      {!selectedDoc && documents.length > 0 && retention && (
        <p className="mb-2 text-xs text-ink-muted">
          Removing a document hides it from the library. StrataVerze keeps it as a record of the scheme. Records with a longer period (such as minor renovation approvals, 10 years) are kept longer than shown.
        </p>
      )}
      {!selectedDoc && documents.length > 0 && (
        <div className="flex flex-col gap-2">
          {documents.map((doc) => (
            <button
              key={doc.id}
              type="button"
              onClick={() => setSelectedDocId(doc.id)}
              className="flex items-center justify-between rounded-[var(--radius-card)] bg-muted px-4 py-3 hover:bg-muted/70 transition-colors text-left w-full"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink truncate">
                  {doc.title}
                </p>
                <p className="text-xs text-ink-muted">
                  {categoryLabels[doc.category] ?? doc.category}
                  {doc.documentType && ` · ${doc.documentType.replace(/_/g, " ")}`}
                  {" · "}
                  {formatDate(doc.createdAt)}
                  {doc.fileSize ? ` · ${formatSize(doc.fileSize)}` : ""}
                  {retention && (() => {
                    const until = keepUntil(doc.category, storedDayIn(timeZone, doc.documentDate ?? doc.createdAt), retention);
                    return until === "LIFE" ? " · kept for the life of the scheme" : ` · keep at least until ${until}`;
                  })()}
                </p>
                {vaultLabels?.[doc.id] && (
                  <span className="mt-1 block">
                    <VaultLabelChip {...vaultLabels[doc.id]} />
                  </span>
                )}
              </div>
              <span className="flex-shrink-0 ml-3 inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                {doc.fileName.split(".").pop()?.toUpperCase() ?? "FILE"}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!selectedDoc && documents.length === 0 && !uploading && (
        <div className="text-center py-12 rounded-[var(--radius-card)] border border-dashed border-line">
          <svg
            width="48"
            height="48"
            viewBox="0 0 48 48"
            fill="none"
            className="mx-auto mb-3 text-ink-muted"
          >
            <rect
              x="8"
              y="4"
              width="32"
              height="40"
              rx="4"
              stroke="currentColor"
              strokeWidth="2"
            />
            <path
              d="M16 16h16M16 24h16M16 32h8"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          <p className="text-sm font-medium text-ink mb-1">
            No documents yet
          </p>
          <p className="text-xs text-ink-muted mb-4">
            Upload documents to keep records for this scheme.
          </p>
          <Button
            variant="primary"
            onClick={() => setShowUploadModal(true)}
          >
            Upload Documents
          </Button>
        </div>
      )}

      {/* Upload modal */}
      <DocumentUploadModal
        open={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onFilesReady={handleFilesReady}
        schemePlanNumber={schemePlanNumber}
      />
    </div>
  );
}
