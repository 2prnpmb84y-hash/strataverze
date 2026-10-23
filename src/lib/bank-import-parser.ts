/**
 * Pure parsing functions for bank import file formats (CSV and OFX).
 * Extracted from bank-import-form.tsx for testability.
 */

export interface ParsedTransaction {
  transactionDate: string;
  amount: number;
  description: string;
  reference?: string;
  balance?: number;
  /** OFX FITID: the bank's own id for the transaction. */
  fitId?: string;
}

/**
 * Parse a single CSV line, handling quoted fields and escaped quotes.
 * Handles: simple values, quoted values with commas, escaped double quotes ("").
 */
export function parseCSVLine(line: string): string[] {
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

/**
 * Parse a date string in various formats:
 * - DD/MM/YYYY (Australian format, also with - or . separators)
 * - YYYY-MM-DD (ISO format)
 * - YYYYMMDD (OFX date format, may have trailing time)
 *
 * Returns an ISO string or null if unparseable.
 */
export function parseDate(value: string): string | null {
  // A bank statement date is a calendar date. It is returned as YYYY-MM-DD, never as a
  // timestamp: turning it into an instant in the browser's time zone moved dates to the
  // day before for anyone east of UTC (all of Australia).
  const day = (y: number, m: number, d: number): string | null => {
    const t = new Date(Date.UTC(y, m - 1, d));
    if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null;
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  };
  const v = value.trim();

  // DD/MM/YYYY (Australian format), also with - or . separators
  const auMatch = v.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (auMatch) return day(Number(auMatch[3]), Number(auMatch[2]), Number(auMatch[1]));

  // YYYY-MM-DD (ISO format)
  const isoMatch = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) return day(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));

  // YYYYMMDD (OFX date format), with any time after it
  const ofxMatch = v.match(/^(\d{4})(\d{2})(\d{2})/);
  if (ofxMatch) return day(Number(ofxMatch[1]), Number(ofxMatch[2]), Number(ofxMatch[3]));

  return null;
}

/**
 * Parse OFX (Open Financial Exchange) bank statement content.
 * Extracts transactions from <STMTTRN> blocks.
 */
export function parseOFX(content: string): ParsedTransaction[] {
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
      fitId: fitId ?? undefined,
    });
  }

  return transactions;
}

/**
 * Parse full CSV content into headers and rows.
 */
export function parseCsvContent(content: string): {
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

/**
 * TC-012: which transactions in an OFX file were imported before, by FITID.
 * `known` holds the FITIDs already recorded for the bank account (including
 * those kept only as the reference by earlier imports). A FITID repeated
 * within the file is skipped after its first appearance.
 */
export function splitByFitId<T extends { fitId?: string }>(transactions: T[], known: Set<string>): { fresh: T[]; skipped: T[] } {
  const seen = new Set(known);
  const fresh: T[] = [];
  const skipped: T[] = [];
  for (const t of transactions) {
    const id = t.fitId?.trim();
    if (id && seen.has(id)) {
      skipped.push(t);
      continue;
    }
    if (id) seen.add(id);
    fresh.push(t);
  }
  return { fresh, skipped };
}

/** The result of an import, as the adviser is told it. */
export function importSummary(r: { skipped: number; imported: number; flagged: number }): string {
  const n = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
  const parts = [`${n(r.skipped, "duplicate transaction")} skipped`, `${n(r.imported, "new transaction")} imported`];
  if (r.flagged > 0) parts.push(`${r.flagged} of them flagged as possible duplicates for review`);
  return `${parts.join(", ")}.`;
}
