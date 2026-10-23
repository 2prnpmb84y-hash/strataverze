/**
 * Saved CSV column mappings (pure). A mapping is saved by header name, not
 * column position, so it still applies when a bank adds or moves a column.
 */

export interface ColumnIndexes {
  date: number;
  description: number;
  amount: number | null;
  debit: number | null;
  credit: number | null;
  balance: number | null;
  reference: number | null;
}

export interface SavedCsvMapping {
  version: 1;
  amountFormat: "single" | "split";
  columns: { [K in keyof ColumnIndexes]: string | null };
}

const norm = (h: string) => h.trim().toLowerCase();

/** Turn the column positions chosen for this file into a mapping by header name. */
export function toSavedMapping(headers: string[], m: ColumnIndexes, amountFormat: "single" | "split"): SavedCsvMapping {
  const name = (i: number | null) => (i == null || i < 0 || i >= headers.length ? null : headers[i].trim());
  return {
    version: 1,
    amountFormat,
    columns: {
      date: name(m.date),
      description: name(m.description),
      amount: amountFormat === "single" ? name(m.amount) : null,
      debit: amountFormat === "split" ? name(m.debit) : null,
      credit: amountFormat === "split" ? name(m.credit) : null,
      balance: name(m.balance),
      reference: name(m.reference),
    },
  };
}

/**
 * Apply a saved mapping to a new file's headers. Returns null if any column
 * the mapping needs is missing from this file, so the user maps it again.
 */
export function applySavedMapping(
  headers: string[],
  saved: SavedCsvMapping | null,
): { mapping: ColumnIndexes; amountFormat: "single" | "split" } | null {
  if (!saved || saved.version !== 1) return null;
  const index = (h: string | null) => (h == null ? null : headers.findIndex((x) => norm(x) === norm(h)));
  const idx = {
    date: index(saved.columns.date),
    description: index(saved.columns.description),
    amount: index(saved.columns.amount),
    debit: index(saved.columns.debit),
    credit: index(saved.columns.credit),
    balance: index(saved.columns.balance),
    reference: index(saved.columns.reference),
  };
  const required: (keyof typeof idx)[] = ["date", "description", ...(saved.amountFormat === "split" ? (["debit", "credit"] as const) : (["amount"] as const))];
  if (required.some((k) => idx[k] == null || idx[k]! < 0)) return null;
  // An optional column that is no longer in the file is just left unmapped.
  const opt = (v: number | null) => (v == null || v < 0 ? null : v);
  return {
    amountFormat: saved.amountFormat,
    mapping: {
      date: idx.date!,
      description: idx.description!,
      amount: opt(idx.amount),
      debit: opt(idx.debit),
      credit: opt(idx.credit),
      balance: opt(idx.balance),
      reference: opt(idx.reference),
    },
  };
}

/** Parse a saved mapping from storage, or null if it is not one. */
export function parseSavedMapping(raw: string | null | undefined): SavedCsvMapping | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as SavedCsvMapping;
    return v && v.version === 1 && v.columns && (v.amountFormat === "single" || v.amountFormat === "split") ? v : null;
  } catch {
    return null;
  }
}

/** A money cell from a bank file, in cents, or null when blank or not a number. Accepts "$1,234.50", "-12", "(12.00)". */
export function parseMoneyCell(raw: string | undefined): number | null {
  if (raw == null) return null;
  let s = raw.replace(/[$,\s]/g, "");
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (/cr$/i.test(s)) s = s.slice(0, -2);
  else if (/dr$/i.test(s)) {
    negative = !negative;
    s = s.slice(0, -2);
  }
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const cents = Math.round(Number(s) * 100);
  return negative ? -cents : cents;
}
