"use client";

import { useState, useTransition, useCallback, useMemo } from "react";
import { Card, CardHeader } from "@/components/ui/card";
import { SelectField } from "@/components/ui/form-field";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { importBankTransactionsAction } from "../actions";
import { parseCSVLine, parseDate, parseOFX } from "@/lib/bank-import-parser";
import type { ParsedTransaction } from "@/lib/bank-import-parser";
import { applySavedMapping, parseMoneyCell, parseSavedMapping, toSavedMapping } from "@/lib/finance/csv-mapping";
import { checkRunningBalance } from "@/lib/finance/reconciliation";
import { saveCsvMappingAction } from "@/lib/actions/reconciliation";

interface BankAccount {
  id: string;
  accountName: string;
  bsb: string;
  accountNumber: string;
}

type ImportStep = "select" | "upload" | "mapping" | "preview" | "result";

interface ColumnMapping {
  date: number;
  description: number;
  amount: number | null; // single amount column
  debit: number | null; // separate debit column
  credit: number | null; // separate credit column
  balance: number | null;
  reference: number | null;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(value);
}

export function BankImportForm({
  schemeId,
  bankAccounts,
  savedMappings = {},
  lastBalances = {},
}: {
  schemeId: string;
  bankAccounts: BankAccount[];
  /** Saved CSV mapping (JSON) per bank account id. */
  savedMappings?: Record<string, string | null>;
  /** The latest imported statement balance per bank account id. */
  lastBalances?: Record<string, { cents: number; date: string } | null>;
}) {
  const [usedSavedMapping, setUsedSavedMapping] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [step, setStep] = useState<ImportStep>("select");
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [fileType, setFileType] = useState<"csv" | "ofx">("csv");
  const [error, setError] = useState<string>();

  // CSV-specific state
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({
    date: 0,
    description: 1,
    amount: null,
    debit: null,
    credit: null,
    balance: null,
    reference: null,
  });
  const [amountFormat, setAmountFormat] = useState<"single" | "split">(
    "single",
  );

  // Parsed transactions ready for import
  const [transactions, setTransactions] = useState<ParsedTransaction[]>([]);

  // Import result
  const [importResult, setImportResult] = useState<{
    imported: number;
    duplicates: number;
  }>();

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setError(undefined);
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        if (!content) {
          setError("Could not read the file.");
          return;
        }

        const ext = file.name.toLowerCase();
        if (ext.endsWith(".ofx") || ext.endsWith(".qfx")) {
          setFileType("ofx");
          const parsed = parseOFX(content);
          if (parsed.length === 0) {
            setError(
              "No transactions found in the OFX file. Please check the file format.",
            );
            return;
          }
          setTransactions(parsed);
          setStep("preview");
        } else if (ext.endsWith(".csv")) {
          setFileType("csv");
          const lines = content
            .split(/\r?\n/)
            .filter((line) => line.trim().length > 0);
          if (lines.length < 2) {
            setError("CSV file must have a header row and at least one data row.");
            return;
          }
          const headers = parseCSVLine(lines[0]);
          const rows = lines.slice(1).map(parseCSVLine);
          setCsvHeaders(headers);
          setCsvRows(rows);

          // Auto-detect columns
          const autoMapping: ColumnMapping = {
            date: 0,
            description: 1,
            amount: null,
            debit: null,
            credit: null,
            balance: null,
            reference: null,
          };

          headers.forEach((h, i) => {
            const lower = h.toLowerCase().trim();
            if (lower.includes("date")) autoMapping.date = i;
            else if (
              lower.includes("desc") ||
              lower.includes("narration") ||
              lower.includes("narrative") ||
              lower.includes("particular")
            )
              autoMapping.description = i;
            else if (lower === "amount" || lower === "value")
              autoMapping.amount = i;
            else if (lower.includes("debit") || lower === "dr")
              autoMapping.debit = i;
            else if (lower.includes("credit") || lower === "cr")
              autoMapping.credit = i;
            else if (lower.includes("balance")) autoMapping.balance = i;
            else if (
              lower.includes("ref") ||
              lower.includes("cheque") ||
              lower.includes("check")
            )
              autoMapping.reference = i;
          });

          // Determine if split or single amount
          if (
            autoMapping.debit !== null &&
            autoMapping.credit !== null
          ) {
            setAmountFormat("split");
            autoMapping.amount = null;
          } else if (autoMapping.amount !== null) {
            setAmountFormat("single");
            autoMapping.debit = null;
            autoMapping.credit = null;
          } else {
            // Default: assume column 2 is amount
            setAmountFormat("single");
            autoMapping.amount = 2;
          }

          setColumnMapping(autoMapping);
          // Use the mapping saved for this account last time, if this file has those columns.
          const saved = applySavedMapping(headers, parseSavedMapping(savedMappings[selectedAccountId]));
          if (saved) {
            setColumnMapping(saved.mapping);
            setAmountFormat(saved.amountFormat);
          }
          setUsedSavedMapping(!!saved);
          setStep("mapping");
        } else {
          setError(
            "Unsupported file format. Please upload a CSV (.csv) or OFX (.ofx/.qfx) file.",
          );
        }
      };
      reader.readAsText(file);
    },
    [savedMappings, selectedAccountId],
  );

  function applyMapping() {
    setError(undefined);
    const parsed: ParsedTransaction[] = [];
    const errors: string[] = [];

    csvRows.forEach((row, rowIdx) => {
      const dateVal = row[columnMapping.date];
      const date = parseDate(dateVal ?? "");
      if (!date) {
        errors.push(`Row ${rowIdx + 2}: invalid date "${dateVal}"`);
        return;
      }

      let amount: number;
      if (amountFormat === "single" && columnMapping.amount !== null) {
        const raw = (row[columnMapping.amount] ?? "")
          .replace(/[$,\s]/g, "");
        amount = parseFloat(raw);
      } else if (
        amountFormat === "split" &&
        columnMapping.debit !== null &&
        columnMapping.credit !== null
      ) {
        const debitRaw = (row[columnMapping.debit] ?? "")
          .replace(/[$,\s]/g, "");
        const creditRaw = (row[columnMapping.credit] ?? "")
          .replace(/[$,\s]/g, "");
        const debit = parseFloat(debitRaw) || 0;
        const credit = parseFloat(creditRaw) || 0;
        // Debits are negative (money out), credits are positive (money in)
        amount = credit > 0 ? credit : -debit;
      } else {
        errors.push(`Row ${rowIdx + 2}: amount column not mapped`);
        return;
      }

      if (isNaN(amount) || amount === 0) {
        errors.push(`Row ${rowIdx + 2}: invalid amount`);
        return;
      }

      const description = row[columnMapping.description] ?? "";
      // A balance of exactly zero is a real balance, so keep it.
      const balanceCents = columnMapping.balance !== null ? parseMoneyCell(row[columnMapping.balance]) : null;
      const balance = balanceCents == null ? undefined : balanceCents / 100;
      const reference =
        columnMapping.reference !== null
          ? row[columnMapping.reference] || undefined
          : undefined;

      parsed.push({
        transactionDate: date,
        amount,
        description,
        reference,
        balance,
      });
    });

    if (parsed.length === 0) {
      setError(
        `No valid transactions could be parsed. ${errors.length > 0 ? errors.slice(0, 3).join("; ") : ""}`,
      );
      return;
    }

    setTransactions(parsed);
    setStep("preview");
  }

  function handleImport() {
    setError(undefined);
    startTransition(async () => {
      const result = await importBankTransactionsAction(
        schemeId,
        selectedAccountId,
        transactions,
        fileType === "ofx" ? "OFX_IMPORT" : "CSV_IMPORT",
      );

      if (result.error) {
        setError(result.error);
        return;
      }

      if (fileType === "csv" && csvHeaders.length > 0) {
        // Remember this mapping for the account. A failure here does not affect the import.
        await saveCsvMappingAction(
          schemeId,
          selectedAccountId,
          JSON.stringify(toSavedMapping(csvHeaders, columnMapping, amountFormat)),
        );
      }

      setImportResult({
        imported: (result.data?.imported as number) ?? 0,
        duplicates: (result.data?.duplicates as number) ?? 0,
      });
      setStep("result");
    });
  }

  // Check the file's balances run on without a gap (a missing page) and start where the last import ended.
  const balanceCheck = useMemo(() => {
    const rows = transactions.map((t) => ({
      date: t.transactionDate.slice(0, 10),
      amountCents: Math.round(t.amount * 100),
      balanceCents: t.balance === undefined ? null : Math.round(t.balance * 100),
    }));
    const last = lastBalances[selectedAccountId] ?? null;
    const firstDate = rows.reduce<string | null>((m, r) => (m == null || r.date < m ? r.date : m), null);
    // Only compare with the last import when this file starts after it.
    const lastCents = last && firstDate && firstDate > last.date ? last.cents : null;
    return checkRunningBalance(rows, lastCents);
  }, [transactions, lastBalances, selectedAccountId]);

  if (bankAccounts.length === 0) {
    return (
      <EmptyState
        title="No bank accounts"
        description="You need to add a bank account before importing transactions."
        actionLabel="Add Bank Account"
        actionHref={`/adviser/schemes/${schemeId}/finance/bank-accounts/new`}
      />
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-[var(--radius-card)] bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Step 1: Select bank account */}
      {step === "select" && (
        <Card>
          <CardHeader
            title="Select Bank Account"
            description="Choose the bank account to import transactions for."
          />
          <div className="px-6 pb-6 space-y-4">
            <SelectField
              label="Bank Account"
              name="bankAccountId"
              required
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              options={[
                { value: "", label: "Select a bank account..." },
                ...bankAccounts.map((ba) => ({
                  value: ba.id,
                  label: `${ba.accountName} (${ba.bsb} ${ba.accountNumber})`,
                })),
              ]}
            />
            <Button
              variant="primary"
              disabled={!selectedAccountId}
              onClick={() => setStep("upload")}
            >
              Continue
            </Button>
          </div>
        </Card>
      )}

      {/* Step 2: Upload file */}
      {step === "upload" && (
        <Card>
          <CardHeader
            title="Upload Bank Statement"
            description="Upload a CSV or OFX/QFX file exported from your bank."
          />
          <div className="px-6 pb-6 space-y-4">
            <div className="text-sm text-ink-muted space-y-2">
              <p className="font-medium text-ink">Supported formats:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>
                  <span className="font-medium">CSV</span> — comma-separated
                  with headers (Date, Description, Amount or Debit/Credit,
                  Balance)
                </li>
                <li>
                  <span className="font-medium">OFX / QFX</span> — Open
                  Financial Exchange format (auto-mapped)
                </li>
              </ul>
            </div>

            <div className="rounded-[var(--radius-card)] border-2 border-dashed border-line p-8 text-center">
              <input
                type="file"
                accept=".csv,.ofx,.qfx"
                onChange={handleFileUpload}
                className="block w-full text-sm text-ink-muted file:mr-4 file:py-2 file:px-4 file:rounded-[var(--radius-card)] file:border-0 file:text-sm file:font-medium file:bg-mint-soft file:text-turquoise hover:file:bg-mint-soft cursor-pointer"
              />
              <p className="mt-2 text-xs text-ink-muted">
                Maximum file size: 5 MB
              </p>
            </div>

            <Button
              variant="secondary"
              onClick={() => {
                setStep("select");
                setError(undefined);
              }}
            >
              Back
            </Button>
          </div>
        </Card>
      )}

      {/* Step 3: Column mapping (CSV only) */}
      {step === "mapping" && (
        <Card>
          <CardHeader
            title="Map Columns"
            description="Map the columns in your CSV file to transaction fields."
          />
          <div className="px-6 pb-6 space-y-4">
            {usedSavedMapping && (
              <p className="text-sm text-green-700">
                These are the columns you chose last time for this account. Check them, then continue.
              </p>
            )}
            {/* Preview first 3 rows */}
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

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <SelectField
                label="Date Column"
                name="dateColumn"
                required
                value={String(columnMapping.date)}
                onChange={(e) =>
                  setColumnMapping({
                    ...columnMapping,
                    date: Number(e.target.value),
                  })
                }
                options={csvHeaders.map((h, i) => ({
                  value: String(i),
                  label: h,
                }))}
              />
              <SelectField
                label="Description Column"
                name="descriptionColumn"
                required
                value={String(columnMapping.description)}
                onChange={(e) =>
                  setColumnMapping({
                    ...columnMapping,
                    description: Number(e.target.value),
                  })
                }
                options={csvHeaders.map((h, i) => ({
                  value: String(i),
                  label: h,
                }))}
              />
            </div>

            <SelectField
              label="Amount Format"
              name="amountFormat"
              required
              value={amountFormat}
              onChange={(e) => {
                const fmt = e.target.value as "single" | "split";
                setAmountFormat(fmt);
                if (fmt === "single") {
                  setColumnMapping({
                    ...columnMapping,
                    amount: columnMapping.amount ?? 2,
                    debit: null,
                    credit: null,
                  });
                } else {
                  setColumnMapping({
                    ...columnMapping,
                    amount: null,
                    debit: columnMapping.debit ?? 2,
                    credit: columnMapping.credit ?? 3,
                  });
                }
              }}
              options={[
                {
                  value: "single",
                  label: "Single amount column (positive = credit, negative = debit)",
                },
                {
                  value: "split",
                  label: "Separate debit and credit columns",
                },
              ]}
            />

            {amountFormat === "single" && (
              <SelectField
                label="Amount Column"
                name="amountColumn"
                required
                value={String(columnMapping.amount ?? "")}
                onChange={(e) =>
                  setColumnMapping({
                    ...columnMapping,
                    amount: Number(e.target.value),
                  })
                }
                options={csvHeaders.map((h, i) => ({
                  value: String(i),
                  label: h,
                }))}
              />
            )}

            {amountFormat === "split" && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <SelectField
                  label="Debit Column"
                  name="debitColumn"
                  required
                  value={String(columnMapping.debit ?? "")}
                  onChange={(e) =>
                    setColumnMapping({
                      ...columnMapping,
                      debit: Number(e.target.value),
                    })
                  }
                  options={csvHeaders.map((h, i) => ({
                    value: String(i),
                    label: h,
                  }))}
                />
                <SelectField
                  label="Credit Column"
                  name="creditColumn"
                  required
                  value={String(columnMapping.credit ?? "")}
                  onChange={(e) =>
                    setColumnMapping({
                      ...columnMapping,
                      credit: Number(e.target.value),
                    })
                  }
                  options={csvHeaders.map((h, i) => ({
                    value: String(i),
                    label: h,
                  }))}
                />
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <SelectField
                label="Balance Column (optional)"
                name="balanceColumn"
                value={
                  columnMapping.balance !== null
                    ? String(columnMapping.balance)
                    : ""
                }
                onChange={(e) =>
                  setColumnMapping({
                    ...columnMapping,
                    balance: e.target.value ? Number(e.target.value) : null,
                  })
                }
                options={[
                  { value: "", label: "None" },
                  ...csvHeaders.map((h, i) => ({
                    value: String(i),
                    label: h,
                  })),
                ]}
              />
              <SelectField
                label="Reference Column (optional)"
                name="referenceColumn"
                value={
                  columnMapping.reference !== null
                    ? String(columnMapping.reference)
                    : ""
                }
                onChange={(e) =>
                  setColumnMapping({
                    ...columnMapping,
                    reference: e.target.value ? Number(e.target.value) : null,
                  })
                }
                options={[
                  { value: "", label: "None" },
                  ...csvHeaders.map((h, i) => ({
                    value: String(i),
                    label: h,
                  })),
                ]}
              />
            </div>

            <div className="flex gap-3">
              <Button variant="primary" onClick={applyMapping}>
                Continue
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setStep("upload");
                  setError(undefined);
                }}
              >
                Back
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Step 4: Preview and confirm */}
      {step === "preview" && (
        <>
          <Card>
            <CardHeader
              title="Review Transactions"
              description={`${transactions.length} transaction${transactions.length !== 1 ? "s" : ""} found. Review and confirm import.`}
            />

            <div className="overflow-x-auto">
              {/* Table header */}
              <div className="hidden sm:grid sm:grid-cols-[120px_1fr_100px_100px] gap-4 px-6 pb-2 text-xs font-medium text-ink-muted uppercase tracking-wide border-b border-line">
                <div>Date</div>
                <div>Description</div>
                <div className="text-right">Amount</div>
                <div className="text-right">Balance</div>
              </div>

              <div className="divide-y divide-line max-h-96 overflow-y-auto">
                {transactions.map((txn, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-1 sm:grid-cols-[120px_1fr_100px_100px] gap-2 sm:gap-4 px-6 py-3 items-center"
                  >
                    <div className="text-sm text-ink-muted">
                      {new Date(txn.transactionDate).toLocaleDateString(
                        "en-AU",
                      )}
                    </div>
                    <div className="text-sm text-ink truncate">
                      {txn.description}
                      {txn.reference && (
                        <span className="ml-2 text-xs text-ink-muted">
                          Ref: {txn.reference}
                        </span>
                      )}
                    </div>
                    <div
                      className={`text-sm text-right tabular-nums font-medium ${
                        txn.amount >= 0 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {formatCurrency(txn.amount)}
                    </div>
                    <div className="text-sm text-right tabular-nums text-ink-muted">
                      {txn.balance !== undefined
                        ? formatCurrency(txn.balance)
                        : "—"}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          {balanceCheck.checked && (balanceCheck.gaps.length > 0 || balanceCheck.openingGapCents != null) && (
            <div role="alert" className="rounded-[var(--radius-card)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 space-y-1">
              <p className="font-medium">The balances in this file do not run on. A statement page may be missing.</p>
              {balanceCheck.openingGapCents != null && (
                <p>
                  The file opens at {formatCurrency((balanceCheck.openingCents ?? 0) / 100)}, but the last import for this account
                  ended at {formatCurrency(((balanceCheck.openingCents ?? 0) - balanceCheck.openingGapCents) / 100)}. A difference
                  of {formatCurrency(balanceCheck.openingGapCents / 100)} is not in either file.
                </p>
              )}
              {balanceCheck.gaps.slice(0, 5).map((g) => (
                <p key={`${g.afterIndex}-${g.beforeDate}`}>
                  Between {new Date(`${g.afterDate}T00:00:00`).toLocaleDateString("en-AU")} and{" "}
                  {new Date(`${g.beforeDate}T00:00:00`).toLocaleDateString("en-AU")}: the balance should be{" "}
                  {formatCurrency(g.expectedCents / 100)} but the file shows {formatCurrency(g.actualCents / 100)} (
                  {formatCurrency(g.missingCents / 100)} unaccounted for).
                </p>
              ))}
              <p>You can still import. Get the missing statement lines from the bank and import them too.</p>
            </div>
          )}
          {balanceCheck.checked && balanceCheck.gaps.length === 0 && balanceCheck.openingGapCents == null && (
            <p className="text-sm text-green-700">
              Balances check out: opening {formatCurrency((balanceCheck.openingCents ?? 0) / 100)} plus movements equals closing{" "}
              {formatCurrency((balanceCheck.closingCents ?? 0) / 100)}.
            </p>
          )}

          {/* Summary */}
          <Card>
            <CardHeader title="Import Summary" />
            <div className="px-6 pb-6 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-ink-muted">
                  Total transactions
                </span>
                <span className="font-medium text-ink">
                  {transactions.length}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-ink-muted">Credits (in)</span>
                <span className="font-medium text-green-600">
                  {formatCurrency(
                    transactions
                      .filter((t) => t.amount > 0)
                      .reduce((sum, t) => sum + t.amount, 0),
                  )}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-ink-muted">Debits (out)</span>
                <span className="font-medium text-red-600">
                  {formatCurrency(
                    transactions
                      .filter((t) => t.amount < 0)
                      .reduce((sum, t) => sum + t.amount, 0),
                  )}
                </span>
              </div>
              <div className="flex justify-between text-sm font-semibold border-t border-line pt-3">
                <span className="text-ink">Net movement</span>
                <span className="text-ink">
                  {formatCurrency(
                    transactions.reduce((sum, t) => sum + t.amount, 0),
                  )}
                </span>
              </div>
            </div>
          </Card>

          <div className="flex gap-3">
            <Button
              variant="primary"
              onClick={handleImport}
              disabled={isPending}
            >
              {isPending
                ? "Importing..."
                : `Import ${transactions.length} Transaction${transactions.length !== 1 ? "s" : ""}`}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setStep(fileType === "csv" ? "mapping" : "upload");
                setError(undefined);
              }}
              disabled={isPending}
            >
              Back
            </Button>
          </div>
        </>
      )}

      {/* Step 5: Result */}
      {step === "result" && importResult && (
        <Card>
          <CardHeader title="Import Complete" />
          <div className="px-6 pb-6 space-y-4">
            <div className="rounded-[var(--radius-card)] bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
              Successfully imported {importResult.imported} new transaction
              {importResult.imported !== 1 ? "s" : ""}.
              {importResult.duplicates > 0 && (
                <span>
                  {" "}
                  {importResult.duplicates} duplicate
                  {importResult.duplicates !== 1 ? "s were" : " was"} flagged.
                </span>
              )}
            </div>

            <div className="flex gap-3">
              <Button
                variant="primary"
                href={`/adviser/schemes/${schemeId}/finance/reconciliation`}
              >
                Go to Reconciliation
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setStep("select");
                  setTransactions([]);
                  setImportResult(undefined);
                  setSelectedAccountId("");
                  setError(undefined);
                }}
              >
                Import More
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
