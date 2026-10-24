/**
 * Strata roll PDF reader.
 *
 * Reads scheme details (plan number, address, name, total lots, total unit
 * entitlement, ABN, financial year) and each lot (lot number, unit number,
 * unit entitlement, owner name) from a strata roll.
 *
 * The PDF is read with its layout kept (src/lib/pdf/layout-text.ts): text
 * read in stored order loses the link between labels and values, which is
 * how the roll for SP 99999 came out as 26 lots made of addresses and phone
 * numbers (onboarding review, 24 Oct).
 *
 * Rules (24 Oct):
 *  - Known formats get their own reader. The Urbanise Strata "Owners
 *    Corporation Roll" is read from both its lot table and its lot pages,
 *    and the two are cross-checked.
 *  - Lot number, unit number, unit entitlement and owner name are separate
 *    fields. A lot number is never taken from a unit number or the reverse.
 *  - Owner names are kept exactly as printed (titles, joint owners,
 *    companies). Owners of several lots stay on each lot.
 *  - Nothing is guessed. A total is only what the document prints; a plan
 *    type (SP, PS) only when the document states it. Anything missing,
 *    conflicting or uncertain becomes an issue for the person to review.
 *  - Every value read says which page it came from.
 */

import { readLayoutLines, type LayoutLine } from "@/lib/pdf/layout-text";

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

/** Extra detail for a lot, where the document has it. */
export type ParsedLotDetail = {
  lotNumber: string;
  /** Page of the lot table row, and of the lot's own page (Urbanise). */
  tablePage?: number;
  ownerPage?: number;
  ownerAddress?: string | null;
  ownerEmail?: string | null;
  committeeMember?: boolean | null;
  corporateOwner?: string | null;
};

export type RollIssueKind = "missing" | "conflict" | "uncertain";

export type RollIssue = {
  kind: RollIssueKind;
  /** A stable code for issues the app acts on. */
  code?: "no-text" | "no-lots";
  /** The lot it concerns, when it is about one lot. */
  lotNumber?: string;
  field?: string;
  page?: number;
  message: string;
};

export type ParsedStrataRoll = {
  scheme: ParsedSchemeData;
  lots: ParsedLotData[];
  /** Which reader was used. */
  format: "urbanise-oc-roll" | "generic";
  /** Per-lot sources and extra detail, in the same order as `lots`. */
  details: ParsedLotDetail[];
  /** Pages the scheme values came from, by field name. */
  schemePages: Partial<Record<keyof ParsedSchemeData, number>>;
  /** What the person must check, fill in or resolve. */
  issues: RollIssue[];
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
    // The plan's type is not stated: give the number as printed, and the
    // reader flags it (24 Oct: no "SP" added without a source).
    return v;
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
    /Aggregate[ \t]+(?:Units?[ \t]+(?:of[ \t]+)?)?Entitlement[ \t]*[:–\-]?[ \t]*(\d[\d,]*(?:\.\d+)?)/i,
  );
  if (agg) return parseFloat(agg[1].replace(/,/g, ""));

  // "Total Entitlement: 2400" or "Total UOE: 2400"
  const total = text.match(
    /Total[ \t]+(?:Units?[ \t]+(?:of[ \t]+)?)?(?:Entitlement|UOE)[ \t]*[:–\-]?[ \t]*(\d[\d,]*(?:\.\d+)?)/i,
  );
  if (total) return parseFloat(total[1].replace(/,/g, ""));

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
/*  Lines                                                              */
/* ------------------------------------------------------------------ */

/** A line of the document: text, its page, and its cells when the layout is known. */
type Line = { page: number; text: string; cells: { x: number; text: string }[] };

/** Lines from plain text: pages split on form feeds, cells on runs of 2+ spaces. */
function linesFromText(text: string): Line[] {
  const out: Line[] = [];
  text.split("\f").forEach((pageText, p) => {
    for (const raw of pageText.split(/\r?\n/)) {
      const cells: { x: number; text: string }[] = [];
      const re = /\S+(?: \S+)*/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(raw))) cells.push({ x: m.index * 5, text: m[0] });
      if (cells.length) out.push({ page: p + 1, text: cells.map((c) => c.text).join("   "), cells });
    }
  });
  return out;
}

function linesFromLayout(lines: readonly LayoutLine[]): Line[] {
  return lines.map((l) => ({ page: l.page, text: l.text, cells: l.cells }));
}

const isLabel = (text: string) => /[:?]$/.test(text.trim());

/** "1 Bennelong Point, Sydney NSW 2000" → its parts, or null when it is not that shape. */
function splitAddress(full: string): { address: string; suburb: string; state: string; postcode: string } | null {
  const m = full.trim().match(/^(.*?),\s*([^,]+?)\s+(NSW|VIC|QLD|SA|WA|TAS|NT|ACT)\s+(\d{4})$/);
  if (!m) return null;
  return { address: m[1].trim(), suburb: m[2].trim(), state: m[3], postcode: m[4] };
}

/**
 * Label and value pairs on one line: "Lot:", "1", "Unit No:", "1" →
 * [{lot, 1}, {unit no, 1}]. A value is every cell up to the next label, so
 * two email addresses printed side by side both stay.
 */
function pairsOf(line: Line): { label: string; value: string; valueX: number | null }[] {
  const out: { label: string; value: string; valueX: number | null }[] = [];
  const cells = line.cells;
  for (let i = 0; i < cells.length; i++) {
    const c = cells.at(i)!;
    if (!isLabel(c.text)) continue;
    const values: { x: number; text: string }[] = [];
    while (i + 1 < cells.length && !isLabel(cells.at(i + 1)!.text)) {
      values.push(cells.at(i + 1)!);
      i++;
    }
    out.push({
      label: c.text.replace(/[:?]$/, "").trim().toLowerCase(),
      value: values.map((v) => v.text.trim()).join(" ").trim(),
      valueX: values.at(0)?.x ?? null,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  Urbanise Strata: Owners Corporation Roll                           */
/* ------------------------------------------------------------------ */

const URBANISE_LOT_PAGE = /^Owners Corporation Roll - Lot:\s*([^,\s]+)\s*,\s*Unit:\s*([^\s(]*)/i;

/** Only a roll with Urbanise's per-lot pages, or its printed-from footer, is read as Urbanise. */
function isUrbaniseRoll(lines: readonly Line[]): boolean {
  return (
    lines.some((l) => /OWNERS CORPORATION ROLL/i.test(l.text)) &&
    lines.some((l) => URBANISE_LOT_PAGE.test(l.text) || /Printed from Urbanise/i.test(l.text))
  );
}

type TableRow = { lotNumber: string; unitNumber: string | null; entitlement: number; page: number };

const NUMBER = /^\d[\d,]*(?:\.\d+)?$/;
const toNumber = (t: string | undefined) => (t && NUMBER.test(t.replace(/\s/g, "")) ? Number(t.replace(/[,\s]/g, "")) : null);

/** Page furniture that may sit between table rows when the table runs onto a new page. */
function isFurniture(line: Line): boolean {
  return /Owners Corporation for Plan|OWNERS CORPORATION ROLL|Printed from|Printed \d|Page \d+|Plan Information|Entitlement Information|Insurance Information/i.test(line.text);
}

function isTableHeader(line: Line): boolean {
  const t = line.cells.map((c) => c.text.toLowerCase());
  return t.length >= 3 && t.at(0) === "lot" && t.includes("unit") && t.some((x) => /lot ent|entitlement/.test(x));
}

/**
 * The roll's lot table: "Lot | Unit | Lot Liab | Lot Ent" rows, then the
 * printed totals. It may run over several pages (page furniture and a
 * repeated header are skipped). A cell is only taken when it sits under a
 * column; anything else on the line (an insurance panel beside the table)
 * is left alone. A row that cannot be read is reported, not used, and does
 * not end the table.
 */
function urbaniseLotTable(lines: readonly Line[]): { rows: TableRow[]; totalEntitlement: number | null; page: number | null; issues: RollIssue[] } {
  const issues: RollIssue[] = [];
  const headerIndex = lines.findIndex(isTableHeader);
  if (headerIndex < 0) return { rows: [], totalEntitlement: null, page: null, issues };
  const header = lines.at(headerIndex)!;
  const col = (pred: (t: string) => boolean) => header.cells.find((c) => pred(c.text.toLowerCase()))?.x ?? null;
  const xs: Record<"lot" | "unit" | "liab" | "ent", number | null> = {
    lot: col((t) => t === "lot"),
    unit: col((t) => t === "unit"),
    liab: col((t) => /liab/.test(t)),
    ent: col((t) => /lot ent|entitlement/.test(t)),
  };
  const columns = (Object.entries(xs).filter(([, x]) => x !== null) as [keyof typeof xs, number][]).sort((a, b) => a[1] - b[1]);
  const gaps = columns.slice(1).map((c, i) => c[1] - columns.at(i)![1]);
  const reach = Math.max(8, Math.min(...gaps) / 2);

  const rows: TableRow[] = [];
  let totalEntitlement: number | null = null;
  let misses = 0;
  for (const line of lines.slice(headerIndex + 1)) {
    if (URBANISE_LOT_PAGE.test(line.text)) break; // the lot pages begin
    if (isTableHeader(line) || isFurniture(line)) continue;
    const byCol: Partial<Record<keyof typeof xs, string>> = {};
    let clash = false;
    for (const cell of line.cells) {
      const nearest = columns.reduce((best, c) => (Math.abs(c[1] - cell.x) < Math.abs(best[1] - cell.x) ? c : best));
      if (Math.abs(nearest[1] - cell.x) > reach) continue; // not under a column
      if (byCol[nearest[0]] !== undefined) clash = true;
      else byCol[nearest[0]] = cell.text.trim();
    }
    const ent = toNumber(byCol.ent);
    if (byCol.lot && /^[A-Za-z0-9-]{1,10}$/.test(byCol.lot) && ent !== null && !clash) {
      rows.push({ lotNumber: byCol.lot, unitNumber: byCol.unit || null, entitlement: ent, page: line.page });
      misses = 0;
    } else if (!byCol.lot && ent !== null && !clash) {
      totalEntitlement = ent;
      break;
    } else if (Object.keys(byCol).length) {
      issues.push({ kind: "uncertain", page: line.page, message: `A line in the roll's lot table could not be read: "${line.text.replace(/\s{2,}/g, " ")}" (page ${line.page}). Check whether it is a lot.` });
      if (++misses >= 3) break;
    } else if (++misses >= 3) {
      break;
    }
  }
  return { rows, totalEntitlement, page: header.page, issues };
}

type LotPage = {
  lotNumber: string;
  unitNumber: string | null;
  entitlement: number | null;
  owner: string | null;
  /** More than one "Registered Lot Owner" line was printed. */
  ownerLines: number;
  corporateOwner: string | null;
  corporateId: string | null;
  ownerAddress: string | null;
  ownerEmail: string | null;
  committeeMember: boolean | null;
  page: number;
};

const SECTION_HEADING = /^\d+\s+[A-Z][A-Z &/()'-]{5,}$/;

/** Each lot's own pages: "Owners Corporation Roll - Lot: n, Unit: m" and its owner section. */
function urbaniseLotPages(lines: readonly Line[]): Map<string, LotPage> {
  const lots = new Map<string, LotPage>();
  let current: LotPage | null = null;
  let section: "lot" | "owner" | "tenant" | "other" = "other";
  let last: { field: "owner" | "corporateOwner" | "ownerAddress"; x: number } | null = null;
  for (const line of lines) {
    const head = line.text.match(URBANISE_LOT_PAGE);
    if (head) {
      const lotNumber = head[1];
      // The same lot continuing onto another page keeps its place in it.
      if ((current as LotPage | null)?.lotNumber === lotNumber) continue;
      current = lots.get(lotNumber) ?? {
        lotNumber,
        unitNumber: head[2] || null,
        entitlement: null,
        owner: null,
        ownerLines: 0,
        corporateOwner: null,
        corporateId: null,
        ownerAddress: null,
        ownerEmail: null,
        committeeMember: null,
        page: line.page,
      };
      lots.set(lotNumber, current);
      section = "other";
      last = null;
      continue;
    }
    if (!current) continue;
    if (isFurniture(line) && !pairsOf(line).length) continue;
    const flat = line.text.replace(/\s{2,}/g, " ");
    if (/^\d+\s+PLAN & LOT INFORMATION/i.test(flat)) {
      section = "lot";
      last = null;
      continue;
    }
    if (/^\d+\s+CURRENT OWNER INFORMATION/i.test(flat)) {
      section = "owner";
      last = null;
      continue;
    }
    if (SECTION_HEADING.test(flat)) {
      section = "other";
      last = null;
      continue;
    }

    const pairs = pairsOf(line);
    // A line with one cell under the previous value continues it (a long name or address).
    if (!pairs.length && last && line.cells.length === 1 && Math.abs(line.cells[0].x - last.x) < 8) {
      const prev = current[last.field];
      current[last.field] = prev ? `${prev} ${line.cells[0].text.trim()}` : line.cells[0].text.trim();
      continue;
    }
    last = null;
    for (const { label, value, valueX } of pairs) {
      if (label === "tenant") section = "tenant";
      if (section === "lot") {
        if (label === "unit no" && value) current.unitNumber = value;
        if (label === "lot entitlement" && toNumber(value) !== null) current.entitlement = toNumber(value);
      }
      if (section === "owner") {
        if (label === "registered lot owner") {
          if (value) {
            current.ownerLines++;
            current.owner = current.owner ? `${current.owner} and ${value}` : value;
          }
          if (valueX !== null) last = { field: "owner", x: valueX };
        } else if (label === "corporate owner") {
          current.corporateOwner = value || null;
          if (valueX !== null) last = { field: "corporateOwner", x: valueX };
        } else if (label === "if corporate owner, abn/acn") {
          current.corporateId = value || null;
        } else if (label === "residential or business address" && current.ownerAddress === null) {
          current.ownerAddress = value || null;
          if (valueX !== null) last = { field: "ownerAddress", x: valueX };
        } else if (label === "email" && current.ownerEmail === null) {
          current.ownerEmail = value || null;
        } else if (label === "committee member") {
          current.committeeMember = /^y/i.test(value) ? true : /^n/i.test(value) ? false : null;
        }
      }
    }
  }
  return lots;
}

function emptyScheme(): ParsedSchemeData {
  return {
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
}

function parseUrbaniseRoll(lines: readonly Line[]): ParsedStrataRoll {
  const issues: RollIssue[] = [];
  const schemePages: ParsedStrataRoll["schemePages"] = {};
  const scheme = emptyScheme();

  // Scheme details, from the first page that has them.
  for (const line of lines) {
    for (const { label, value } of pairsOf(line)) {
      if (label === "property name" && value && !scheme.name) {
        scheme.name = value;
        schemePages.name = line.page;
      }
      if (label === "property address" && value && !scheme.address) {
        const parts = splitAddress(value);
        if (parts) {
          Object.assign(scheme, parts);
        } else {
          scheme.address = value;
          issues.push({ kind: "uncertain", field: "address", page: line.page, message: `The property address "${value}" could not be split into street, suburb, state and postcode. Check each part.` });
        }
        schemePages.address = schemePages.suburb = schemePages.state = schemePages.postcode = line.page;
      }
    }
    const plan = !scheme.planNumber && line.text.match(/\bPlan No\.?:?\s*((?:SP|PS|CP|DP)?\s*\d{1,7})\b/i);
    if (plan) {
      scheme.planNumber = plan[1].replace(/\s+/g, " ").trim().toUpperCase();
      schemePages.planNumber = line.page;
    }
  }
  if (scheme.planNumber && !/^(SP|PS|CP|DP)\b/i.test(scheme.planNumber)) {
    issues.push({
      kind: "uncertain",
      field: "planNumber",
      page: schemePages.planNumber,
      message: `The roll gives the plan number as "${scheme.planNumber}" without saying what kind of plan it is. Add the prefix (for example SP for a strata plan) from the plan or the financial statements.`,
    });
  }
  if (scheme.planNumber?.toUpperCase().startsWith("SP")) scheme.buildingType = "STRATA";

  const table = urbaniseLotTable(lines);
  issues.push(...table.issues);
  const pages = urbaniseLotPages(lines);

  // Every lot the roll shows: the table's order first, then any lot that has
  // a page of its own but no table row (kept, and flagged).
  const order: string[] = table.rows.map((r) => r.lotNumber);
  if (!table.rows.length && pages.size) {
    issues.push({ kind: "uncertain", message: "The roll's lot table was not found, so the lots were read from each lot's own page only. Check the list is complete." });
  }
  for (const lotNumber of pages.keys()) {
    if (!order.includes(lotNumber)) {
      if (table.rows.length)
        issues.push({ kind: "conflict", lotNumber, page: pages.get(lotNumber)!.page, message: `Lot ${lotNumber} has its own page in the roll (page ${pages.get(lotNumber)!.page}) but is not in the lot table. Check whether it belongs to this building.` });
      order.push(lotNumber);
    }
  }

  const seen = new Set<string>();
  const lots: ParsedLotData[] = [];
  const details: ParsedLotDetail[] = [];
  for (const lotNumber of order) {
    if (seen.has(lotNumber)) {
      issues.push({ kind: "conflict", lotNumber, message: `Lot ${lotNumber} appears twice in the roll's lot table. Only the first is used.` });
      continue;
    }
    seen.add(lotNumber);
    const row = table.rows.find((r) => r.lotNumber === lotNumber);
    const page = pages.get(lotNumber);
    const unitNumber = row?.unitNumber ?? page?.unitNumber ?? null;
    const entitlement = row?.entitlement ?? page?.entitlement ?? 0;

    if (row && page) {
      if (page.unitNumber && row.unitNumber && page.unitNumber !== row.unitNumber)
        issues.push({ kind: "conflict", lotNumber, field: "unitNumber", page: page.page, message: `Lot ${lotNumber}: the lot table gives unit ${row.unitNumber} (page ${row.page}), its own page gives unit ${page.unitNumber} (page ${page.page}).` });
      if (page.entitlement !== null && page.entitlement !== row.entitlement)
        issues.push({ kind: "conflict", lotNumber, field: "entitlement", page: page.page, message: `Lot ${lotNumber}: the lot table gives a unit entitlement of ${row.entitlement} (page ${row.page}), its own page gives ${page.entitlement} (page ${page.page}).` });
    }
    if (!page) issues.push({ kind: "missing", lotNumber, field: "ownerName", message: `Lot ${lotNumber} has no page of its own in the roll, so its owner could not be read. Enter the owner's name as it appears on the strata roll.` });
    if (!entitlement) issues.push({ kind: "missing", lotNumber, field: "entitlement", message: `Lot ${lotNumber}: no unit entitlement was found. Enter it from the roll.` });

    // The owner, exactly as printed. A company owner is used as printed only
    // when no registered owner is printed; its ABN or ACN stays in details.
    let ownerName = page?.owner ?? null;
    if (page && page.ownerLines > 1)
      issues.push({ kind: "uncertain", lotNumber, field: "ownerName", page: page.page, message: `Lot ${lotNumber}: the roll prints ${page.ownerLines} registered owner lines (page ${page.page}). They were joined as "${page.owner}". Check the name against the roll.` });
    if (!ownerName && page?.corporateOwner) {
      ownerName = page.corporateOwner;
      issues.push({ kind: "uncertain", lotNumber, field: "ownerName", page: page.page, message: `Lot ${lotNumber}: only a corporate owner is recorded ("${page.corporateOwner}"${page.corporateId ? `, ABN/ACN ${page.corporateId}` : ""}). Check how the strata roll should show it.` });
    }
    if (page && page.owner && page.corporateOwner && page.corporateOwner !== page.owner)
      issues.push({ kind: "uncertain", lotNumber, field: "ownerName", page: page.page, message: `Lot ${lotNumber}: the roll records both "${page.owner}" and a corporate owner "${page.corporateOwner}". Check which name the strata roll should show.` });
    if (page && !ownerName) issues.push({ kind: "missing", lotNumber, field: "ownerName", page: page.page, message: `Lot ${lotNumber}: no registered owner is printed on its page (page ${page.page}). Enter the owner's name as it appears on the strata roll.` });

    lots.push({ lotNumber, unitNumber, entitlement, ownerName });
    details.push({
      lotNumber,
      tablePage: row?.page,
      ownerPage: page?.page,
      ownerAddress: page?.ownerAddress ?? null,
      ownerEmail: page?.ownerEmail ?? null,
      committeeMember: page?.committeeMember ?? null,
      corporateOwner: page?.corporateOwner ?? null,
    });
  }

  // Totals: only what the roll prints, checked against the lots. The roll
  // does not print the number of lots, so that is left for the person (it is
  // what the lots read are checked against).
  const sum = lots.reduce((s, l) => s + l.entitlement, 0);
  if (table.totalEntitlement !== null) {
    scheme.totalEntitlement = table.totalEntitlement;
    schemePages.totalEntitlement = table.page ?? undefined;
    if (sum !== table.totalEntitlement)
      issues.push({ kind: "conflict", field: "totalEntitlement", page: table.page ?? undefined, message: `The roll prints a total unit entitlement of ${table.totalEntitlement}, but its lots add up to ${sum}.` });
  } else if (lots.length) {
    issues.push({ kind: "missing", field: "totalEntitlement", message: `The roll does not print a total unit entitlement. The lots read add up to ${sum}. Enter the total from the strata plan.` });
  }
  if (lots.length) {
    issues.push({
      kind: "missing",
      field: "totalLots",
      page: table.page ?? undefined,
      message: `The roll does not print the number of lots. ${lots.length} lots were read${table.page ? ` (lot table on page ${table.page})` : ""}. Enter the building's total lots from the strata plan.`,
    });
  } else {
    issues.push({ kind: "missing", code: "no-lots", message: "No lots could be read from this roll. Enter the lots by hand." });
  }
  issues.push({ kind: "missing", field: "financialYearEnd", message: "The roll does not show the financial year end. Take it from the financial statements." });

  return { scheme, lots, format: "urbanise-oc-roll", details, schemePages, issues };
}

/* ------------------------------------------------------------------ */
/*  Other rolls: a lot table under a recognised heading                */
/* ------------------------------------------------------------------ */

const PHONE = /\b0\d{3}[ -]?(?:\d{3}[ -]?\d{3}|[A-Z]{2,6}[ -]?\d{2,3})\b|\b0\d[ -]?\d{4}[ -]?\d{4}\b/;
const POSTCODE_END = /\b(NSW|VIC|QLD|SA|WA|TAS|NT|ACT)\s*$/;

function extractLots(lines: readonly Line[]): { lots: ParsedLotData[]; pages: number[]; issues: RollIssue[] } {
  const lots: ParsedLotData[] = [];
  const pages: number[] = [];
  const issues: RollIssue[] = [];

  const sectionPatterns = [
    /Contribution\s+Schedule/i,
    /Lot\s+(?:Unit\s+)?(?:Name|Owner)\s+(?:Unit\s+)?Entitlement/i,
    /Schedule\s+of\s+(?:Unit\s+)?Entitlement/i,
    /Lot\s+Schedule/i,
    /Lot\s+No\.?\s+Unit/i,
    /(?:Lot|Unit)\s+(?:No\.?|Number)/i,
  ];
  let start = -1;
  for (const pattern of sectionPatterns) {
    start = lines.findIndex((l) => pattern.test(l.text));
    if (start !== -1) break;
  }
  if (start === -1) return { lots, pages, issues };

  const endPatterns = [/^Aggregate\s+Units/i, /^Total\s+(?:Units?\s+(?:of\s+)?)?Entitlement/i, /^\s*Total\b/i, /^Notes?\s*:/i, /Certified/i, /Secretary/i, /Signature/i];
  // A column header ("Lot  Unit  Owner  Total Entitlement") is not the end of the table.
  const looksLikeHeader = (t: string) => /\bLot\b/i.test(t) && /\b(Unit|Owner|Name)\b/i.test(t) && !/\d{2,}/.test(t);
  const seen = new Set<string>();
  for (const line of lines.slice(start + 1, start + 3000)) {
    const trimmed = line.text.replace(/\s+/g, " ").trim();
    if (looksLikeHeader(trimmed)) continue;
    if (endPatterns.some((p) => p.test(trimmed))) break;
    if (trimmed.length < 3) continue;

    let found: ParsedLotData | null = null;
    // With cells (layout or 2+ spaces): lot | name | entitlement, or lot | unit | name | entitlement.
    const c = line.cells.map((x) => x.text.trim());
    const isEnt = (t: string | undefined) => toNumber(t) !== null && toNumber(t)! > 0;
    if (c.length === 3 && /^[A-Za-z0-9-]{1,8}$/.test(c[0]) && isEnt(c[2])) {
      found = { lotNumber: c[0], unitNumber: null, entitlement: toNumber(c[2])!, ownerName: c[1] || null };
    } else if (c.length === 4 && /^[A-Za-z0-9-]{1,8}$/.test(c[0]) && /^[A-Za-z0-9/-]{1,10}$/.test(c[1]) && isEnt(c[3])) {
      found = { lotNumber: c[0], unitNumber: c[1], entitlement: toNumber(c[3])!, ownerName: c[2] || null };
    }
    if (!found) {
      const labelled = trimmed.match(/Lot\s+(\d+[A-Za-z]?)\s+(?:Unit\s+([\dA-Za-z]+)\s+)?(.+?)\s+(?:Entitlement\s+)?(\d+(?:\.\d+)?)\s*$/i);
      const fourCol = trimmed.match(/^(\d+[A-Za-z]?)\s+(\d+[A-Za-z]?)\s+(.+?)\s+(\d+(?:\.\d+)?)\s*$/);
      const threeCol = trimmed.match(/^(\d+[A-Za-z]?)\s+(.+?)\s+(\d+(?:\.\d+)?)\s*$/);
      if (labelled) found = { lotNumber: labelled[1], unitNumber: labelled[2] || null, entitlement: parseFloat(labelled[4]), ownerName: labelled[3].replace(/[:–\-]\s*$/, "").trim() || null };
      else if (fourCol) found = { lotNumber: fourCol[1], unitNumber: fourCol[2], entitlement: parseFloat(fourCol[4]), ownerName: fourCol[3].trim() || null };
      else if (threeCol) found = { lotNumber: threeCol[1], unitNumber: null, entitlement: parseFloat(threeCol[3]), ownerName: threeCol[2].trim() || null };
    }
    if (!found || !(found.entitlement > 0)) continue;

    // Not a lot: a phone number ("0400 TEST 01"), or an address whose
    // "entitlement" is really its postcode ("1 Bennelong Point, Sydney NSW 2000").
    const before = trimmed.slice(0, trimmed.lastIndexOf(String(found.entitlement).split(".")[0])).trim();
    if (PHONE.test(trimmed) && found.ownerName && found.ownerName.replace(/[^A-Za-z]/g, "").length <= 6) {
      issues.push({ kind: "uncertain", page: line.page, message: `A line in the lot table looks like a phone number and was not read as a lot: "${trimmed}" (page ${line.page}).` });
      continue;
    }
    if (POSTCODE_END.test(before) && found.entitlement >= 200 && found.entitlement <= 9999 && Number.isInteger(found.entitlement)) {
      issues.push({ kind: "uncertain", page: line.page, message: `A line in the lot table looks like an address and was not read as a lot: "${trimmed}" (page ${line.page}). Check whether it is a lot.` });
      continue;
    }
    if (found.ownerName && (PHONE.test(found.ownerName) || /@/.test(found.ownerName)))
      issues.push({ kind: "uncertain", lotNumber: found.lotNumber, field: "ownerName", page: line.page, message: `Lot ${found.lotNumber}: the owner name read includes a phone number or email ("${found.ownerName}"). Check the name against the roll.` });

    if (seen.has(found.lotNumber)) {
      issues.push({ kind: "conflict", lotNumber: found.lotNumber, page: line.page, message: `Lot ${found.lotNumber} appears twice in the lot table (page ${line.page}). Only the first is used.` });
      continue;
    }
    seen.add(found.lotNumber);
    lots.push(found);
    pages.push(line.page);
  }
  return { lots, pages, issues };
}

/* ------------------------------------------------------------------ */
/*  Main parse functions                                               */
/* ------------------------------------------------------------------ */

/** The document as text, with each "Label:" starting its own line so a value never runs into the next label. */
function labelledText(lines: readonly Line[]): string {
  return lines
    .map((l) => {
      const parts: string[] = [];
      for (const c of l.cells) {
        if (parts.length && isLabel(c.text)) parts.push("\n" + c.text);
        else parts.push(c.text);
      }
      return parts.join("   ").replace(/ {3}\n/g, "\n");
    })
    .join("\n");
}

function parseGeneric(lines: readonly Line[]): ParsedStrataRoll {
  const normalised = normaliseWhitespace(labelledText(lines));
  const issues: RollIssue[] = [];
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

  if (scheme.planNumber) {
    const upper = scheme.planNumber.toUpperCase();
    if (upper.startsWith("SP")) scheme.buildingType = "STRATA";
    else if (upper.startsWith("PS")) scheme.buildingType = "STRATA";
    else if (upper.startsWith("CP")) scheme.buildingType = "COMMUNITY";
    else issues.push({ kind: "uncertain", field: "planNumber", message: `The plan number "${scheme.planNumber}" does not say what kind of plan it is. Add the prefix (for example SP).` });
  }

  // Suburb from the address line ("27 Reynolds St, Cremorne NSW 2090").
  if (!scheme.suburb && scheme.address) {
    const addrParts = scheme.address.match(/,\s*([A-Za-z\s]+?)(?:\s+(?:NSW|VIC|QLD|SA|WA|TAS|NT|ACT))?(?:\s+\d{4})?\s*$/);
    if (addrParts) scheme.suburb = addrParts[1].trim();
  }

  const found = extractLots(lines);
  issues.push(...found.issues);
  const lots = found.lots;
  const sum = lots.reduce((acc, l) => acc + l.entitlement, 0);

  // Totals are only what the roll prints (24 Oct): counting the rows read is
  // not the building's total.
  if (lots.length) {
    if (scheme.totalLots === null)
      issues.push({ kind: "missing", field: "totalLots", message: `The roll does not print the number of lots. ${lots.length} lots were read from its table. Enter the building's total lots from the strata plan.` });
    else if (scheme.totalLots !== lots.length)
      issues.push({ kind: "conflict", field: "totalLots", message: `The roll prints ${scheme.totalLots} lots, but ${lots.length} were read from its table.` });
    if (scheme.totalEntitlement === null)
      issues.push({ kind: "missing", field: "totalEntitlement", message: `The roll does not print a total unit entitlement. The lots read add up to ${sum}. Enter the total from the strata plan.` });
    else if (scheme.totalEntitlement !== sum)
      issues.push({ kind: "conflict", field: "totalEntitlement", message: `The roll prints a total unit entitlement of ${scheme.totalEntitlement}, but the lots read add up to ${sum}.` });
    for (const l of lots) if (!l.ownerName) issues.push({ kind: "missing", lotNumber: l.lotNumber, field: "ownerName", message: `Lot ${l.lotNumber}: no owner name was read. Enter it as it appears on the strata roll.` });
  } else {
    issues.push({ kind: "missing", code: "no-lots", message: "No lot table was found on this roll. Enter the lots by hand." });
  }

  const fieldsFound = Object.values(scheme).filter((v) => v != null).length;
  const rawTextPreview = fieldsFound < 3 ? normalised.slice(0, 2000) : undefined;
  return {
    scheme,
    lots,
    format: "generic",
    details: lots.map((l, i) => ({ lotNumber: l.lotNumber, tablePage: found.pages.at(i) })),
    schemePages: {},
    issues,
    rawTextPreview,
  };
}

function parseLines(lines: readonly Line[]): ParsedStrataRoll {
  if (lines.length === 0) {
    const empty = parseGeneric(lines);
    // A scanned roll has pictures of text, not text: say so rather than "no lots found".
    return {
      ...empty,
      issues: [{ kind: "missing", code: "no-text", message: "This PDF has no text that can be read. It may be a scanned image. Enter the building and its lots by hand, or upload a PDF exported from the strata system." }],
    };
  }
  if (isUrbaniseRoll(lines)) {
    const urbanise = parseUrbaniseRoll(lines);
    if (urbanise.lots.length) return urbanise;
    // Not the Urbanise layout after all: try the general reader.
    const generic = parseGeneric(lines);
    if (generic.lots.length) return generic;
    return urbanise;
  }
  return parseGeneric(lines);
}

/** Read a strata roll from plain text (form feeds between pages, as pdftotext writes it). */
export function parseStrataRollText(text: string): ParsedStrataRoll {
  return parseLines(linesFromText(text));
}

/** Read a strata roll from layout lines (see readLayoutLines). */
export function parseStrataRollLayout(lines: readonly LayoutLine[]): ParsedStrataRoll {
  return parseLines(linesFromLayout(lines));
}

/** At most this many pages are read from one roll. */
export const MAX_ROLL_PAGES = 600;

/** Read a strata roll PDF, keeping its layout. */
export async function parseStrataRollPDF(buffer: Buffer): Promise<ParsedStrataRoll> {
  const { lines } = await readLayoutLines(new Uint8Array(buffer), { maxPages: MAX_ROLL_PAGES });
  return parseStrataRollLayout(lines);
}
