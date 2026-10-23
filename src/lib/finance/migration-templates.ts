/**
 * Column mapping templates for imports from other strata systems (pure).
 * The templates are data, in src/config/migration-templates, and are marked
 * UNCONFIRMED until checked against real sample exports. A template only
 * suggests which column feeds which field: the adviser confirms or changes
 * every mapping before a file is staged.
 */
import stratamax from "@/config/migration-templates/stratamax.json";
import strataMaster from "@/config/migration-templates/strata-master.json";
import type { CutoverDataType } from "./migration-cutover";

export type TemplateDataType = "lots" | "chart_of_accounts" | CutoverDataType;

export interface MigrationColumnTemplate {
  sourceSystem: string;
  displayName: string;
  status: "UNCONFIRMED" | "CONFIRMED";
  note: string;
  references: Array<{ title: string; url: string }>;
  dataTypes: Record<TemplateDataType, Record<string, string[]>>;
}

export const COLUMN_TEMPLATES: Record<string, MigrationColumnTemplate> = {
  stratamax: stratamax as MigrationColumnTemplate,
  strata_master: strataMaster as MigrationColumnTemplate,
};

/** The fields each file can carry, and which are required. */
export const FIELDS: Record<TemplateDataType, Array<{ field: string; label: string; required?: boolean }>> = {
  lots: [
    { field: "lotNumber", label: "Lot number", required: true },
    { field: "unitNumber", label: "Unit number" },
    { field: "entitlement", label: "Unit entitlement", required: true },
    { field: "floorArea", label: "Floor area" },
    { field: "lotType", label: "Lot type" },
  ],
  chart_of_accounts: [
    { field: "code", label: "Account code", required: true },
    { field: "name", label: "Account name", required: true },
    { field: "accountType", label: "Account type", required: true },
    { field: "accountSubType", label: "Sub-type" },
    { field: "fundType", label: "Fund" },
  ],
  opening_balances: [
    { field: "accountCode", label: "Account code", required: true },
    { field: "debit", label: "Debit" },
    { field: "credit", label: "Credit" },
    { field: "balance", label: "Balance (signed, if no debit and credit columns)" },
    { field: "fundName", label: "Fund" },
    { field: "description", label: "Description" },
  ],
  levy_arrears: [
    { field: "lotNumber", label: "Lot number", required: true },
    { field: "fundName", label: "Fund" },
    { field: "noticeNumber", label: "Notice number" },
    { field: "dueDate", label: "Original due date", required: true },
    { field: "periodStart", label: "Period from" },
    { field: "periodEnd", label: "Period to" },
    { field: "levyOutstanding", label: "Levy outstanding", required: true },
    { field: "interestCharged", label: "Interest charged to date" },
    { field: "interestPaid", label: "Interest paid" },
    { field: "description", label: "Description" },
  ],
  unpaid_invoices: [
    { field: "supplierName", label: "Supplier" },
    { field: "supplierAbn", label: "Supplier ABN" },
    { field: "invoiceNumber", label: "Invoice number", required: true },
    { field: "invoiceDate", label: "Invoice date", required: true },
    { field: "dueDate", label: "Due date" },
    { field: "totalAmount", label: "Total (incl. GST)", required: true },
    { field: "gstAmount", label: "GST" },
    { field: "amountPaid", label: "Amount already paid" },
    { field: "accountCode", label: "Expense account code", required: true },
    { field: "fundName", label: "Fund" },
    { field: "description", label: "Description" },
  ],
  owner_credits: [
    { field: "lotNumber", label: "Lot number", required: true },
    { field: "fundName", label: "Fund" },
    { field: "creditAmount", label: "Credit (paid in advance)", required: true },
    { field: "note", label: "Note" },
  ],
  bank_balances: [
    { field: "accountName", label: "Account name" },
    { field: "bsb", label: "BSB" },
    { field: "accountNumber", label: "Account number" },
    { field: "reconciledDate", label: "Last reconciled date", required: true },
    { field: "reconciledBalance", label: "Reconciled statement balance", required: true },
  ],
};

const key = (h: string) => h.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");

/**
 * Suggested column for each field: the first header that matches one of the
 * template's names for it, ignoring case, spaces and punctuation. Each column
 * feeds at most one field. With no template, a header named like the field
 * itself is used.
 */
export function suggestMapping(headers: string[], dataType: TemplateDataType, sourceSystem: string | null): Record<string, number> {
  const template = sourceSystem ? COLUMN_TEMPLATES[sourceSystem] : undefined;
  const names = template?.dataTypes[dataType] ?? {};
  const used = new Set<number>();
  const out: Record<string, number> = {};
  const keys = headers.map(key);
  for (const { field, label } of FIELDS[dataType]) {
    const candidates = [...(names[field] ?? []), field, label].map(key);
    const index = candidates.map((c) => keys.findIndex((k, i) => k === c && !used.has(i))).find((i) => i >= 0);
    if (index !== undefined && index >= 0) {
      out[field] = index;
      used.add(index);
    }
  }
  return out;
}

/** Required fields with no column. Opening balances need debit and credit, or a balance. */
export function missingFields(mapping: Record<string, number>, dataType: TemplateDataType): string[] {
  const missing = FIELDS[dataType].filter((f) => f.required && mapping[f.field] === undefined).map((f) => f.label);
  if (dataType === "opening_balances" && mapping.balance === undefined && (mapping.debit === undefined || mapping.credit === undefined)) {
    missing.push("Debit and credit, or a balance");
  }
  if (dataType === "unpaid_invoices" && mapping.supplierName === undefined && mapping.supplierAbn === undefined) missing.push("Supplier or supplier ABN");
  if (dataType === "bank_balances" && mapping.accountName === undefined && (mapping.bsb === undefined || mapping.accountNumber === undefined)) {
    missing.push("Account name, or BSB and account number");
  }
  return missing;
}

/** Rows as field records, using a mapping of field to column index. Unknown fields are dropped. */
export function toRecords(rows: string[][], mapping: Record<string, number>, dataType: TemplateDataType): Record<string, string>[] {
  const fields = new Set(FIELDS[dataType].map((f) => f.field));
  return rows.map((row) => {
    const out: Record<string, string> = {};
    for (const [field, index] of Object.entries(mapping)) {
      if (!fields.has(field) || !Number.isInteger(index) || index < 0) continue;
      out[field] = (row[index] ?? "").trim();
    }
    return out;
  });
}
