/**
 * Strata roll PDF parser.
 *
 * Extracts scheme-level data (plan number, address, building name, lots,
 * entitlement, ABN, financial year) and per-lot data (lot number, unit
 * number, entitlement, owner names) from a strata roll PDF.
 *
 * The parser works on the text layer produced by pdf-parse, which mirrors
 * the label:value layout used by the common Result Property Group /
 * StrataMax / Strata Community style of strata roll.
 */

export type ParsedSchemeData = {
  name: string | null;
  planNumber: string | null;
  address: string | null;
  suburb: string | null;
  state: string | null;
  postcode: string | null;
  abnNumber: string | null;
  totalLots: number | null;
  totalEntitlement: number | null;
  financialYearEnd: string | null;
  buildingType: string | null;
};

export type ParsedLotData = {
  lotNumber: string;
  unitNumber: string | null;
  entitlement: number;
  ownerName: string | null;
};

export type ParsedStrataRoll = {
  scheme: ParsedSchemeData;
  lots: ParsedLotData[];
};

/**
 * Extract a labelled value from text.  Handles patterns like:
 *   "S/Plan: 3697"
 *   "Building Address: 27-31 Reynolds Street"
 */
function extractField(text: string, label: string): string | null {
  // Try exact label match with colon
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`${escaped}\\s*:\\s*(.+?)(?:\\n|$)`, "i");
  const m = text.match(re);
  return m ? m[1].trim() : null;
}

/**
 * Try to pull plan number from various formats:
 *   "S/Plan: 3697", "Strata Plan Number 3697", "SP 3697"
 */
function extractPlanNumber(text: string): string | null {
  // "S/Plan: 3697"
  const sp = extractField(text, "S/Plan");
  if (sp) return `SP ${sp}`;

  // "Strata Plan Number XXXX"
  const m = text.match(/Strata\s+Plan\s+(?:Number\s+)?(\d+)/i);
  if (m) return `SP ${m[1]}`;

  // "Plan Number: SP XXXX" or "Plan Number: PS XXXX"
  const pn = extractField(text, "Plan Number");
  if (pn) return pn;

  return null;
}

/**
 * Extract the contribution schedule table to get per-lot data.
 * Typical row: "1    1    Owner Name    12"
 */
function extractLots(text: string): ParsedLotData[] {
  const lots: ParsedLotData[] = [];

  // Look for the contribution schedule section
  const scheduleStart = text.search(
    /Contribution\s+Schedule|Lot\s+Unit\s+Name\s+Entitlement/i,
  );
  if (scheduleStart === -1) return lots;

  const scheduleText = text.slice(scheduleStart);

  // Find "Aggregate" line which marks end of table
  const aggregateIdx = scheduleText.search(/Aggregate\s+Units/i);
  const tableText = aggregateIdx > -1
    ? scheduleText.slice(0, aggregateIdx)
    : scheduleText.slice(0, 3000); // take first 3000 chars if no aggregate

  // Parse rows: look for lines starting with a lot number
  // Pattern: lot_number  unit_number  owner_name  entitlement_units
  // Some strata rolls also have entitlements at the end of a row
  const lines = tableText.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Match lines that start with a number (lot number)
    // Format varies but generally: Lot  Unit  Name  Entitlement
    const rowMatch = trimmed.match(
      /^(\d+)\s+(\d+|[A-Za-z]\d*)\s+(.+?)\s+(\d+(?:\.\d+)?)\s*$/,
    );
    if (rowMatch) {
      const entitlement = parseFloat(rowMatch[4]);
      lots.push({
        lotNumber: rowMatch[1],
        unitNumber: rowMatch[2] || null,
        entitlement: entitlement,
        ownerName: rowMatch[3].trim() || null,
      });
      continue;
    }

    // Simpler format: just lot number and entitlement with name in between
    const simpleMatch = trimmed.match(
      /^(\d+)\s+(.+?)\s+(\d+(?:\.\d+)?)\s*$/,
    );
    if (simpleMatch && !isNaN(parseFloat(simpleMatch[3]))) {
      lots.push({
        lotNumber: simpleMatch[1],
        unitNumber: null,
        entitlement: parseFloat(simpleMatch[3]),
        ownerName: simpleMatch[2].trim() || null,
      });
    }
  }

  return lots;
}

/**
 * Parse financial year end from various formats:
 *   "Financial Year: 01/01/2026" → "01-01"
 *   "01/01/2026" → "01-01"
 */
function extractFinancialYear(text: string): string | null {
  const fy = extractField(text, "Financial Year");
  if (!fy) return null;

  // Try DD/MM/YYYY format
  const dateMatch = fy.match(/(\d{2})\/(\d{2})\/\d{4}/);
  if (dateMatch) {
    // Convert to MM-DD format (month-day)
    return `${dateMatch[2]}-${dateMatch[1]}`;
  }

  return null;
}

/**
 * Extract ABN from text. ABN is 11 digits, sometimes formatted with spaces.
 */
function extractABN(text: string): string | null {
  const abn = extractField(text, "ABN");
  if (abn) {
    // Clean up: remove non-digit chars except spaces, then normalise
    const cleaned = abn.replace(/[^\d\s]/g, "").trim();
    if (cleaned.replace(/\s/g, "").length === 11) {
      return cleaned;
    }
  }
  return null;
}

/**
 * Parse the full text output from a strata roll PDF.
 */
export function parseStrataRollText(text: string): ParsedStrataRoll {
  const scheme: ParsedSchemeData = {
    name: null,
    planNumber: null,
    address: null,
    suburb: null,
    state: null,
    postcode: null,
    abnNumber: null,
    totalLots: null,
    totalEntitlement: null,
    financialYearEnd: null,
    buildingType: null,
  };

  // Plan number
  scheme.planNumber = extractPlanNumber(text);

  // Building name
  scheme.name = extractField(text, "Building Name");

  // Address
  scheme.address = extractField(text, "Building Address");

  // Suburb
  scheme.suburb = extractField(text, "Suburb");

  // State
  scheme.state = extractField(text, "State");

  // Postcode
  const postcode = extractField(text, "Post Code") ?? extractField(text, "Postcode");
  scheme.postcode = postcode;

  // ABN
  scheme.abnNumber = extractABN(text);

  // Total lots
  const lotsStr = extractField(text, "Lots");
  if (lotsStr) {
    const n = parseInt(lotsStr, 10);
    if (!isNaN(n)) scheme.totalLots = n;
  }

  // Total entitlement
  const entitlementMatch = text.match(
    /Aggregate\s+Units\s+of\s+Entitlement\s*:\s*(\d+(?:\.\d+)?)/i,
  );
  if (entitlementMatch) {
    scheme.totalEntitlement = parseFloat(entitlementMatch[1]);
  }

  // Financial year
  scheme.financialYearEnd = extractFinancialYear(text);

  // Building type: default to STRATA for strata plans
  if (scheme.planNumber?.startsWith("SP")) {
    scheme.buildingType = "STRATA";
  }

  // Parse lots from contribution schedule
  const lots = extractLots(text);

  return { scheme, lots };
}

/**
 * Parse a strata roll PDF buffer and return extracted data.
 */
export async function parseStrataRollPDF(
  buffer: Buffer,
): Promise<ParsedStrataRoll> {
  // Dynamic import to avoid bundling pdf-parse on the client
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  return parseStrataRollText(result.text);
}
