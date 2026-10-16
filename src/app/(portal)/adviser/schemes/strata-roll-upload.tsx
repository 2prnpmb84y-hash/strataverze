"use client";

import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { parseStrataRollAction, type StrataRollParseResult } from "./actions";
import type { ParsedStrataRoll } from "@/lib/parse-strata-roll";

type UploadState = "idle" | "selected" | "uploading" | "success" | "error";

export function StrataRollUpload({
  onParsed,
  onSkip,
}: {
  onParsed: (data: ParsedStrataRoll) => void;
  onSkip: () => void;
}) {
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = useCallback((file: File): string | null => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "pdf" && ext !== "docx") {
      return "Only .pdf and .docx files are supported.";
    }
    if (file.size > 30 * 1024 * 1024) {
      return "File must be smaller than 30 MB.";
    }
    return null;
  }, []);

  const handleFileSelect = useCallback(
    (file: File) => {
      const validationError = validateFile(file);
      if (validationError) {
        setError(validationError);
        setUploadState("error");
        return;
      }
      setSelectedFile(file);
      setError(null);
      setUploadState("selected");
    },
    [validateFile],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        handleFileSelect(files[0]);
      }
    },
    [handleFileSelect],
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        handleFileSelect(files[0]);
      }
    },
    [handleFileSelect],
  );

  const handleUpload = useCallback(async () => {
    if (!selectedFile) return;

    setUploadState("uploading");
    setError(null);

    const formData = new FormData();
    formData.append("strataRoll", selectedFile);

    try {
      const result: StrataRollParseResult =
        await parseStrataRollAction(formData);

      if (result.success && result.data) {
        // Check if meaningful data was extracted
        const s = result.data.scheme;
        const fieldsFound = [
          s.name,
          s.planNumber,
          s.address,
          s.suburb,
          s.state,
          s.postcode,
          s.abnNumber,
          s.totalLots,
          s.totalEntitlement,
        ].filter((v) => v != null).length;

        if (fieldsFound < 2 && result.data.lots.length === 0) {
          // Very little was extracted — warn but still allow proceeding
          setError(
            `Only ${fieldsFound} field(s) could be extracted from this document. ` +
            "You may need to fill in the remaining details manually.",
          );
          setUploadState("error");
          // Still pass the data through so any extracted fields populate
          onParsed(result.data);
        } else {
          setUploadState("success");
          onParsed(result.data);
        }
      } else {
        setError(result.error ?? "Failed to parse the strata roll.");
        setUploadState("error");
      }
    } catch {
      setError("An unexpected error occurred. Please try again.");
      setUploadState("error");
    }
  }, [selectedFile, onParsed]);

  const handleRemoveFile = useCallback(() => {
    setSelectedFile(null);
    setError(null);
    setUploadState("idle");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <Card>
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-heading font-semibold text-foreground">
          Strata Roll Upload
        </h2>
      </div>
      <p className="text-sm text-muted-foreground mb-6">
        Upload a strata roll document to automatically populate the scheme
        details, or skip to enter them manually.
      </p>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 cursor-pointer transition-colors ${
          isDragging
            ? "border-primary-400 bg-primary-50"
            : selectedFile
              ? "border-primary-300 bg-primary-50/50"
              : "border-border hover:border-primary-300 hover:bg-muted/50"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx"
          onChange={handleInputChange}
          className="sr-only"
        />

        {selectedFile ? (
          <div className="flex items-center gap-3">
            {/* File icon */}
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary-100 text-primary-500">
              <svg
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6l-4-4Z" />
                <path d="M12 2v4h4" />
              </svg>
            </div>
            <div className="text-left">
              <p className="text-sm font-medium text-foreground">
                {selectedFile.name}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatFileSize(selectedFile.size)}
              </p>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleRemoveFile();
              }}
              className="ml-2 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label="Remove file"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              >
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </button>
          </div>
        ) : (
          <>
            {/* Upload icon */}
            <div className="mb-3 text-muted-foreground">
              <svg
                width="32"
                height="32"
                viewBox="0 0 32 32"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M16 22V10" />
                <path d="M10 16l6-6 6 6" />
                <path d="M28 22v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-4" />
              </svg>
            </div>
            <p className="text-sm text-foreground font-medium mb-1">
              Drag and drop your documents
            </p>
          </>
        )}
      </div>

      {/* File info */}
      <div className="mt-3 flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">
            File format supported: .docx, .pdf
          </p>
          <p className="text-xs text-muted-foreground">
            Max file size: 30MB
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between mt-6 pt-6 border-t border-border">
        <Button type="button" variant="ghost" onClick={onSkip}>
          Skip &mdash; enter manually
        </Button>
        <Button
          type="button"
          onClick={handleUpload}
          disabled={!selectedFile || uploadState === "uploading"}
        >
          {uploadState === "uploading" ? (
            <>
              <svg
                className="animate-spin -ml-0.5 h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Parsing...
            </>
          ) : (
            <>
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M8 12V4" />
                <path d="M4 8l4-4 4 4" />
              </svg>
              Upload
            </>
          )}
        </Button>
      </div>
    </Card>
  );
}
