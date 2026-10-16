/**
 * Strata roll PDF parser.
 *
 * Extracts scheme-level data (plan number, address, building name, lots,
 * entitlement, ABN, financial year) and per-lot data (lot number, unit
 * number, entitlement, owner names) from a strata roll PDF.
 *
 * The parser works on the text layer produced by pdf-parse, which may
 * vary significantly between strata management systems (StrataMax,
 * Strata Community, DEFT, Macquarie, Rock, etc.).  The patterns are
 * deliberately broad to cope with inconsistent whitespace, line breaks,
 * and labelling conventions.
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
  /** Raw text extracted from the PDF (for debugging when parse yields no data). */
  rawTextPreview?: string;
};

/* ------------------------------------------------------------------ */
/*  Utility helpers                                                    */
/* ------------------------------------------------------------------ */

/**
 * Normalise whitespace: collapse runs of spaces/tabs into one space,
 * but keep newlines so line-based patterns still work.
 */
function normaliseWhitespace(text: string): string {
  return text.replace(/[^\S\n]+/g, " ");
}

/**
 * Extract a labelled value.  Tries several separators (colon, dash,
 * tab, multi-space) and allows for the label and value to be on the
 * same line or on adjacent lines.
 */
function extractField(text: string, ...labels: string[]): string | null {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // Same-line: "Label: value" or "Label  value" or "Label\tvalue"
    const sameLine = new RegExp(
      `${escaped}\\s*[:–\\-]?\\s+(.+?)(?:\\n|$)`,
      "im",
    );
    const m = text.match(sameLine);
    if (m && m[1].trim()) return m[1].trim();

    // Next-line: label on one line, value on the next
    const nextLine = new RegExp(
      `${escaped}\\s*[:–\\-]?\\s*\\n\\s*(.+?)(?:\\n|$)`,
      "im",
    );
    const m2 = text.match(nextLine);
    if (m2 && m2[1].trim()) return m2[1].trim();
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  Field extractors                                                   */
/* ------------------------------------------------------------------ */

/**
 * Plan number from many common label variants:
 *   "S/Plan: 3697", "Strata Plan Number 3697", "SP 3697",
 *   "Plan No: SP3697", "Plan Number SP 3697", "Plan: PS 123456"
 */
function extractPlanNumber(text: string): string | null {
  // "SP XXXX" or "PS XXXX" or "SP/XXXX" standalone
  const standalone = text.match(
    /\b(SP|PS)\s*[/]?\s*(\d{3,7})\b/i,
  );
  if (standalone) return `${standalone[1].toUpperCase()} ${standalone[2]}`;

  // "S/Plan: 3697" or "S/Plan 3697"
  const sPlan = text.match(/S\s*\/\s*Plan\s*[:–\-]?\s*(\d+)/i);
  if (sPlan) return `SP ${sPlan[1]}`;

  // "Strata Plan Number XXXX" or "Strata Plan No XXXX" or "Strata Plan XXXX"
  const strataFull = text.match(
    /Strata\s+Plan\s+(?:Number|No\.?|#)?\s*[:–\-]?\s*(\d+)/i,
  );
  if (strataFull) return `SP ${strataFull[1]}`;

  // "Plan Number: SP XXXX" or "Plan No: PS XXXX" or just "Plan Number: XXXX"
  const planNum = text.match(
    /Plan\s+(?:Number|No\.?|#)\s*[:–\-]?\s*((?:SP|PS)\s*\d+|\d+)/i,
  );
  if (planNum) {
    const v = planNum[1].trim();
    if (/^(SP|PS)/i.test(v)) return v.toUpperCase().replace(/\s+/g, " ");
    return `SP ${v}`;
  }

  return null;
}

/**
 * Extract the address, trying common label names.
 */
function extractAddress(text: string): string | null {
  return extractField(
    text,
    "Building Address",
    "Property Address",
    "Street Address",
    "Address",
    "Registered Address",
  );
}

/**
 * Extract suburb from common labels.
 */
function extractSuburb(text: string): string | null {
  return extractField(text, "Suburb", "City", "Locality", "Town");
}

/**
 * Extract state (must be a valid Australian state/territory).
 */
function extractState(text: string): string | null {
  const STATES = ["NSW", "VIC", "QLD", "SA", "WA", "TAS", "NT", "ACT"];

  const raw = extractField(text, "State", "State/Territory");
  if (raw) {
    const upper = raw.toUpperCase().trim();
    // Might be the full name
    const map: Record<string, string> = {
      "NEW SOUTH WALES": "NSW",
      VICTORIA: "VIC",
      QUEENSLAND: "QLD",
      "SOUTH AUSTRALIA": "SA",
      "WESTERN AUSTRALIA": "WA",
      TASMANIA: "TAS",
      "NORTHERN TERRITORY": "NT",
      "AUSTRALIAN CAPITAL TERRITORY": "ACT",
    };
    if (STATES.includes(upper)) return upper;
    if (map[upper]) return map[upper];
  }

  // Fallback: look for a state abbreviation near a postcode
  const statePostcode = text.match(
    /\b(NSW|VIC|QLD|SA|WA|TAS|NT|ACT)\s+(\d{4})\b/,
  );
  if (statePostcode) return statePostcode[1];

  return null;
}

/**
 * Extract postcode (4-digit Australian postcode).
 */
function extractPostcode(text: string): string | null {
  const raw = extractField(text, "Post Code", "Postcode", "Post code", "Zip");
  if (raw) {
    const digits = raw.match(/\d{4}/);
    if (digits) return digits[0];
  }

  // Fallback: 4-digit number after a state abbreviation
  const statePostcode = text.match(
    /\b(?:NSW|VIC|QLD|SA|WA|TAS|NT|ACT)\s+(\d{4})\b/,
  );
  if (statePostcode) return statePostcode[1];

  return null;
}

/**
 * Extract ABN (11 digits, possibly formatted with spaces).
 */
function extractABN(text: string): string | null {
  // Try labelled field first
  const raw = extractField(text, "ABN", "A.B.N.", "Australian Business Number");
  if (raw) {
    const digits = raw.replace(/[^\d]/g, "");
    if (digits.length === 11) {
      // Format as XX XXX XXX XXX
      return `${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8, 11)}`;
    }
  }

  // Fallback: look for 11-digit number near "ABN"
  const abnPattern = text.match(
    /ABN\s*[:–\-]?\s*([\d\s]{11,14})/i,
  );
  if (abnPattern) {
    const digits = abnPattern[1].replace(/\s/g, "");
    if (digits.length === 11) {
      return `${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8, 11)}`;
    }
  }

  return null;
}

/**
 * Parse financial year end from various formats:
 *   "Financial Year: 30/06/2026" → "06-30"
 *   "Financial Year End: 30 June" → "06-30"
 *   "FYE: 30/6" → "06-30"
 */
function extractFinancialYear(text: string): string | null {
  const raw = extractField(
    text,
    "Financial Year End",
    "Financial Year",
    "FYE",
    "Fin Year End",
    "Fin. Year End",
    "Year End",
  );
  if (!raw) return null;

  // DD/MM/YYYY or DD-MM-YYYY
  const dmy = raw.match(/(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  if (dmy) {
    const day = dmy[1].padStart(2, "0");
    const month = dmy[2].padStart(2, "0");
    return `${month}-${day}`;
  }

  // DD/MM (no year)
  const dmOnly = raw.match(/(\d{1,2})[/\-.](\d{1,2})\b/);
  if (dmOnly) {
    const day = dmOnly[1].padStart(2, "0");
    const month = dmOnly[2].padStart(2, "0");
    return `${month}-${day}`;
  }

  // "30 June" or "June 30"
  const months: Record<string, string> = {
    january: "01", february: "02", march: "03", april: "04",
    may: "05", june: "06", july: "07", august: "08",
    september: "09", october: "10", november: "11", december: "12",
    jan: "01", feb: "02", mar: "03", apr: "04",
    jun: "06", jul: "07", aug: "08", sep: "09",
    oct: "10", nov: "11", dec: "12",
  };

  const dayMonth = raw.match(/(\d{1,2})\s+([A-Za-z]+)/);
  if (dayMonth) {
    const month = months[dayMonth[2].toLowerCase()];
    if (month) return `${month}-${dayMonth[1].padStart(2, "0")}`;
  }

  const monthDay = raw.match(/([A-Za-z]+)\s+(\d{1,2})/);
  if (monthDay) {
    const month = months[monthDay[1].toLowerCase()];
    if (month) return `${month}-${monthDay[2].padStart(2, "0")}`;
  }

  return null;
}

/**
 * Extract total lots from various labels.
 */
function extractTotalLots(text: string): number | null {
  const raw = extractField(
    text,
    "Total Lots",
    "Number of Lots",
    "No. of Lots",
    "No of Lots",
    "Lots",
    "Total Units",
  );
  if (raw) {
    const n = parseInt(raw, 10);
    if (!isNaN(n) && n > 0) return n;
  }
  return null;
}

/**
 * Extract total entitlement (aggregate units of entitlement).
 */
function extractTotalEntitlement(text: string): number | null {
  // "Aggregate Units of Entitlement: 2400"
  const agg = text.match(
    /Aggregate\s+(?:Units?\s+(?:of\s+)?)?Entitlement\s*[:–\-]?\s*(\d+(?:[.,]\d+)?)/i,
  );
  if (agg) return parseFloat(agg[1].replace(",", ""));

  // "Total Entitlement: 2400" or "Total UOE: 2400"
  const total = text.match(
    /Total\s+(?:Units?\s+(?:of\s+)?)?(?:Entitlement|UOE)\s*[:–\-]?\s*(\d+(?:[.,]\d+)?)/i,
  );
  if (total) return parseFloat(total[1].replace(",", ""));

  return null;
}

/**
 * Extract building/scheme name.
 */
function extractName(text: string): string | null {
  return extractField(
    text,
    "Building Name",
    "Scheme Name",
    "Body Corporate Name",
    "Owners Corporation",
    "Name of Scheme",
    "Property Name",
  );
}

/* ------------------------------------------------------------------ */
/*  Lot table extraction                                               */
/* ------------------------------------------------------------------ */

/**
 * Extract per-lot data from the contribution schedule / lot table.
 *
 * Typical formats:
 *   "1    101    John Smith    100"
 *   "1    John Smith    100"
 *   "Lot 1  Unit 101  Owner: John Smith  Entitlement: 100"
 */
function extractLots(text: string): ParsedLotData[] {
  const lots: ParsedLotData[] = [];

  // Find the contribution schedule section using broad patterns
  const sectionPatterns = [
    /Contribution\s+Schedule/i,
    /Lot\s+(?:Unit\s+)?(?:Name|Owner)\s+(?:Unit\s+)?Entitlement/i,
    /Schedule\s+of\s+(?:Unit\s+)?Entitlement/i,
    /Lot\s+Schedule/i,
    /Lot\s+No\.?\s+Unit/i,
    /(?:Lot|Unit)\s+(?:No\.?|Number)/i,
  ];

  let scheduleStart = -1;
  for (const pattern of sectionPatterns) {
    const idx = text.search(pattern);
    if (idx !== -1) {
      scheduleStart = idx;
      break;
    }
  }

  if (scheduleStart === -1) return lots;

  const scheduleText = text.slice(scheduleStart);

  // Find end of table (various markers)
  const endPatterns = [
    /Aggregate\s+Units/i,
    /Total\s+(?:Units?\s+(?:of\s+)?)?Entitlement/i,
    /\bTotal\b.*\b\d+\s*$/im,
    /Notes?\s*:/i,
    /Certified/i,
    /Secretary/i,
    /Signature/i,
  ];

  let endIdx = scheduleText.length;
  for (const pattern of endPatterns) {
    const idx = scheduleText.search(pattern);
    if (idx > 50 && idx < endIdx) {
      endIdx = idx;
    }
  }

  const tableText = scheduleText.slice(0, Math.min(endIdx, 10000));
  const lines = tableText.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length < 3) continue;

    // Pattern 1: "lot  unit  name  entitlement" (4 columns)
    const fourCol = trimmed.match(
      /^(\d+)\s+([\dA-Za-z]+\d*)\s+(.+?)\s+(\d+(?:\.\d+)?)\s*$/,
    );
    if (fourCol) {
      const entitlement = parseFloat(fourCol[4]);
      if (!isNaN(entitlement) && entitlement > 0) {
        lots.push({
          lotNumber: fourCol[1],
          unitNumber: fourCol[2] || null,
          entitlement,
          ownerName: fourCol[3].trim() || null,
        });
        continue;
      }
    }

    // Pattern 2: "lot  name  entitlement" (3 columns, no unit)
    const threeCol = trimmed.match(
      /^(\d+)\s+(.+?)\s+(\d+(?:\.\d+)?)\s*$/,
    );
    if (threeCol && !isNaN(parseFloat(threeCol[3]))) {
      const entitlement = parseFloat(threeCol[3]);
      if (entitlement > 0) {
        lots.push({
          lotNumber: threeCol[1],
          unitNumber: null,
          entitlement,
          ownerName: threeCol[2].trim() || null,
        });
        continue;
      }
    }

    // Pattern 3: "Lot 1 Unit 101 Owner Name Entitlement 100" (labelled)
    const labelled = trimmed.match(
      /Lot\s+(\d+)\s+(?:Unit\s+([\dA-Za-z]+)\s+)?(.+?)\s+(?:Entitlement\s+)?(\d+(?:\.\d+)?)\s*$/i,
    );
    if (labelled) {
      const entitlement = parseFloat(labelled[4]);
      if (!isNaN(entitlement) && entitlement > 0) {
        lots.push({
          lotNumber: labelled[1],
          unitNumber: labelled[2] || null,
          entitlement,
          ownerName: labelled[3].replace(/[:–\-]\s*$/, "").trim() || null,
        });
      }
    }
  }

  return lots;
}

/* ------------------------------------------------------------------ */
/*  Main parse functions                                               */
/* ------------------------------------------------------------------ */

/**
 * Parse the full text output from a strata roll PDF.
 */
export function parseStrataRollText(text: string): ParsedStrataRoll {
  // Normalise the text for more reliable matching
  const normalised = normaliseWhitespace(text);

  const scheme: ParsedSchemeData = {
    name: extractName(normalised),
    planNumber: extractPlanNumber(normalised),
    address: extractAddress(normalised),
    suburb: extractSuburb(normalised),
    state: extractState(normalised),
    postcode: extractPostcode(normalised),
    abnNumber: extractABN(normalised),
    totalLots: extractTotalLots(normalised),
    totalEntitlement: extractTotalEntitlement(normalised),
    financialYearEnd: extractFinancialYear(normalised),
    buildingType: null,
  };

  // Infer building type from plan number prefix
  if (scheme.planNumber) {
    const upper = scheme.planNumber.toUpperCase();
    if (upper.startsWith("SP")) scheme.buildingType = "STRATA";
    else if (upper.startsWith("PS")) scheme.buildingType = "STRATA";
    else if (upper.startsWith("CP")) scheme.buildingType = "COMMUNITY";
  }

  // If we found a state via fallback but not suburb, try to extract
  // suburb from the address line (often "27 Reynolds St, Cremorne NSW 2090")
  if (!scheme.suburb && scheme.address) {
    const addrParts = scheme.address.match(
      /,\s*([A-Za-z\s]+?)(?:\s+(?:NSW|VIC|QLD|SA|WA|TAS|NT|ACT))?(?:\s+\d{4})?\s*$/,
    );
    if (addrParts) {
      scheme.suburb = addrParts[1].trim();
    }
  }

  // Parse lots from contribution schedule
  const lots = extractLots(normalised);

  // If totalLots wasn't found but we parsed lots, use the count
  if (scheme.totalLots == null && lots.length > 0) {
    scheme.totalLots = lots.length;
  }

  // If totalEntitlement wasn't found but we have lots, sum them
  if (scheme.totalEntitlement == null && lots.length > 0) {
    const sum = lots.reduce((acc, l) => acc + l.entitlement, 0);
    if (sum > 0) scheme.totalEntitlement = sum;
  }

  // Include a preview of the raw text for debugging when parse yields little
  const fieldsFound = Object.values(scheme).filter((v) => v != null).length;
  const rawTextPreview =
    fieldsFound < 3 ? normalised.slice(0, 2000) : undefined;

  return { scheme, lots, rawTextPreview };
}

/**
 * Parse a strata roll PDF buffer and return extracted data.
 */
export async function parseStrataRollPDF(
  buffer: Buffer,
): Promise<ParsedStrataRoll> {
  // Use unpdf for serverless-safe PDF text extraction. It bundles pdfjs-dist
  // internally with proper worker handling, avoiding native addon issues
  // (pdf-parse depended on @napi-rs/canvas) and worker resolution issues
  // (pdfjs-dist directly needs its worker file at a resolvable path).
  const { extractText } = await import("unpdf");

  const data = new Uint8Array(buffer);
  const result = await extractText(data);

  // extractText returns { text: string[], totalPages: number }
  // where text is an array of strings, one per page.
  const fullText = Array.isArray(result.text)
    ? result.text.join("\n")
    : String(result.text ?? "");

  return parseStrataRollText(fullText);
}
