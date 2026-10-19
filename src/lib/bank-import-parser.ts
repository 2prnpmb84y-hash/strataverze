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
