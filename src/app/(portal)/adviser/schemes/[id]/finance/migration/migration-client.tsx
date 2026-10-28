"use client";

import { useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { processMigrationAction, validateMigrationAction } from "./actions";
import {
  autoDetectMapping,
  buildImportRows,
  importFieldsFor,
  mappingProblem,
  parseCsvContent,
  type BuildingOnLotEntitlement,
  type BuildingSeparateEntitlement,
  type ImportDataType,
} from "@/lib/finance/migration-import-fields";

// ── Types ────────────────────────────────────────────────────────

type SourceSystem = "strata_master" | "stratamax" | "myob" | "xero";
type DataType = ImportDataType;
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
  /**
   * The second lot entitlement the building's lots hold (Queensland's interest
   * schedule, stage 2, step 10), from the server page: a required column of a
   * lots file. Null for NSW.
   */
  separateEntitlement?: BuildingSeparateEntitlement;
  /** The pack's heading for the entitlement on each lot (Victoria's "Lot Liability", stage 2, PR 4), or null. */
  onLotEntitlement?: BuildingOnLotEntitlement;
}

// ── Constants ────────────────────────────────────────────────────

const inputClasses =
  "w-full rounded-[var(--radius-card)] border border-line bg-white px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-turquoise focus:border-turquoise transition-colors";

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
  // Opening balances go through the cutover (migration/cutover), with the
  // trial balance check, the detail behind each control account and a sign-off.
];

interface TargetField {
  key: string;
  label: string;
  required: boolean;
}

/**
 * The fields a file of `dataType` maps, with the building's second lot
 * entitlement for lots where it holds one (stage 2, step 10). The columns, and
 * the keys each row is sent under, come from the shared table the server also
 * translates with (migration-import-fields).
 */
function targetFieldsFor(dataType: DataType, separate: BuildingSeparateEntitlement, onLot: BuildingOnLotEntitlement = null): readonly TargetField[] {
  return importFieldsFor(dataType, separate, onLot);
}

const STEP_LABELS: { step: MigrationStep; label: string }[] = [
  { step: "source", label: "Source" },
  { step: "data_type", label: "Data Type" },
  { step: "upload", label: "Upload" },
  { step: "mapping", label: "Mapping" },
  { step: "preview", label: "Preview" },
  { step: "result", label: "Result" },
];

// ── Component ────────────────────────────────────────────────────

export function MigrationClient({ schemeId, schemeName, separateEntitlement = null, onLotEntitlement = null }: MigrationClientProps) {
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
          const detected = autoDetectMapping(dataType, headers, separateEntitlement, onLotEntitlement);
          setColumnMapping(detected);
        }

        setStep("mapping");
      };
      reader.readAsText(file);
    },
    [dataType, separateEntitlement, onLotEntitlement],
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
    const fields = targetFieldsFor(dataType, separateEntitlement, onLotEntitlement);
    const missingRequired = fields.filter(
      (f) => f.required && !columnMapping[f.key],
    );

    if (missingRequired.length > 0) {
      setError(
        `Please map the required columns: ${missingRequired.map((f) => f.label).join(", ")}`,
      );
      return;
    }

    // One column read as two fields (lot entitlement as lot liability too) is refused.
    const doubled = mappingProblem(dataType, columnMapping, separateEntitlement, onLotEntitlement);
    if (doubled) {
      setError(doubled);
      return;
    }

    if (dataType === "opening_balances" && !cutoverDate) {
      setError("Please enter a cutover date for opening balances.");
      return;
    }

    // Build rows from CSV using the mapping, with the required field check
    const rows: MigrationRow[] = buildImportRows(
      dataType,
      csvHeaders,
      csvRows,
      columnMapping,
      separateEntitlement,
      onLotEntitlement,
    );

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
                    isComplete ? "bg-turquoise" : "bg-line"
                  }`}
                  aria-hidden="true"
                />
              )}
              <div className="flex items-center gap-1.5">
                <div
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                    isActive
                      ? "bg-turquoise text-white"
                      : isComplete
                        ? "bg-mint-soft text-turquoise"
                        : "bg-muted text-ink-muted"
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
                      ? "font-medium text-ink"
                      : "text-ink-muted"
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
          className="rounded-[var(--radius-card)] bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700"
          role="alert"
        >
          {error}
        </div>
      )}

      {/* Step 1: Select source system */}
      {step === "source" && (
        <div className="space-y-4">
          <p className="text-sm text-ink-muted">
            Select the system you are migrating data from for{" "}
            <span className="font-medium text-ink">{schemeName}</span>.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {SOURCE_SYSTEMS.map((sys) => (
              <button
                key={sys.id}
                type="button"
                onClick={() => handleSelectSource(sys.id)}
                className={`rounded-[var(--radius-card)] border-2 p-5 text-left transition-colors hover:border-turquoise hover:bg-mint-soft/50 ${
                  sourceSystem === sys.id
                    ? "border-turquoise bg-mint-soft/50"
                    : "border-line bg-white"
                }`}
              >
                <h3 className="text-sm font-semibold text-ink">
                  {sys.name}
                </h3>
                <p className="mt-1 text-xs text-ink-muted">
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
          <p className="text-sm text-ink-muted">
            What data would you like to import from{" "}
            <span className="font-medium text-ink">
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
                className={`rounded-[var(--radius-card)] border-2 p-5 text-left transition-colors hover:border-turquoise hover:bg-mint-soft/50 ${
                  dataType === dt.id
                    ? "border-turquoise bg-mint-soft/50"
                    : "border-line bg-white"
                }`}
              >
                <h3 className="text-sm font-semibold text-ink">
                  {dt.name}
                </h3>
                <p className="mt-1 text-xs text-ink-muted">
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
            <div className="text-sm text-ink-muted space-y-2">
              <p className="font-medium text-ink">File requirements:</p>
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
              className="rounded-[var(--radius-card)] border-2 border-dashed border-line p-8 text-center transition-colors hover:border-turquoise"
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
                className="mx-auto h-10 w-10 text-ink-muted"
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
              <p className="mt-3 text-sm text-ink-muted">
                Drag and drop your CSV file here, or click to browse
              </p>
              <input
                id="migration-file-input"
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="mt-3 block w-full text-sm text-ink-muted file:mr-4 file:py-2 file:px-4 file:rounded-[var(--radius-card)] file:border-0 file:text-sm file:font-medium file:bg-mint-soft file:text-turquoise hover:file:bg-mint-soft cursor-pointer"
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
              <p className="mb-2 text-xs font-medium text-ink-muted uppercase tracking-wide">
                CSV Preview (first 3 rows)
              </p>
              <div className="overflow-x-auto rounded-[var(--radius-card)] border border-line">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="bg-muted/30">
                      {csvHeaders.map((h, i) => (
                        <th
                          key={i}
                          className="px-3 py-2 text-left text-xs font-medium text-ink-muted uppercase"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {csvRows.slice(0, 3).map((row, idx) => (
                      <tr key={idx}>
                        {row.map((cell, ci) => (
                          <td key={ci} className="px-3 py-2 text-ink">
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
              <p className="mb-3 text-xs font-medium text-ink-muted uppercase tracking-wide">
                Column Mapping
              </p>
              <div className="space-y-3">
                {targetFieldsFor(dataType, separateEntitlement, onLotEntitlement).map((field) => (
                  <div
                    key={field.key}
                    className="flex items-center gap-4"
                  >
                    <label
                      htmlFor={`mapping-${field.key}`}
                      className="w-40 shrink-0 text-sm text-ink"
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
                  className="w-40 shrink-0 text-sm text-ink"
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
            <div className="rounded-[var(--radius-card)] border border-line bg-white p-4">
              <p className="text-xs font-medium text-ink-muted uppercase tracking-wide">
                Total Rows
              </p>
              <p className="mt-1 text-2xl font-semibold text-ink">
                {migrationRows.length}
              </p>
            </div>
            <div className="rounded-[var(--radius-card)] border border-line bg-white p-4">
              <p className="text-xs font-medium text-ink-muted uppercase tracking-wide">
                Valid
              </p>
              <p className="mt-1 text-2xl font-semibold text-green-600">
                {validRowCount}
              </p>
            </div>
            <div className="rounded-[var(--radius-card)] border border-line bg-white p-4">
              <p className="text-xs font-medium text-ink-muted uppercase tracking-wide">
                Errors
              </p>
              <p
                className={`mt-1 text-2xl font-semibold ${errorRowCount > 0 ? "text-red-600" : "text-ink"}`}
              >
                {errorRowCount}
              </p>
            </div>
          </div>

          {warningRowCount > 0 && (
            <div className="rounded-[var(--radius-card)] bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
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
                  <tr className="bg-muted/30 border-b border-line">
                    <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-ink-muted uppercase">
                      Row
                    </th>
                    {targetFieldsFor(dataType, separateEntitlement, onLotEntitlement).map((field) => (
                      <th
                        key={field.key}
                        className="px-3 py-2 text-left text-xs font-medium text-ink-muted uppercase"
                      >
                        {field.label}
                      </th>
                    ))}
                    <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-ink-muted uppercase">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
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
                        <td className="px-3 py-2 text-ink-muted tabular-nums">
                          {row.rowNumber}
                        </td>
                        {targetFieldsFor(dataType, separateEntitlement, onLotEntitlement).map((field) => (
                          <td
                            key={field.key}
                            className="px-3 py-2 text-ink"
                          >
                            {row.data[field.key] || (
                              <span className="text-ink-muted">--</span>
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
                <div className="px-4 py-3 text-xs text-ink-muted border-t border-line">
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
            <div className="rounded-[var(--radius-card)] bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
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
                <span className="text-ink-muted">Total rows in file</span>
                <span className="font-medium text-ink tabular-nums">
                  {importResult.total}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-ink-muted">
                  Successfully imported
                </span>
                <span className="font-medium text-green-600 tabular-nums">
                  {importResult.created}
                </span>
              </div>
              {importResult.skipped > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-ink-muted">
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
