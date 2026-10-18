"use client";

import { useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader } from "@/components/ui/card";
import { SelectField } from "@/components/ui/form-field";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { importBankTransactionsAction } from "../actions";

interface BankAccount {
  id: string;
  accountName: string;
  bsb: string;
  accountNumber: string;
}

interface ParsedTransaction {
  transactionDate: string;
  amount: number;
  description: string;
  reference?: string;
  balance?: number;
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

function parseDate(value: string): string | null {
  // Try DD/MM/YYYY (Australian format)
  const auMatch = value.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (auMatch) {
    const [, day, month, year] = auMatch;
    const d = new Date(Number(year), Number(month) - 1, Number(day));
    if (!isNaN(d.getTime())) return d.toISOString();
  }

  // Try YYYY-MM-DD (ISO format)
  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d.toISOString();
  }

  // Try YYYYMMDD (OFX date format)
  const ofxMatch = value.match(/^(\d{4})(\d{2})(\d{2})/);
  if (ofxMatch) {
    const [, year, month, day] = ofxMatch;
    const d = new Date(Number(year), Number(month) - 1, Number(day));
    if (!isNaN(d.getTime())) return d.toISOString();
  }

  return null;
}

function parseOFX(content: string): ParsedTransaction[] {
  const transactions: ParsedTransaction[] = [];

  // Extract STMTTRN blocks
  const trnRegex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
  let match;

  while ((match = trnRegex.exec(content)) !== null) {
    const block = match[1];

    const getTag = (tag: string): string | null => {
      const tagRegex = new RegExp(`<${tag}>([^<\\n]+)`, "i");
      const m = block.match(tagRegex);
      return m ? m[1].trim() : null;
    };

    const dtPosted = getTag("DTPOSTED");
    const trnAmt = getTag("TRNAMT");
    const name = getTag("NAME") ?? getTag("MEMO") ?? "";
    const memo = getTag("MEMO");
    const fitId = getTag("FITID");

    if (!dtPosted || !trnAmt) continue;

    const date = parseDate(dtPosted);
    if (!date) continue;

    const amount = parseFloat(trnAmt);
    if (isNaN(amount)) continue;

    transactions.push({
      transactionDate: date,
      amount,
      description: String(name),
      reference: fitId ?? memo ?? undefined,
    });
  }

  return transactions;
}

export function BankImportForm({
  schemeId,
  bankAccounts,
}: {
  schemeId: string;
  bankAccounts: BankAccount[];
}) {
  const router = useRouter();
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
          setStep("mapping");
        } else {
          setError(
            "Unsupported file format. Please upload a CSV (.csv) or OFX (.ofx/.qfx) file.",
          );
        }
      };
      reader.readAsText(file);
    },
    [],
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
      const balance =
        columnMapping.balance !== null
          ? parseFloat(
              (row[columnMapping.balance] ?? "").replace(/[$,\s]/g, ""),
            ) || undefined
          : undefined;
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

      setImportResult({
        imported: (result.data?.imported as number) ?? 0,
        duplicates: (result.data?.duplicates as number) ?? 0,
      });
      setStep("result");
    });
  }

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
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
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
            <div className="text-sm text-muted-foreground space-y-2">
              <p className="font-medium text-foreground">Supported formats:</p>
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

            <div className="rounded-xl border-2 border-dashed border-border p-8 text-center">
              <input
                type="file"
                accept=".csv,.ofx,.qfx"
                onChange={handleFileUpload}
                className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100 cursor-pointer"
              />
              <p className="mt-2 text-xs text-muted-foreground">
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
            {/* Preview first 3 rows */}
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
              <div className="hidden sm:grid sm:grid-cols-[120px_1fr_100px_100px] gap-4 px-6 pb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide border-b border-border">
                <div>Date</div>
                <div>Description</div>
                <div className="text-right">Amount</div>
                <div className="text-right">Balance</div>
              </div>

              <div className="divide-y divide-border max-h-96 overflow-y-auto">
                {transactions.map((txn, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-1 sm:grid-cols-[120px_1fr_100px_100px] gap-2 sm:gap-4 px-6 py-3 items-center"
                  >
                    <div className="text-sm text-muted-foreground">
                      {new Date(txn.transactionDate).toLocaleDateString(
                        "en-AU",
                      )}
                    </div>
                    <div className="text-sm text-foreground truncate">
                      {txn.description}
                      {txn.reference && (
                        <span className="ml-2 text-xs text-muted-foreground">
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
                    <div className="text-sm text-right tabular-nums text-muted-foreground">
                      {txn.balance !== undefined
                        ? formatCurrency(txn.balance)
                        : "—"}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          {/* Summary */}
          <Card>
            <CardHeader title="Import Summary" />
            <div className="px-6 pb-6 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  Total transactions
                </span>
                <span className="font-medium text-foreground">
                  {transactions.length}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Credits (in)</span>
                <span className="font-medium text-green-600">
                  {formatCurrency(
                    transactions
                      .filter((t) => t.amount > 0)
                      .reduce((sum, t) => sum + t.amount, 0),
                  )}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Debits (out)</span>
                <span className="font-medium text-red-600">
                  {formatCurrency(
                    transactions
                      .filter((t) => t.amount < 0)
                      .reduce((sum, t) => sum + t.amount, 0),
                  )}
                </span>
              </div>
              <div className="flex justify-between text-sm font-semibold border-t border-border pt-3">
                <span className="text-foreground">Net movement</span>
                <span className="text-foreground">
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
            <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
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
