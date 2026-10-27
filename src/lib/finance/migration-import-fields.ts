/**
 * The columns of the CSV import on the adviser data migration page (pure, and
 * safe to import in a client component).
 *
 * The browser keeps each mapped column under a snake_case key, whose words
 * also drive the header auto match. The server reads camelCase field names
 * (validateLots, importLots, validateChartOfAccounts and so on in
 * src/lib/queries/data-migration.ts). This table is the only place that links
 * the two: the browser builds its columns and rows from it, and the server
 * actions translate every row with it before checking or importing anything.
 */

export type ImportDataType = "lots" | "chart_of_accounts" | "opening_balances";

export const IMPORT_DATA_TYPES: readonly ImportDataType[] = ["lots", "chart_of_accounts", "opening_balances"];

export interface ImportField {
  /** The key the browser sends for this column. */
  readonly key: string;
  /** The field name the server reads. */
  readonly field: string;
  readonly label: string;
  readonly required: boolean;
  /** Short headers some systems export, matched only in full (StrataMax style). */
  readonly aliases?: readonly string[];
}

export const IMPORT_FIELDS = {
  lots: [
    { key: "lot_number", field: "lotNumber", label: "Lot Number", required: true, aliases: ["LotNo"] },
    { key: "unit_number", field: "unitNumber", label: "Unit Number", required: false, aliases: ["UnitNo"] },
    { key: "entitlement", field: "entitlement", label: "Entitlement", required: true },
    { key: "floor_area", field: "floorArea", label: "Floor Area", required: false, aliases: ["Area"] },
    { key: "lot_type", field: "lotType", label: "Lot Type", required: false },
  ],
  chart_of_accounts: [
    { key: "account_code", field: "code", label: "Account Code", required: true, aliases: ["AccCode"] },
    { key: "account_name", field: "name", label: "Account Name", required: true, aliases: ["AccName"] },
    { key: "account_type", field: "accountType", label: "Account Type", required: true, aliases: ["AccType"] },
    { key: "sub_type", field: "accountSubType", label: "Sub Type", required: false },
    // importChartOfAccounts matches this against a fund's name, then its type.
    { key: "fund_name", field: "fundType", label: "Fund Name", required: false },
  ],
  opening_balances: [
    { key: "account_code", field: "accountCode", label: "Account Code", required: true },
    { key: "debit", field: "debit", label: "Debit", required: false },
    { key: "credit", field: "credit", label: "Credit", required: false },
    { key: "fund_name", field: "fundName", label: "Fund Name", required: false },
    { key: "description", field: "description", label: "Description", required: false },
  ],
} as const satisfies Record<ImportDataType, readonly ImportField[]>;

/** The keys the browser sends for a data type. */
export type BrowserKey<T extends ImportDataType> = (typeof IMPORT_FIELDS)[T][number]["key"];
/** The field names the server reads for a data type. */
export type ServerField<T extends ImportDataType> = (typeof IMPORT_FIELDS)[T][number]["field"];

export interface ImportRow {
  rowNumber: number;
  data: Record<string, string>;
  errors: string[];
  warnings: string[];
}

export function isImportDataType(value: string): value is ImportDataType {
  return (IMPORT_DATA_TYPES as readonly string[]).includes(value);
}

/**
 * One row's data, from the keys the browser sends to the field names the
 * server reads. A key that is not in the table is dropped.
 */
export function toServerData(dataType: ImportDataType, data: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of IMPORT_FIELDS[dataType] as readonly ImportField[]) {
    const v = data[f.key];
    if (typeof v === "string") out[f.field] = v;
  }
  return out;
}

/** An error for each required field that is empty, in the words the preview shows. */
export function missingRequired(dataType: ImportDataType, serverData: Record<string, string>): string[] {
  return (IMPORT_FIELDS[dataType] as readonly ImportField[])
    .filter((f) => f.required && !(serverData[f.field] ?? "").trim())
    .map((f) => `${f.label} is required`);
}

const words = (h: string) => h.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const compact = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * The browser's first guess at the column for each field, ignoring case and
 * punctuation. Exact matches come first: the field's own words, its label or
 * one of its short aliases. Then a header that holds every word of the key,
 * the shortest first, so "Account Type" wins over "Account Sub Type". Each
 * column feeds at most one field.
 */
export function autoDetectMapping(dataType: ImportDataType, headers: string[]): Record<string, string> {
  const fields = IMPORT_FIELDS[dataType] as readonly ImportField[];
  const mapping: Record<string, string> = {};
  const used = new Set<number>();
  const take = (field: ImportField, index: number) => {
    mapping[field.key] = headers[index];
    used.add(index);
  };
  for (const field of fields) {
    const exact = new Set([field.key, field.label, ...(field.aliases ?? [])].map(compact));
    const index = headers.findIndex((h, i) => !used.has(i) && exact.has(compact(h)));
    if (index >= 0) take(field, index);
  }
  for (const field of fields) {
    if (mapping[field.key]) continue;
    const parts = field.key.split("_");
    const candidates = headers
      .map((h, i) => ({ i, text: words(h) }))
      .filter((c) => !used.has(c.i) && parts.every((part) => c.text.includes(part)))
      .sort((a, b) => a.text.length - b.text.length || a.i - b.i);
    if (candidates.length) take(field, candidates[0].i);
  }
  return mapping;
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

/** The page's CSV reader: a header row and at least one data row, blank lines skipped. */
export function parseCsvContent(content: string): { headers: string[]; rows: string[][] } {
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) return { headers: [], rows: [] };
  return { headers: parseCSVLine(lines[0]), rows: lines.slice(1).map(parseCSVLine) };
}

/**
 * The rows the browser sends, built from the CSV and the column mapping
 * (browser key to CSV header), with the required field check already run.
 */
export function buildImportRows(
  dataType: ImportDataType,
  headers: string[],
  csvRows: string[][],
  columnMapping: Record<string, string>,
): ImportRow[] {
  const fields = IMPORT_FIELDS[dataType] as readonly ImportField[];
  return csvRows.map((csvRow, idx) => {
    const data: Record<string, string> = {};
    for (const field of fields) {
      const sourceHeader = columnMapping[field.key];
      if (sourceHeader) {
        const colIndex = headers.indexOf(sourceHeader);
        data[field.key] = colIndex >= 0 ? (csvRow[colIndex] ?? "") : "";
      }
    }
    return {
      rowNumber: idx + 2, // Rows count from 1 and the header is row 1.
      data,
      errors: missingRequired(dataType, toServerData(dataType, data)),
      warnings: [],
    };
  });
}
