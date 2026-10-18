"use client";

import { useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { processMigrationAction, validateMigrationAction } from "./actions";

// ── Types ────────────────────────────────────────────────────────

type SourceSystem = "strata_master" | "stratamax" | "myob" | "xero";
type DataType = "lots" | "chart_of_accounts" | "opening_balances";
type MigrationStep =
  | "source"
  | "data_type"
  | "upload"
  | "mapping"
  | "preview"
  | "result";

interface MigrationRow {
  rowNumber: number;
  data: Record<string, string>;
  errors: string[];
  warnings: string[];
}

interface MigrationClientProps {
  schemeId: string;
  schemeName: string;
}

// ── Constants ────────────────────────────────────────────────────

const inputClasses =
  "w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-400 transition-colors";

const SOURCE_SYSTEMS: {
  id: SourceSystem;
  name: string;
  description: string;
}[] = [
  {
    id: "strata_master",
    name: "Strata Master",
    description:
      "Import data from Strata Master including lots, chart of accounts and opening balances.",
  },
  {
    id: "stratamax",
    name: "StrataMax",
    description:
      "Import data from StrataMax with support for their standard export formats.",
  },
  {
    id: "myob",
    name: "MYOB",
    description:
      "Import chart of accounts and opening balances from MYOB AccountRight or Essentials.",
  },
  {
    id: "xero",
    name: "Xero",
    description:
      "Import chart of accounts and opening balances from Xero accounting.",
  },
];

const DATA_TYPES: {
  id: DataType;
  name: string;
  description: string;
}[] = [
  {
    id: "lots",
    name: "Lots & Units",
    description:
      "Import lot numbers, unit entitlements, floor areas and lot types from the source system.",
  },
  {
    id: "chart_of_accounts",
    name: "Chart of Accounts",
    description:
      "Import account codes, names, types and fund assignments from the source system.",
  },
  {
    id: "opening_balances",
    name: "Opening Balances",
    description:
      "Import opening debit and credit balances at the cutover date for each account.",
  },
];

interface TargetField {
  key: string;
  label: string;
  required: boolean;
}

const TARGET_FIELDS: Record<DataType, TargetField[]> = {
  lots: [
    { key: "lot_number", label: "Lot Number", required: true },
    { key: "unit_number", label: "Unit Number", required: false },
    { key: "entitlement", label: "Entitlement", required: true },
    { key: "floor_area", label: "Floor Area", required: false },
    { key: "lot_type", label: "Lot Type", required: false },
  ],
  chart_of_accounts: [
    { key: "account_code", label: "Account Code", required: true },
    { key: "account_name", label: "Account Name", required: true },
    { key: "account_type", label: "Account Type", required: true },
    { key: "sub_type", label: "Sub Type", required: false },
    { key: "fund_name", label: "Fund Name", required: false },
  ],
  opening_balances: [
    { key: "account_code", label: "Account Code", required: true },
    { key: "debit", label: "Debit", required: false },
    { key: "credit", label: "Credit", required: false },
    { key: "fund_name", label: "Fund Name", required: false },
    { key: "description", label: "Description", required: false },
  ],
};

const STEP_LABELS: { step: MigrationStep; label: string }[] = [
  { step: "source", label: "Source" },
  { step: "data_type", label: "Data Type" },
  { step: "upload", label: "Upload" },
  { step: "mapping", label: "Mapping" },
  { step: "preview", label: "Preview" },
  { step: "result", label: "Result" },
];

// ── CSV helpers ──────────────────────────────────────────────────

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCsvContent(content: string): {
  headers: string[];
  rows: string[][];
} {
  const lines = content
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);

  if (lines.length < 2) {
    return { headers: [], rows: [] };
  }

  const headers = parseCSVLine(lines[0]);
  const rows = lines.slice(1).map(parseCSVLine);
  return { headers, rows };
}

function autoDetectMapping(
  headers: string[],
  fields: TargetField[],
): Record<string, string> {
  const mapping: Record<string, string> = {};

  for (const field of fields) {
    const fieldWords = field.key.split("_");
    const match = headers.find((h) => {
      const lower = h.toLowerCase().replace(/[^a-z0-9]/g, " ").trim();
      return fieldWords.every((word) => lower.includes(word));
    });
    if (match) {
      mapping[field.key] = match;
    }
  }

  return mapping;
}

// ── Component ────────────────────────────────────────────────────

export function MigrationClient({ schemeId, schemeName }: MigrationClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Wizard state
  const [step, setStep] = useState<MigrationStep>("source");
  const [sourceSystem, setSourceSystem] = useState<SourceSystem | null>(null);
  const [dataType, setDataType] = useState<DataType | null>(null);
  const [error, setError] = useState<string>();

  // File / CSV state
  const [fileName, setFileName] = useState<string>();
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>(
    {},
  );

  // Opening balances cutover date
  const [cutoverDate, setCutoverDate] = useState("");

  // Validated rows for preview
  const [migrationRows, setMigrationRows] = useState<MigrationRow[]>([]);

  // Import result
  const [importResult, setImportResult] = useState<{
    created: number;
    total: number;
    skipped: number;
  }>();

  // ── Helpers ──────────────────────────────────────────────────

  const currentStepIndex = STEP_LABELS.findIndex((s) => s.step === step);

  function resetWizard() {
    setStep("source");
    setSourceSystem(null);
    setDataType(null);
    setError(undefined);
    setFileName(undefined);
    setCsvHeaders([]);
    setCsvRows([]);
    setColumnMapping({});
    setCutoverDate("");
    setMigrationRows([]);
    setImportResult(undefined);
  }

  // ── Step handlers ────────────────────────────────────────────

  function handleSelectSource(source: SourceSystem) {
    setSourceSystem(source);
    setError(undefined);
    setStep("data_type");
  }

  function handleSelectDataType(dt: DataType) {
    setDataType(dt);
    setError(undefined);
    setStep("upload");
  }

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setError(undefined);
      const file = e.target.files?.[0];
      if (!file) return;

      if (!file.name.toLowerCase().endsWith(".csv")) {
        setError("Please upload a CSV (.csv) file.");
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        if (!content) {
          setError("Could not read the file.");
          return;
        }

        const { headers, rows } = parseCsvContent(content);

        if (headers.length === 0 || rows.length === 0) {
          setError(
            "CSV file must have a header row and at least one data row.",
          );
          return;
        }

        setFileName(file.name);
        setCsvHeaders(headers);
        setCsvRows(rows);

        // Auto-detect column mappings
        if (dataType) {
          const detected = autoDetectMapping(
            headers,
            TARGET_FIELDS[dataType],
          );
          setColumnMapping(detected);
        }

        setStep("mapping");
      };
      reader.readAsText(file);
    },
    [dataType],
  );

  function handleFileDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;

    // Simulate the same handler by creating a synthetic event
    const input = document.createElement("input");
    input.type = "file";
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;

    handleFileUpload({
      target: input,
    } as unknown as React.ChangeEvent<HTMLInputElement>);
  }

  function handleProceedToPreview() {
    if (!dataType) return;
    setError(undefined);

    // Check required mappings
    const fields = TARGET_FIELDS[dataType];
    const missingRequired = fields.filter(
      (f) => f.required && !columnMapping[f.key],
    );

    if (missingRequired.length > 0) {
      setError(
        `Please map the required columns: ${missingRequired.map((f) => f.label).join(", ")}`,
      );
      return;
    }

    if (dataType === "opening_balances" && !cutoverDate) {
      setError("Please enter a cutover date for opening balances.");
      return;
    }

    // Build rows from CSV using the mapping
    const rows: MigrationRow[] = csvRows.map((csvRow, idx) => {
      const data: Record<string, string> = {};

      for (const field of fields) {
        const sourceHeader = columnMapping[field.key];
        if (sourceHeader) {
          const colIndex = csvHeaders.indexOf(sourceHeader);
          data[field.key] = colIndex >= 0 ? (csvRow[colIndex] ?? "") : "";
        }
      }

      // Client-side validation
      const errors: string[] = [];
      const warnings: string[] = [];

      for (const field of fields) {
        if (field.required && !data[field.key]?.trim()) {
          errors.push(`${field.label} is required`);
        }
      }

      return {
        rowNumber: idx + 2, // +2 for 1-indexed + header row
        data,
        errors,
        warnings,
      };
    });

    setMigrationRows(rows);

    // Run server-side validation
    startTransition(async () => {
      const result = await validateMigrationAction(schemeId, dataType, rows);

      if (result.error) {
        setError(result.error);
        return;
      }

      if (result.data?.rows) {
        setMigrationRows(
          result.data.rows as unknown as MigrationRow[],
        );
      }

      setStep("preview");
    });
  }

  function handleImport() {
    if (!dataType || !sourceSystem) return;
    setError(undefined);

    startTransition(async () => {
      const result = await processMigrationAction(
        schemeId,
        sourceSystem,
        dataType,
        migrationRows,
        dataType === "opening_balances" ? cutoverDate : undefined,
      );

      if (result.error) {
        setError(result.error);
        return;
      }

      setImportResult({
        created: (result.data?.created as number) ?? 0,
        total: (result.data?.total as number) ?? 0,
        skipped: (result.data?.skipped as number) ?? 0,
      });
      setStep("result");
    });
  }

  // ── Derived state ────────────────────────────────────────────

  const validRowCount = migrationRows.filter(
    (r) => r.errors.length === 0,
  ).length;
  const errorRowCount = migrationRows.filter(
    (r) => r.errors.length > 0,
  ).length;
  const warningRowCount = migrationRows.filter(
    (r) => r.warnings.length > 0,
  ).length;

  // ── Render ───────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <nav aria-label="Migration progress" className="flex items-center gap-2">
        {STEP_LABELS.map((s, i) => {
          const isActive = i === currentStepIndex;
          const isComplete = i < currentStepIndex;

          return (
            <div key={s.step} className="flex items-center gap-2">
              {i > 0 && (
                <div
                  className={`h-px w-6 ${
                    isComplete ? "bg-primary-500" : "bg-border"
                  }`}
                  aria-hidden="true"
                />
              )}
              <div className="flex items-center gap-1.5">
                <div
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                    isActive
                      ? "bg-primary-500 text-white"
                      : isComplete
                        ? "bg-primary-100 text-primary-700"
                        : "bg-muted text-muted-foreground"
                  }`}
                  aria-current={isActive ? "step" : undefined}
                >
                  {isComplete ? (
                    <svg
                      className="h-3.5 w-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.5}
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  ) : (
                    i + 1
                  )}
                </div>
                <span
                  className={`hidden text-xs sm:inline ${
                    isActive
                      ? "font-medium text-foreground"
                      : "text-muted-foreground"
                  }`}
                >
                  {s.label}
                </span>
              </div>
            </div>
          );
        })}
      </nav>

      {/* Error banner */}
      {error && (
        <div
          className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700"
          role="alert"
        >
          {error}
        </div>
      )}

      {/* Step 1: Select source system */}
      {step === "source" && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Select the system you are migrating data from for{" "}
            <span className="font-medium text-foreground">{schemeName}</span>.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {SOURCE_SYSTEMS.map((sys) => (
              <button
                key={sys.id}
                type="button"
                onClick={() => handleSelectSource(sys.id)}
                className={`rounded-xl border-2 p-5 text-left transition-colors hover:border-primary-400 hover:bg-primary-50/50 ${
                  sourceSystem === sys.id
                    ? "border-primary-500 bg-primary-50/50"
                    : "border-border bg-card"
                }`}
              >
                <h3 className="text-sm font-semibold text-foreground">
                  {sys.name}
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {sys.description}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 2: Select data type */}
      {step === "data_type" && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            What data would you like to import from{" "}
            <span className="font-medium text-foreground">
              {SOURCE_SYSTEMS.find((s) => s.id === sourceSystem)?.name}
            </span>
            ?
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {DATA_TYPES.map((dt) => (
              <button
                key={dt.id}
                type="button"
                onClick={() => handleSelectDataType(dt.id)}
                className={`rounded-xl border-2 p-5 text-left transition-colors hover:border-primary-400 hover:bg-primary-50/50 ${
                  dataType === dt.id
                    ? "border-primary-500 bg-primary-50/50"
                    : "border-border bg-card"
                }`}
              >
                <h3 className="text-sm font-semibold text-foreground">
                  {dt.name}
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {dt.description}
                </p>
              </button>
            ))}
          </div>
          <Button
            variant="secondary"
            onClick={() => {
              setStep("source");
              setError(undefined);
            }}
          >
            Back
          </Button>
        </div>
      )}

      {/* Step 3: Upload CSV */}
      {step === "upload" && (
        <Card>
          <CardHeader
            title="Upload CSV File"
            description={`Upload a CSV export from ${SOURCE_SYSTEMS.find((s) => s.id === sourceSystem)?.name ?? "your source system"} containing ${DATA_TYPES.find((d) => d.id === dataType)?.name.toLowerCase() ?? "data"}.`}
          />
          <div className="px-6 pb-6 space-y-4">
            <div className="text-sm text-muted-foreground space-y-2">
              <p className="font-medium text-foreground">File requirements:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>CSV format with a header row</li>
                <li>
                  Column headers should match the expected fields where possible
                </li>
                <li>
                  You can map columns manually in the next step if headers
                  differ
                </li>
              </ul>
            </div>

            <div
              className="rounded-xl border-2 border-dashed border-border p-8 text-center transition-colors hover:border-primary-400"
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleFileDrop}
              role="button"
              tabIndex={0}
              aria-label="Drop CSV file here or click to browse"
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  document.getElementById("migration-file-input")?.click();
                }
              }}
            >
              <svg
                className="mx-auto h-10 w-10 text-muted-foreground"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                />
              </svg>
              <p className="mt-3 text-sm text-muted-foreground">
                Drag and drop your CSV file here, or click to browse
              </p>
              <input
                id="migration-file-input"
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="mt-3 block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100 cursor-pointer"
              />
            </div>

            <Button
              variant="secondary"
              onClick={() => {
                setStep("data_type");
                setError(undefined);
              }}
            >
              Back
            </Button>
          </div>
        </Card>
      )}

      {/* Step 4: Column mapping */}
      {step === "mapping" && dataType && (
        <Card>
          <CardHeader
            title="Map Columns"
            description={`Map columns from your CSV file (${fileName ?? "uploaded file"}) to the target fields. Required fields are marked with an asterisk.`}
          />
          <div className="px-6 pb-6 space-y-6">
            {/* CSV preview */}
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                CSV Preview (first 3 rows)
              </p>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="bg-muted/30">
                      {csvHeaders.map((h, i) => (
                        <th
                          key={i}
                          className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {csvRows.slice(0, 3).map((row, idx) => (
                      <tr key={idx}>
                        {row.map((cell, ci) => (
                          <td key={ci} className="px-3 py-2 text-foreground">
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mapping fields */}
            <div>
              <p className="mb-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Column Mapping
              </p>
              <div className="space-y-3">
                {TARGET_FIELDS[dataType].map((field) => (
                  <div
                    key={field.key}
                    className="flex items-center gap-4"
                  >
                    <label
                      htmlFor={`mapping-${field.key}`}
                      className="w-40 shrink-0 text-sm text-foreground"
                    >
                      {field.label}
                      {field.required && (
                        <span
                          className="ml-1 text-red-500"
                          aria-label="required"
                        >
                          *
                        </span>
                      )}
                    </label>
                    <select
                      id={`mapping-${field.key}`}
                      value={columnMapping[field.key] ?? ""}
                      onChange={(e) =>
                        setColumnMapping({
                          ...columnMapping,
                          [field.key]: e.target.value,
                        })
                      }
                      className={inputClasses}
                      aria-required={field.required}
                    >
                      <option value="">
                        {field.required
                          ? "Select a column..."
                          : "None (skip)"}
                      </option>
                      {csvHeaders.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            {/* Cutover date for opening balances */}
            {dataType === "opening_balances" && (
              <div className="flex items-center gap-4">
                <label
                  htmlFor="cutover-date"
                  className="w-40 shrink-0 text-sm text-foreground"
                >
                  Cutover Date
                  <span className="ml-1 text-red-500" aria-label="required">
                    *
                  </span>
                </label>
                <input
                  id="cutover-date"
                  type="date"
                  value={cutoverDate}
                  onChange={(e) => setCutoverDate(e.target.value)}
                  className={inputClasses}
                  required
                  aria-required="true"
                />
              </div>
            )}

            <div className="flex gap-3">
              <Button
                variant="primary"
                onClick={handleProceedToPreview}
                disabled={isPending}
              >
                {isPending ? "Validating..." : "Continue"}
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setStep("upload");
                  setError(undefined);
                }}
                disabled={isPending}
              >
                Back
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Step 5: Preview */}
      {step === "preview" && dataType && (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Total Rows
              </p>
              <p className="mt-1 text-2xl font-semibold text-foreground">
                {migrationRows.length}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Valid
              </p>
              <p className="mt-1 text-2xl font-semibold text-green-600">
                {validRowCount}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Errors
              </p>
              <p
                className={`mt-1 text-2xl font-semibold ${errorRowCount > 0 ? "text-red-600" : "text-foreground"}`}
              >
                {errorRowCount}
              </p>
            </div>
          </div>

          {warningRowCount > 0 && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
              {warningRowCount} row{warningRowCount !== 1 ? "s have" : " has"}{" "}
              warnings. These rows will still be imported but may need review.
            </div>
          )}

          {/* Data table */}
          <Card>
            <CardHeader
              title="Preview Data"
              description={`Showing ${migrationRows.length} rows. Rows with errors (highlighted) will be skipped during import.`}
            />
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-muted/30 border-b border-border">
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">
                      Row
                    </th>
                    {TARGET_FIELDS[dataType].map((field) => (
                      <th
                        key={field.key}
                        className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase"
                      >
                        {field.label}
                      </th>
                    ))}
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {migrationRows.slice(0, 100).map((row) => {
                    const hasErrors = row.errors.length > 0;
                    const hasWarnings = row.warnings.length > 0;

                    return (
                      <tr
                        key={row.rowNumber}
                        className={
                          hasErrors
                            ? "bg-red-50/50"
                            : hasWarnings
                              ? "bg-amber-50/50"
                              : ""
                        }
                      >
                        <td className="px-3 py-2 text-muted-foreground tabular-nums">
                          {row.rowNumber}
                        </td>
                        {TARGET_FIELDS[dataType].map((field) => (
                          <td
                            key={field.key}
                            className="px-3 py-2 text-foreground"
                          >
                            {row.data[field.key] || (
                              <span className="text-muted-foreground">--</span>
                            )}
                          </td>
                        ))}
                        <td className="px-3 py-2">
                          {hasErrors ? (
                            <span
                              className="text-xs text-red-600"
                              title={row.errors.join("; ")}
                            >
                              {row.errors.join("; ")}
                            </span>
                          ) : hasWarnings ? (
                            <span
                              className="text-xs text-amber-600"
                              title={row.warnings.join("; ")}
                            >
                              {row.warnings.join("; ")}
                            </span>
                          ) : (
                            <span className="text-xs text-green-600">
                              Valid
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {migrationRows.length > 100 && (
                <div className="px-4 py-3 text-xs text-muted-foreground border-t border-border">
                  Showing first 100 of {migrationRows.length} rows.
                </div>
              )}
            </div>
          </Card>

          <div className="flex gap-3">
            <Button
              variant="primary"
              onClick={handleImport}
              disabled={isPending || validRowCount === 0}
            >
              {isPending
                ? "Importing..."
                : `Import ${validRowCount} Row${validRowCount !== 1 ? "s" : ""}`}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setStep("mapping");
                setError(undefined);
              }}
              disabled={isPending}
            >
              Back to Mapping
            </Button>
          </div>
        </>
      )}

      {/* Step 6: Result */}
      {step === "result" && importResult && (
        <Card>
          <CardHeader title="Import Complete" />
          <div className="px-6 pb-6 space-y-4">
            <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
              Successfully imported{" "}
              <span className="font-semibold">{importResult.created}</span>{" "}
              {dataType === "lots"
                ? "lot"
                : dataType === "chart_of_accounts"
                  ? "account"
                  : "balance"}
              {importResult.created !== 1 ? "s" : ""}.
              {importResult.skipped > 0 && (
                <span>
                  {" "}
                  {importResult.skipped} row
                  {importResult.skipped !== 1 ? "s were" : " was"} skipped due
                  to errors.
                </span>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total rows in file</span>
                <span className="font-medium text-foreground tabular-nums">
                  {importResult.total}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  Successfully imported
                </span>
                <span className="font-medium text-green-600 tabular-nums">
                  {importResult.created}
                </span>
              </div>
              {importResult.skipped > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    Skipped (errors)
                  </span>
                  <span className="font-medium text-red-600 tabular-nums">
                    {importResult.skipped}
                  </span>
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                variant="primary"
                onClick={() =>
                  router.push(`/adviser/schemes/${schemeId}/finance`)
                }
              >
                Back to Finance
              </Button>
              <Button variant="secondary" onClick={resetWizard}>
                Import More Data
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
