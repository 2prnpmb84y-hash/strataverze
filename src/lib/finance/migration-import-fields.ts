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
 *
 * A field marked `separateEntitlement` is a second lot entitlement that only
 * some rule packs hold (Queensland's interest schedule, stage 2, step 10;
 * Victoria's lot entitlement, stage 2, PR 4). It
 * is not required here: the building's pack decides. The page shows it, under
 * the pack's label and as a required column, only for a building whose pack
 * holds it (importFieldsFor), and the server translates it for every building
 * but checks and writes it only where the pack holds it (validateLots and
 * importLots).
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
  /**
   * A second lot entitlement held only where the building's rule pack lists
   * that schedule (see separateEntitlement in src/lib/jurisdiction/building-data.ts).
   */
  readonly separateEntitlement?: true;
}

export const IMPORT_FIELDS = {
  lots: [
    { key: "lot_number", field: "lotNumber", label: "Lot Number", required: true, aliases: ["LotNo"] },
    { key: "unit_number", field: "unitNumber", label: "Unit Number", required: false, aliases: ["UnitNo"] },
    { key: "entitlement", field: "entitlement", label: "Entitlement", required: true },
    { key: "floor_area", field: "floorArea", label: "Floor Area", required: false, aliases: ["Area"] },
    { key: "lot_type", field: "lotType", label: "Lot Type", required: false },
    // Queensland's interest schedule (stage 2, step 10). Required for a
    // building whose pack holds it, under the pack's label (importFieldsFor).
    {
      key: "interest_schedule_entitlement",
      field: "interestScheduleEntitlement",
      label: "Interest Schedule Lot Entitlement",
      required: false,
      separateEntitlement: true,
    },
    // Victoria's lot entitlement (stage 2, PR 4), the same way.
    {
      key: "lot_entitlement",
      field: "lotEntitlement",
      label: "Lot Entitlement",
      required: false,
      separateEntitlement: true,
    },
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

/** The second lot entitlement a building's lots hold, as the server page passes it (its field and the pack's label), or null. */
export type BuildingSeparateEntitlement = { field: string; label: string } | null;

/**
 * The heading the building's pack gives the entitlement held on each lot in
 * the import, with any other headers to match it by (Victoria's "Lot
 * Liability", stage 2, PR 4), or null to keep the import's own word,
 * "Entitlement" (NSW and Queensland).
 */
export type BuildingOnLotEntitlement = { label: string; aliases?: readonly string[] } | null;

/** The field every lot's own entitlement is read into (lots.entitlement). */
const ON_LOT_FIELD = "entitlement";

/**
 * The columns the page shows for one building. A `separateEntitlement` field
 * appears only when the building's pack holds that schedule in that field,
 * under the pack's label and required, since every lot needs it; otherwise
 * it is left out (NSW). The entitlement on each lot takes the pack's heading
 * where it gives one (`onLot`, Victoria's lot liability). The other fields
 * come as the table has them.
 */
export function importFieldsFor(
  dataType: ImportDataType,
  separate: BuildingSeparateEntitlement = null,
  onLot: BuildingOnLotEntitlement = null,
): readonly ImportField[] {
  const out: ImportField[] = [];
  for (const f of IMPORT_FIELDS[dataType] as readonly ImportField[]) {
    if (f.separateEntitlement) {
      if (separate && separate.field === f.field) out.push({ ...f, label: separate.label, required: true });
    } else if (onLot && dataType === "lots" && f.field === ON_LOT_FIELD) {
      out.push({ ...f, label: onLot.label, aliases: [...(f.aliases ?? []), ...(onLot.aliases ?? [])] });
    } else out.push(f);
  }
  return out;
}

/**
 * Why a column mapping cannot be used, or null: one column mapped to two
 * fields (for example lot entitlement read as lot liability too). The page
 * refuses it before anything is checked or imported.
 */
export function mappingProblem(
  dataType: ImportDataType,
  columnMapping: Record<string, string>,
  separate: BuildingSeparateEntitlement = null,
  onLot: BuildingOnLotEntitlement = null,
): string | null {
  const labelOf = new Map(importFieldsFor(dataType, separate, onLot).map((f) => [f.key, f.label]));
  const byHeader = new Map<string, string[]>();
  for (const [key, header] of Object.entries(columnMapping)) {
    if (!header || !labelOf.has(key)) continue;
    byHeader.set(header, [...(byHeader.get(header) ?? []), labelOf.get(key)!]);
  }
  for (const [header, labels] of byHeader) {
    if (labels.length > 1) return `The column "${header}" is mapped to ${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}. Map each column to one field only.`;
  }
  return null;
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
export function missingRequired(dataType: ImportDataType, serverData: Record<string, string>, onLot: BuildingOnLotEntitlement = null): string[] {
  return importFieldsFor(dataType, null, onLot)
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
 * column feeds at most one field. Pass the building's second lot entitlement
 * (importFieldsFor) to match its column too: it is matched before the
 * entitlement on each lot, and a header holding its words ("Lot
 * Entitlements") is never taken as the entitlement on each lot. Pass the
 * pack's heading for the entitlement on each lot (`onLot`) to match it by
 * that heading.
 */
export function autoDetectMapping(
  dataType: ImportDataType,
  headers: string[],
  separate: BuildingSeparateEntitlement = null,
  onLot: BuildingOnLotEntitlement = null,
): Record<string, string> {
  const listed = importFieldsFor(dataType, separate, onLot);
  // The second lot entitlement first, so its column is taken before the entitlement on each lot can claim it.
  const fields = [...listed.filter((f) => f.separateEntitlement), ...listed.filter((f) => !f.separateEntitlement)];
  const separateField = listed.find((f) => f.separateEntitlement);
  const separateWords = separateField
    ? [separateField.key.split("_"), words(separateField.label).split(" ")].filter((w) => w.length > 0 && w.every(Boolean))
    : [];
  // A header holding every word of the second entitlement's key or label is never the entitlement on each lot.
  const allowed = (field: ImportField, header: string) =>
    !(dataType === "lots" && field.field === ON_LOT_FIELD && separateWords.some((parts) => parts.every((part) => words(header).includes(part))));
  const mapping: Record<string, string> = {};
  const used = new Set<number>();
  const take = (field: ImportField, index: number) => {
    mapping[field.key] = headers[index];
    used.add(index);
  };
  for (const field of fields) {
    const exact = new Set([field.key, field.label, ...(field.aliases ?? [])].map(compact));
    const index = headers.findIndex((h, i) => !used.has(i) && exact.has(compact(h)) && allowed(field, h));
    if (index >= 0) take(field, index);
  }
  for (const field of fields) {
    if (mapping[field.key]) continue;
    const parts = field.key.split("_");
    const candidates = headers
      .map((h, i) => ({ i, text: words(h) }))
      .filter((c) => !used.has(c.i) && parts.every((part) => c.text.includes(part)) && allowed(field, headers[c.i]))
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
 * Pass the building's second lot entitlement (importFieldsFor) to send its
 * column too: the server checks it against the building's pack, for the
 * preview and the import alike.
 */
export function buildImportRows(
  dataType: ImportDataType,
  headers: string[],
  csvRows: string[][],
  columnMapping: Record<string, string>,
  separate: BuildingSeparateEntitlement = null,
  onLot: BuildingOnLotEntitlement = null,
): ImportRow[] {
  const fields = importFieldsFor(dataType, separate, onLot);
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
      errors: missingRequired(dataType, toServerData(dataType, data), onLot),
      warnings: [],
    };
  });
}
