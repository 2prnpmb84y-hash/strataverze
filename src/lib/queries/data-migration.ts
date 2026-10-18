import crypto from "crypto";
import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";
import type {
  Varchar,
} from "@prisma/orm-postgres/target/codec-types";
import { logActivity } from "@/lib/queries/activity-log";
import {
  getNextEntryNumber,
  createJournalEntry,
} from "@/lib/queries/journal-entries";

// ─── Prisma 8 Branded-Type Helpers ────────────────────────────

function toVarchar<N extends number>(value: string): Varchar<N> {
  return value as unknown as Varchar<N>;
}

// ─── Types & Interfaces ──────────────────────────────────────

export type SourceSystem = "strata_master" | "stratamax" | "myob" | "xero";

export type MigrationDataType =
  | "lots"
  | "owners"
  | "chart_of_accounts"
  | "opening_balances";

export type MigrationStatus =
  | "DRAFT"
  | "VALIDATED"
  | "CONFIRMED"
  | "POSTED"
  | "FAILED";

export interface FieldMapping {
  sourceColumn: number;
  targetField: string;
  transform?: "date_au" | "date_iso" | "currency" | "uppercase" | "trim";
}

export interface MigrationTemplate {
  sourceSystem: SourceSystem;
  dataType: MigrationDataType;
  requiredFields: string[];
  optionalFields: string[];
  defaultMappings: Record<string, number>; // targetField -> default column index
}

export interface MigrationRow {
  rowNumber: number;
  data: Record<string, string>;
  errors: string[];
  warnings: string[];
}

export interface MigrationResult {
  id: string;
  schemeId: string;
  sourceSystem: SourceSystem;
  dataType: MigrationDataType;
  status: MigrationStatus;
  totalRows: number;
  validRows: number;
  errorRows: number;
  rows: MigrationRow[];
  createdAt: string;
  confirmedAt?: string;
  postedAt?: string;
}

// ─── CSV Parsing ─────────────────────────────────────────────

/**
 * Parse a single CSV line, handling quoted fields and commas within values.
 */
export function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const ch = line[i];

    if (inQuotes) {
      if (ch === '"') {
        // Escaped quote (double-quote inside quoted field)
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i += 2;
          continue;
        }
        // End of quoted field
        inQuotes = false;
        i++;
        continue;
      }
      current += ch;
      i++;
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
      } else if (ch === ",") {
        fields.push(current.trim());
        current = "";
        i++;
      } else {
        current += ch;
        i++;
      }
    }
  }

  fields.push(current.trim());
  return fields;
}

/**
 * Parse CSV content into headers and data rows. Skips empty lines.
 */
export function parseCSVContent(content: string): {
  headers: string[];
  rows: string[][];
} {
  const lines = content
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = parseCSVLine(lines[0]);
  const rows = lines.slice(1).map(parseCSVLine);

  return { headers, rows };
}

/**
 * Parse a date string from various formats.
 * Supports DD/MM/YYYY (Australian), YYYY-MM-DD (ISO), and YYYYMMDD.
 * Returns ISO date string (YYYY-MM-DD) or null if unparseable.
 */
export function parseDate(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  // DD/MM/YYYY (Australian format)
  const auMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (auMatch) {
    const [, dd, mm, yyyy] = auMatch;
    const day = dd.padStart(2, "0");
    const month = mm.padStart(2, "0");
    const d = new Date(`${yyyy}-${month}-${day}T00:00:00`);
    if (!isNaN(d.getTime())) return `${yyyy}-${month}-${day}`;
    return null;
  }

  // YYYY-MM-DD (ISO format)
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const d = new Date(`${trimmed}T00:00:00`);
    if (!isNaN(d.getTime())) return trimmed;
    return null;
  }

  // YYYYMMDD (compact format)
  const compactMatch = trimmed.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compactMatch) {
    const [, yyyy, mm, dd] = compactMatch;
    const iso = `${yyyy}-${mm}-${dd}`;
    const d = new Date(`${iso}T00:00:00`);
    if (!isNaN(d.getTime())) return iso;
    return null;
  }

  return null;
}

// ─── Migration Templates ────────────────────────────────────

/**
 * Known field mapping templates keyed by `${sourceSystem}_${dataType}`.
 * defaultMappings maps each target field to the column index in the source CSV.
 */
export const MIGRATION_TEMPLATES: Record<string, MigrationTemplate> = {
  // ── Strata Master ────────────────────────────────────────
  strata_master_lots: {
    sourceSystem: "strata_master",
    dataType: "lots",
    requiredFields: ["lotNumber", "entitlement"],
    optionalFields: ["unitNumber", "floorArea", "lotType"],
    defaultMappings: {
      lotNumber: 0,
      unitNumber: 1,
      entitlement: 2,
      floorArea: 3,
      lotType: 4,
    },
  },
  strata_master_chart_of_accounts: {
    sourceSystem: "strata_master",
    dataType: "chart_of_accounts",
    requiredFields: ["code", "name", "accountType"],
    optionalFields: ["accountSubType", "fundType"],
    defaultMappings: {
      code: 0,
      name: 1,
      accountType: 2,
      accountSubType: 3,
      fundType: 4,
    },
  },
  strata_master_opening_balances: {
    sourceSystem: "strata_master",
    dataType: "opening_balances",
    requiredFields: ["accountCode", "debit", "credit"],
    optionalFields: ["fundName", "description"],
    defaultMappings: {
      accountCode: 0,
      debit: 1,
      credit: 2,
      fundName: 3,
      description: 4,
    },
  },

  // ── StrataMax ────────────────────────────────────────────
  stratamax_lots: {
    sourceSystem: "stratamax",
    dataType: "lots",
    requiredFields: ["lotNumber", "entitlement"],
    optionalFields: ["unitNumber", "floorArea", "lotType"],
    defaultMappings: {
      lotNumber: 0, // LotNo
      unitNumber: 1, // UnitNo
      entitlement: 2, // Entitlement
      floorArea: 3, // Area
      lotType: 4, // Type
    },
  },
  stratamax_chart_of_accounts: {
    sourceSystem: "stratamax",
    dataType: "chart_of_accounts",
    requiredFields: ["code", "name", "accountType"],
    optionalFields: ["accountSubType", "fundType"],
    defaultMappings: {
      code: 0, // AccCode
      name: 1, // AccName
      accountType: 2, // AccType
      accountSubType: 3, // SubType
      fundType: 4, // Fund
    },
  },
  stratamax_opening_balances: {
    sourceSystem: "stratamax",
    dataType: "opening_balances",
    requiredFields: ["accountCode", "debit", "credit"],
    optionalFields: ["fundName", "description"],
    defaultMappings: {
      accountCode: 0, // Account
      debit: 1, // Dr
      credit: 2, // Cr
      fundName: 3, // Fund
      description: 4, // Narration
    },
  },

  // ── MYOB ─────────────────────────────────────────────────
  myob_lots: {
    sourceSystem: "myob",
    dataType: "lots",
    requiredFields: ["lotNumber", "entitlement"],
    optionalFields: ["unitNumber", "floorArea", "lotType"],
    defaultMappings: {
      lotNumber: 0,
      unitNumber: 1,
      entitlement: 2,
      floorArea: 3,
      lotType: 4,
    },
  },
  myob_chart_of_accounts: {
    sourceSystem: "myob",
    dataType: "chart_of_accounts",
    requiredFields: ["code", "name", "accountType"],
    optionalFields: ["accountSubType", "fundType"],
    defaultMappings: {
      code: 0,
      name: 1,
      accountType: 2,
      accountSubType: 3,
      fundType: 4,
    },
  },
  myob_opening_balances: {
    sourceSystem: "myob",
    dataType: "opening_balances",
    requiredFields: ["accountCode", "debit", "credit"],
    optionalFields: ["fundName", "description"],
    defaultMappings: {
      accountCode: 0,
      debit: 1,
      credit: 2,
      fundName: 3,
      description: 4,
    },
  },

  // ── Xero ─────────────────────────────────────────────────
  xero_lots: {
    sourceSystem: "xero",
    dataType: "lots",
    requiredFields: ["lotNumber", "entitlement"],
    optionalFields: ["unitNumber", "floorArea", "lotType"],
    defaultMappings: {
      lotNumber: 0,
      unitNumber: 1,
      entitlement: 2,
      floorArea: 3,
      lotType: 4,
    },
  },
  xero_chart_of_accounts: {
    sourceSystem: "xero",
    dataType: "chart_of_accounts",
    requiredFields: ["code", "name", "accountType"],
    optionalFields: ["accountSubType", "fundType"],
    defaultMappings: {
      code: 0,
      name: 1,
      accountType: 2,
      accountSubType: 3,
      fundType: 4,
    },
  },
  xero_opening_balances: {
    sourceSystem: "xero",
    dataType: "opening_balances",
    requiredFields: ["accountCode", "debit", "credit"],
    optionalFields: ["fundName", "description"],
    defaultMappings: {
      accountCode: 0,
      debit: 1,
      credit: 2,
      fundName: 3,
      description: 4,
    },
  },
};

// ─── Header-Pattern Detection ───────────────────────────────

/** Known header signatures per source system. */
const SOURCE_SYSTEM_HEADERS: Record<SourceSystem, string[][]> = {
  strata_master: [
    ["lotnumber", "unitnumber", "entitlement"],
    ["code", "name", "accounttype"],
    ["accountcode", "debit", "credit"],
  ],
  stratamax: [
    ["lotno", "unitno", "entitlement"],
    ["acccode", "accname", "acctype"],
    ["account", "dr", "cr"],
  ],
  myob: [
    ["account number", "account name", "account type"],
    ["co./last name", "first name", "addr 1"],
  ],
  xero: [
    ["*code", "*name", "*type"],
    ["*contactname", "emailaddress"],
  ],
};

/**
 * Auto-detect the source system based on CSV headers.
 * Normalises headers to lowercase for comparison.
 */
export function detectSourceSystem(headers: string[]): SourceSystem | null {
  const normalised = headers.map((h) => h.toLowerCase().trim());

  for (const [system, patterns] of Object.entries(SOURCE_SYSTEM_HEADERS)) {
    for (const pattern of patterns) {
      const matchCount = pattern.filter((p) => normalised.includes(p)).length;
      if (matchCount >= 2) {
        return system as SourceSystem;
      }
    }
  }

  return null;
}

// ─── Mapping & Transformation ───────────────────────────────

/**
 * Apply a single transform to a raw string value.
 */
function applyTransform(
  value: string,
  transform: FieldMapping["transform"],
): string {
  if (!transform) return value;

  switch (transform) {
    case "date_au": {
      const parsed = parseDate(value);
      return parsed ?? value;
    }
    case "date_iso": {
      const parsed = parseDate(value);
      return parsed ?? value;
    }
    case "currency": {
      // Strip dollar signs, commas, and whitespace — leave the numeric value
      return value.replace(/[$,\s]/g, "");
    }
    case "uppercase":
      return value.toUpperCase();
    case "trim":
      return value.trim();
    default:
      return value;
  }
}

/**
 * Apply field mappings to transform raw CSV rows into structured MigrationRows.
 * Each mapping specifies which source column feeds which target field,
 * with an optional transform.
 */
export function applyFieldMapping(
  headers: string[],
  rows: string[][],
  mappings: FieldMapping[],
  template: MigrationTemplate,
): MigrationRow[] {
  return rows.map((row, index) => {
    const data: Record<string, string> = {};
    const errors: string[] = [];
    const warnings: string[] = [];

    for (const mapping of mappings) {
      if (mapping.sourceColumn < 0 || mapping.sourceColumn >= row.length) {
        errors.push(
          `Column index ${mapping.sourceColumn} out of range for field "${mapping.targetField}"`,
        );
        continue;
      }

      const rawValue = row[mapping.sourceColumn] ?? "";
      data[mapping.targetField] = applyTransform(rawValue, mapping.transform);
    }

    // Check required fields have values
    for (const field of template.requiredFields) {
      const val = data[field];
      if (val === undefined || val.trim() === "") {
        errors.push(`Required field "${field}" is missing or empty`);
      }
    }

    return {
      rowNumber: index + 2, // +2 because row 1 is headers, data starts at row 2
      data,
      errors,
      warnings,
    };
  });
}

/**
 * Build FieldMapping[] from a MigrationTemplate's defaultMappings.
 * Convenience for when the user accepts the default column layout.
 */
export function buildDefaultMappings(
  template: MigrationTemplate,
): FieldMapping[] {
  return Object.entries(template.defaultMappings).map(
    ([targetField, sourceColumn]) => ({
      sourceColumn,
      targetField,
    }),
  );
}

// ─── Validation ─────────────────────────────────────────────

const VALID_ACCOUNT_TYPES = [
  "ASSET",
  "LIABILITY",
  "EQUITY",
  "INCOME",
  "EXPENSE",
] as const;

const VALID_ACCOUNT_SUB_TYPES = [
  "BANK",
  "ACCOUNTS_RECEIVABLE",
  "OTHER_CURRENT_ASSET",
  "FIXED_ASSET",
  "ACCOUNTS_PAYABLE",
  "GST_COLLECTED",
  "GST_PAID",
  "OTHER_CURRENT_LIABILITY",
  "RETAINED_EARNINGS",
  "LEVY_INCOME",
  "INTEREST_INCOME",
  "OTHER_INCOME",
  "INSURANCE",
  "REPAIRS_MAINTENANCE",
  "ADMINISTRATION",
  "UTILITIES",
  "CLEANING",
  "OTHER_EXPENSE",
] as const;

/**
 * Validate lot migration rows.
 * Checks for duplicate lot numbers within the file and against existing DB lots.
 * Validates entitlement is numeric and positive.
 */
export async function validateLots(
  schemeId: string,
  rows: MigrationRow[],
): Promise<MigrationRow[]> {
  // Fetch existing lots for the scheme
  const existingLots = await db.orm.public.Lot
    .where((l) => l.schemeId.eq(schemeId))
    .all();

  const existingLotNumbers = new Set(
    existingLots.map((l) => String(l.lotNumber).trim()),
  );

  // Track lot numbers within the import for duplicate detection
  const seenLotNumbers = new Map<string, number>();

  return rows.map((row) => {
    const errors = [...row.errors];
    const warnings = [...row.warnings];

    const lotNumber = row.data.lotNumber?.trim();

    // Check for duplicates within the file
    if (lotNumber) {
      const previousRow = seenLotNumbers.get(lotNumber);
      if (previousRow !== undefined) {
        errors.push(
          `Duplicate lot number "${lotNumber}" — also on row ${previousRow}`,
        );
      } else {
        seenLotNumbers.set(lotNumber, row.rowNumber);
      }

      // Check against existing DB lots
      if (existingLotNumbers.has(lotNumber)) {
        errors.push(
          `Lot number "${lotNumber}" already exists in this scheme`,
        );
      }
    }

    // Validate entitlement is numeric and positive
    const entitlement = row.data.entitlement;
    if (entitlement !== undefined && entitlement.trim() !== "") {
      const num = Number(entitlement);
      if (isNaN(num)) {
        errors.push(
          `Entitlement "${entitlement}" is not a valid number`,
        );
      } else if (num <= 0) {
        errors.push(`Entitlement must be positive, got ${num}`);
      }
    }

    // Validate floor area if provided
    const floorArea = row.data.floorArea;
    if (floorArea !== undefined && floorArea.trim() !== "") {
      const num = Number(floorArea);
      if (isNaN(num)) {
        warnings.push(
          `Floor area "${floorArea}" is not a valid number — will be skipped`,
        );
      } else if (num < 0) {
        warnings.push(`Floor area is negative (${num})`);
      }
    }

    return { ...row, errors, warnings };
  });
}

/**
 * Validate chart of accounts migration rows.
 * Checks for duplicate account codes. Validates accountType and accountSubType.
 */
export async function validateChartOfAccounts(
  schemeId: string,
  rows: MigrationRow[],
): Promise<MigrationRow[]> {
  // Fetch existing account codes for the scheme
  const existingAccounts = await db.orm.public.AccountCode
    .where((a) => and(a.schemeId.eq(schemeId), a.isActive.eq(true)))
    .all();

  const existingCodes = new Set(
    existingAccounts.map((a) => String(a.code).trim()),
  );

  const seenCodes = new Map<string, number>();

  return rows.map((row) => {
    const errors = [...row.errors];
    const warnings = [...row.warnings];

    const code = row.data.code?.trim();

    // Check for duplicates within the file
    if (code) {
      const previousRow = seenCodes.get(code);
      if (previousRow !== undefined) {
        errors.push(
          `Duplicate account code "${code}" — also on row ${previousRow}`,
        );
      } else {
        seenCodes.set(code, row.rowNumber);
      }

      // Check against existing DB accounts
      if (existingCodes.has(code)) {
        errors.push(
          `Account code "${code}" already exists in this scheme`,
        );
      }
    }

    // Validate accountType
    const accountType = row.data.accountType?.trim().toUpperCase();
    if (accountType && !VALID_ACCOUNT_TYPES.includes(accountType as never)) {
      errors.push(
        `Invalid account type "${accountType}" — must be one of: ${VALID_ACCOUNT_TYPES.join(", ")}`,
      );
    }

    // Validate accountSubType if provided
    const accountSubType = row.data.accountSubType?.trim().toUpperCase();
    if (
      accountSubType &&
      !VALID_ACCOUNT_SUB_TYPES.includes(accountSubType as never)
    ) {
      warnings.push(
        `Unrecognised account sub-type "${accountSubType}" — will be stored as-is`,
      );
    }

    return { ...row, errors, warnings };
  });
}

/**
 * Validate opening balance migration rows.
 * Checks account codes exist, validates debits/credits are numeric,
 * and ensures total debits equal total credits.
 */
export async function validateOpeningBalances(
  schemeId: string,
  rows: MigrationRow[],
): Promise<MigrationRow[]> {
  // Fetch existing account codes for the scheme
  const existingAccounts = await db.orm.public.AccountCode
    .where((a) => and(a.schemeId.eq(schemeId), a.isActive.eq(true)))
    .all();

  const accountCodeSet = new Set(
    existingAccounts.map((a) => String(a.code).trim()),
  );

  let totalDebits = 0;
  let totalCredits = 0;

  const validated = rows.map((row) => {
    const errors = [...row.errors];
    const warnings = [...row.warnings];

    // Check account code exists
    const accountCode = row.data.accountCode?.trim();
    if (accountCode && !accountCodeSet.has(accountCode)) {
      errors.push(
        `Account code "${accountCode}" does not exist in this scheme`,
      );
    }

    // Validate debit
    const debitStr = row.data.debit?.trim();
    let debitVal = 0;
    if (debitStr && debitStr !== "") {
      const num = Number(debitStr);
      if (isNaN(num)) {
        errors.push(`Debit "${debitStr}" is not a valid number`);
      } else if (num < 0) {
        errors.push(`Debit must not be negative, got ${num}`);
      } else {
        debitVal = num;
      }
    }

    // Validate credit
    const creditStr = row.data.credit?.trim();
    let creditVal = 0;
    if (creditStr && creditStr !== "") {
      const num = Number(creditStr);
      if (isNaN(num)) {
        errors.push(`Credit "${creditStr}" is not a valid number`);
      } else if (num < 0) {
        errors.push(`Credit must not be negative, got ${num}`);
      } else {
        creditVal = num;
      }
    }

    // Row must have at least one non-zero amount
    if (debitVal === 0 && creditVal === 0 && errors.length === 0) {
      warnings.push("Both debit and credit are zero — row will have no effect");
    }

    totalDebits += debitVal;
    totalCredits += creditVal;

    return { ...row, errors, warnings };
  });

  // Check the overall balance: total debits must equal total credits
  const roundedDebits = Math.round(totalDebits * 100) / 100;
  const roundedCredits = Math.round(totalCredits * 100) / 100;

  if (roundedDebits !== roundedCredits) {
    // Add a warning to the first row (it applies to the whole batch)
    if (validated.length > 0) {
      validated[0].errors.push(
        `Opening balances are not balanced: total debits ($${roundedDebits.toFixed(2)}) ≠ total credits ($${roundedCredits.toFixed(2)})`,
      );
    }
  }

  return validated;
}

// ─── Import Execution ───────────────────────────────────────

/**
 * Import lot records into the scheme.
 * Creates a Lot record for each valid row inside a single transaction.
 */
export async function importLots(
  schemeId: string,
  rows: MigrationRow[],
  userId: string,
): Promise<{ created: number; errors: string[] }> {
  const validRows = rows.filter((r) => r.errors.length === 0);
  const importErrors: string[] = [];
  let created = 0;

  await db.transaction(async (tx) => {
    for (const row of validRows) {
      try {
        const entitlement = Number(row.data.entitlement);
        const floorArea = row.data.floorArea
          ? Number(row.data.floorArea)
          : null;

        await tx.orm.public.Lot.create({
          schemeId,
          lotNumber: row.data.lotNumber.trim(),
          unitNumber: row.data.unitNumber
            ? row.data.unitNumber.trim()
            : null,
          entitlement,
          floorArea,
          lotType: row.data.lotType
            ? row.data.lotType.trim().toUpperCase()
            : "RESIDENTIAL",
        });

        created++;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unknown error";
        importErrors.push(`Row ${row.rowNumber}: ${message}`);
      }
    }
  });

  // Log activity outside the data transaction
  await logActivity({
    schemeId,
    actorId: userId,
    action: "LOT_CREATED",
    entityType: "Lot",
    metadata: {
      source: "data_migration",
      count: created,
    },
  });

  return { created, errors: importErrors };
}

/**
 * Import chart of accounts records into the scheme.
 * Creates AccountCode records, looking up fund by name when provided.
 */
export async function importChartOfAccounts(
  schemeId: string,
  rows: MigrationRow[],
  userId: string,
): Promise<{ created: number; errors: string[] }> {
  const validRows = rows.filter((r) => r.errors.length === 0);
  const importErrors: string[] = [];
  let created = 0;

  // Pre-fetch funds for the scheme so we can map by name
  const funds = await db.orm.public.Fund
    .where((f) => and(f.schemeId.eq(schemeId), f.deletedAt.eq(null)))
    .all();

  const fundByName = new Map<string, string>();
  const fundByType = new Map<string, string>();
  for (const fund of funds) {
    fundByName.set(String(fund.name).toLowerCase().trim(), fund.id);
    if (fund.fundType) {
      fundByType.set(
        String(fund.fundType).toLowerCase().trim(),
        fund.id,
      );
    }
  }

  await db.transaction(async (tx) => {
    for (const row of validRows) {
      try {
        // Resolve fundId: try by fund name, then by fund type, then first fund
        let fundId: string | null = null;
        const fundName = row.data.fundType?.trim().toLowerCase();
        if (fundName) {
          fundId =
            fundByName.get(fundName) ??
            fundByType.get(fundName) ??
            null;
        }
        // Fall back to the first available fund if none matched
        if (!fundId && funds.length > 0) {
          fundId = funds[0].id;
        }

        await tx.orm.public.AccountCode.create({
          schemeId,
          code: toVarchar<10>(row.data.code.trim()),
          name: toVarchar<200>(row.data.name.trim()),
          accountType: row.data.accountType.trim().toUpperCase(),
          accountSubType: row.data.accountSubType?.trim().toUpperCase() ?? null,
          fundId: fundId,
          isSystemAccount: false,
          isActive: true,
          gstApplicable: false,
          description: null,
          parentAccountId: null,
        });

        created++;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unknown error";
        importErrors.push(`Row ${row.rowNumber}: ${message}`);
      }
    }
  });

  await logActivity({
    schemeId,
    actorId: userId,
    action: "SCHEME_UPDATED",
    entityType: "AccountCode",
    metadata: {
      source: "data_migration",
      action: "chart_of_accounts_imported",
      count: created,
    },
  });

  return { created, errors: importErrors };
}

/**
 * Import opening balances as a single journal entry.
 * Creates a JournalEntry with entryType "OPENING_BALANCE" and one
 * JournalLine per row. Uses the journal-entries module for entry numbering.
 */
export async function importOpeningBalances(
  schemeId: string,
  rows: MigrationRow[],
  cutoverDate: string,
  userId: string,
): Promise<{ journalEntryId: string; lineCount: number; errors: string[] }> {
  const validRows = rows.filter((r) => r.errors.length === 0);
  const importErrors: string[] = [];

  if (validRows.length === 0) {
    return {
      journalEntryId: "",
      lineCount: 0,
      errors: ["No valid rows to import"],
    };
  }

  // Pre-fetch account codes and funds for lookups
  const accountCodes = await db.orm.public.AccountCode
    .where((a) => and(a.schemeId.eq(schemeId), a.isActive.eq(true)))
    .include("fund")
    .all();

  const accountByCode = new Map<
    string,
    { id: string; fundId: string | null }
  >();
  for (const ac of accountCodes) {
    accountByCode.set(String(ac.code).trim(), {
      id: ac.id,
      fundId: ac.fundId ? String(ac.fundId) : null,
    });
  }

  // Resolve fund by name for rows that specify one
  const funds = await db.orm.public.Fund
    .where((f) => and(f.schemeId.eq(schemeId), f.deletedAt.eq(null)))
    .all();

  const fundByName = new Map<string, string>();
  for (const fund of funds) {
    fundByName.set(String(fund.name).toLowerCase().trim(), fund.id);
  }

  // Build journal lines
  const lines: Array<{
    accountCodeId: string;
    fundId: string;
    debit?: number;
    credit?: number;
    description?: string;
  }> = [];

  for (const row of validRows) {
    const code = row.data.accountCode?.trim();
    const account = code ? accountByCode.get(code) : undefined;

    if (!account) {
      importErrors.push(
        `Row ${row.rowNumber}: Account code "${code}" not found`,
      );
      continue;
    }

    // Determine fund: row-level fundName overrides the account's default fund
    let fundId = account.fundId ?? "";
    const rowFundName = row.data.fundName?.trim().toLowerCase();
    if (rowFundName) {
      const resolvedFund = fundByName.get(rowFundName);
      if (resolvedFund) {
        fundId = resolvedFund;
      }
    }

    if (!fundId) {
      importErrors.push(
        `Row ${row.rowNumber}: No fund resolved for account "${code}"`,
      );
      continue;
    }

    const debit = row.data.debit ? Number(row.data.debit) : 0;
    const credit = row.data.credit ? Number(row.data.credit) : 0;

    lines.push({
      accountCodeId: account.id,
      fundId,
      debit: debit > 0 ? debit : undefined,
      credit: credit > 0 ? credit : undefined,
      description: row.data.description?.trim() || undefined,
    });
  }

  if (lines.length === 0) {
    return {
      journalEntryId: "",
      lineCount: 0,
      errors: importErrors.length > 0
        ? importErrors
        : ["No journal lines could be created from the supplied rows"],
    };
  }

  // Get the next entry number and create the journal entry
  const entryNumber = await getNextEntryNumber(schemeId);

  const entry = await createJournalEntry({
    schemeId,
    entryNumber,
    transactionDate: cutoverDate,
    description: "Opening balances — data migration",
    entryType: "OPENING_BALANCE",
    sourceType: "DATA_MIGRATION",
    createdBy: userId,
    lines,
  });

  await logActivity({
    schemeId,
    actorId: userId,
    action: "SCHEME_UPDATED",
    entityType: "JournalEntry",
    entityId: entry.id,
    metadata: {
      source: "data_migration",
      action: "opening_balances_imported",
      lineCount: lines.length,
      cutoverDate,
    },
  });

  return {
    journalEntryId: entry.id,
    lineCount: lines.length,
    errors: importErrors,
  };
}

// ─── Orchestration Helpers ──────────────────────────────────

/**
 * Create a new MigrationResult in DRAFT status.
 * This is a pure-data structure — nothing is persisted to the DB yet.
 */
export function createMigrationDraft(
  schemeId: string,
  sourceSystem: SourceSystem,
  dataType: MigrationDataType,
  rows: MigrationRow[],
): MigrationResult {
  const validRows = rows.filter((r) => r.errors.length === 0);
  const errorRows = rows.filter((r) => r.errors.length > 0);

  return {
    id: crypto.randomUUID(),
    schemeId,
    sourceSystem,
    dataType,
    status: "DRAFT",
    totalRows: rows.length,
    validRows: validRows.length,
    errorRows: errorRows.length,
    rows,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Transition a migration result to VALIDATED status after running
 * the appropriate validation for its data type.
 */
export async function validateMigration(
  migration: MigrationResult,
): Promise<MigrationResult> {
  let validatedRows: MigrationRow[];

  switch (migration.dataType) {
    case "lots":
      validatedRows = await validateLots(migration.schemeId, migration.rows);
      break;
    case "chart_of_accounts":
      validatedRows = await validateChartOfAccounts(
        migration.schemeId,
        migration.rows,
      );
      break;
    case "opening_balances":
      validatedRows = await validateOpeningBalances(
        migration.schemeId,
        migration.rows,
      );
      break;
    default:
      validatedRows = migration.rows;
  }

  const validRows = validatedRows.filter((r) => r.errors.length === 0);
  const errorRows = validatedRows.filter((r) => r.errors.length > 0);
  const hasErrors = errorRows.length > 0;

  return {
    ...migration,
    status: hasErrors ? "DRAFT" : "VALIDATED",
    rows: validatedRows,
    validRows: validRows.length,
    errorRows: errorRows.length,
  };
}

/**
 * Execute a confirmed migration, importing data into the scheme.
 * Returns the updated MigrationResult with POSTED or FAILED status.
 */
export async function executeMigration(
  migration: MigrationResult,
  userId: string,
  cutoverDate?: string,
): Promise<MigrationResult> {
  if (
    migration.status !== "CONFIRMED" &&
    migration.status !== "VALIDATED"
  ) {
    return {
      ...migration,
      status: "FAILED",
    };
  }

  try {
    switch (migration.dataType) {
      case "lots": {
        const result = await importLots(
          migration.schemeId,
          migration.rows,
          userId,
        );
        return {
          ...migration,
          status: result.errors.length > 0 ? "FAILED" : "POSTED",
          postedAt: new Date().toISOString(),
        };
      }

      case "chart_of_accounts": {
        const result = await importChartOfAccounts(
          migration.schemeId,
          migration.rows,
          userId,
        );
        return {
          ...migration,
          status: result.errors.length > 0 ? "FAILED" : "POSTED",
          postedAt: new Date().toISOString(),
        };
      }

      case "opening_balances": {
        if (!cutoverDate) {
          return {
            ...migration,
            status: "FAILED",
          };
        }
        const result = await importOpeningBalances(
          migration.schemeId,
          migration.rows,
          cutoverDate,
          userId,
        );
        return {
          ...migration,
          status: result.errors.length > 0 ? "FAILED" : "POSTED",
          postedAt: new Date().toISOString(),
        };
      }

      default:
        return { ...migration, status: "FAILED" };
    }
  } catch {
    return {
      ...migration,
      status: "FAILED",
    };
  }
}

/**
 * Get the template key for a source system and data type combination.
 */
export function getTemplateKey(
  sourceSystem: SourceSystem,
  dataType: MigrationDataType,
): string {
  return `${sourceSystem}_${dataType}`;
}

/**
 * Look up a migration template. Returns undefined if no template exists
 * for the given source system / data type combination.
 */
export function getTemplate(
  sourceSystem: SourceSystem,
  dataType: MigrationDataType,
): MigrationTemplate | undefined {
  return MIGRATION_TEMPLATES[getTemplateKey(sourceSystem, dataType)];
}
