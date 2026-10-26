"use server";
import { logError } from "@/lib/log";

import { revalidatePath } from "next/cache";
import { requireRecentMfa } from "@/lib/auth/mfa-enforcement";
import {
  requireSchemeMembership,
  AuthorisationError,
} from "@/lib/auth/require-membership";
import {
  importLots,
  importChartOfAccounts,
  validateLots,
  validateChartOfAccounts,
  validateOpeningBalances,
} from "@/lib/queries/data-migration";
import {
  createCutover,
  CutoverError,
  executeCutover,
  removeCutoverFile,
  setCutoverDate,
  signOffCutover,
  stageCutoverFile,
} from "@/lib/finance/migration-batches";
import { CUTOVER_DATA_TYPES, type CutoverDataType } from "@/lib/finance/migration-cutover";
import { FundIntegrityError } from "@/lib/finance/fund-integrity";

type ActionState = {
  error?: string;
  success?: boolean;
  data?: Record<string, unknown>;
};

export async function processMigrationAction(
  schemeId: string,
  sourceSystem: string,
  dataType: string,
  rows: Array<{
    rowNumber: number;
    data: Record<string, string>;
    errors: string[];
    warnings: string[];
  }>,
  _cutoverDate?: string,
): Promise<ActionState> {
  try {
    const { membership } = await requireSchemeMembership(schemeId, [
      "ADVISER",
    ]);

    if (dataType === "opening_balances") {
      return {
        error:
          "Opening balances now go through the cutover, which checks that the trial balance nets to zero and needs a sign-off before anything is posted. Use Cutover.",
      };
    }

    // Validate again here: the rows come from the browser, so their own error lists are not trusted.
    const required: Record<string, string[]> = { lots: ["lotNumber", "entitlement"], chart_of_accounts: ["code", "name", "accountType"] };
    if (!required[dataType]) return { error: `Unknown data type: ${dataType}` };
    const fresh = rows.map((r) => ({
      rowNumber: r.rowNumber,
      data: r.data,
      warnings: [] as string[],
      errors: required[dataType].filter((f) => !String(r.data[f] ?? "").trim()).map((f) => `Required field "${f}" is missing or empty`),
    }));
    const checked = dataType === "lots" ? await validateLots(schemeId, fresh) : await validateChartOfAccounts(schemeId, fresh);
    const validRows = checked.filter((r) => r.errors.length === 0);

    if (validRows.length === 0) {
      return { error: "No valid rows to import." };
    }

    let created = 0;

    switch (dataType) {
      case "lots": {
        const result = await importLots(
          schemeId,
          validRows,
          membership.profileId,
        );
        created = result.created;
        break;
      }
      case "chart_of_accounts": {
        const result = await importChartOfAccounts(
          schemeId,
          validRows,
          membership.profileId,
        );
        created = result.created;
        break;
      }
      default:
        return { error: `Unknown data type: ${dataType}` };
    }

    revalidatePath(`/adviser/schemes/${schemeId}/finance`);

    return {
      success: true,
      data: { created, total: rows.length, skipped: rows.length - validRows.length },
    };
  } catch (err) {
    if (err instanceof AuthorisationError) {
      return { error: err.message };
    }
    logError("Migration import error:", err);
    return {
      // Database and library messages stay in the server log (S7, SEC-025).
      error: "An unexpected error occurred during import.",
    };
  }
}

export async function validateMigrationAction(
  schemeId: string,
  dataType: string,
  rows: Array<{
    rowNumber: number;
    data: Record<string, string>;
    errors: string[];
    warnings: string[];
  }>,
): Promise<ActionState> {
  try {
    await requireSchemeMembership(schemeId, ["ADVISER"]);

    let validatedRows;

    switch (dataType) {
      case "lots":
        validatedRows = await validateLots(schemeId, rows);
        break;
      case "chart_of_accounts":
        validatedRows = await validateChartOfAccounts(schemeId, rows);
        break;
      case "opening_balances":
        validatedRows = await validateOpeningBalances(schemeId, rows);
        break;
      default:
        return { error: `Unknown data type: ${dataType}` };
    }

    const errorCount = validatedRows.filter(
      (r: { errors: string[] }) => r.errors.length > 0,
    ).length;
    const warningCount = validatedRows.filter(
      (r: { warnings: string[] }) => r.warnings.length > 0,
    ).length;

    return {
      success: true,
      data: {
        rows: validatedRows,
        totalRows: validatedRows.length,
        errorCount,
        warningCount,
        validCount: validatedRows.length - errorCount,
      },
    };
  } catch (err) {
    if (err instanceof AuthorisationError) {
      return { error: err.message };
    }
    logError("Migration validation error:", err);
    return {
      // Database and library messages stay in the server log (S7, SEC-025).
      error: "An unexpected error occurred during validation.",
    };
  }
}

// ─── Financial cutover (Stage 7) ──────────────────────────────────────────

function cutoverError(err: unknown): ActionState {
  if (err instanceof AuthorisationError || err instanceof CutoverError || err instanceof FundIntegrityError) return { error: err.message };
  logError("Cutover error:", err);
  // Database and library messages stay in the server log (S7, SEC-025).
  return { error: "Something went wrong with the cutover." };
}

const cutoverPath = (schemeId: string) => `/adviser/schemes/${schemeId}/finance/migration/cutover`;

export async function createCutoverAction(schemeId: string, sourceSystem: string, cutoverDate: string): Promise<ActionState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);
    const id = await createCutover({ schemeId, sourceSystem, cutoverDate: cutoverDate || null, actorId: profile.id });
    revalidatePath(cutoverPath(schemeId));
    return { success: true, data: { id } };
  } catch (err) {
    return cutoverError(err);
  }
}

export async function setCutoverDateAction(schemeId: string, batchId: string, cutoverDate: string): Promise<ActionState> {
  try {
    await requireSchemeMembership(schemeId, ["ADVISER"]);
    await setCutoverDate(schemeId, batchId, cutoverDate);
    revalidatePath(cutoverPath(schemeId));
    return { success: true };
  } catch (err) {
    return cutoverError(err);
  }
}

export async function stageCutoverFileAction(
  schemeId: string,
  batchId: string,
  dataType: string,
  fileName: string,
  content: string,
  mapping?: Record<string, number>,
): Promise<ActionState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);
    if (!CUTOVER_DATA_TYPES.includes(dataType as CutoverDataType)) return { error: "Unknown file type." };
    const result = await stageCutoverFile({ schemeId, batchId, dataType: dataType as CutoverDataType, fileName, content, mapping, actorId: profile.id });
    revalidatePath(cutoverPath(schemeId));
    return { success: true, data: { ...result } };
  } catch (err) {
    return cutoverError(err);
  }
}

export async function removeCutoverFileAction(schemeId: string, batchId: string, dataType: string): Promise<ActionState> {
  try {
    await requireSchemeMembership(schemeId, ["ADVISER"]);
    if (!CUTOVER_DATA_TYPES.includes(dataType as CutoverDataType)) return { error: "Unknown file type." };
    await removeCutoverFile(schemeId, batchId, dataType as CutoverDataType);
    revalidatePath(cutoverPath(schemeId));
    return { success: true };
  } catch (err) {
    return cutoverError(err);
  }
}

export async function signOffCutoverAction(schemeId: string, batchId: string, acknowledged: string[], note: string): Promise<ActionState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);
    // A sensitive operation: needs an authenticator check in the last 15 minutes.
    await requireRecentMfa();
    await signOffCutover({ schemeId, batchId, actorId: profile.id, acknowledged, note });
    revalidatePath(cutoverPath(schemeId));
    return { success: true };
  } catch (err) {
    return cutoverError(err);
  }
}

export async function executeCutoverAction(schemeId: string, batchId: string): Promise<ActionState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);
    // A sensitive operation: needs an authenticator check in the last 15 minutes.
    await requireRecentMfa();
    const results = await executeCutover({ schemeId, batchId, actorId: profile.id });
    revalidatePath(`/adviser/schemes/${schemeId}/finance`);
    revalidatePath(cutoverPath(schemeId));
    return { success: true, data: { ...results } };
  } catch (err) {
    return cutoverError(err);
  }
}
