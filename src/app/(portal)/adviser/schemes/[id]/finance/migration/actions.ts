"use server";
import { logError } from "@/lib/log";

import { revalidatePath } from "next/cache";
import { requireRecentMfa } from "@/lib/auth/mfa-enforcement";
import {
  requireSchemeMembership,
  AuthorisationError,
} from "@/lib/auth/require-membership";
import {
  checkImportRows,
  importLots,
  importChartOfAccounts,
  MigrationImportError,
} from "@/lib/queries/data-migration";
import { isImportDataType } from "@/lib/finance/migration-import-fields";
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
import { UnsupportedJurisdictionError } from "@/config/statutory";

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

    if (dataType !== "lots" && dataType !== "chart_of_accounts") return { error: `Unknown data type: ${dataType}` };
    // Check again here, the same way as the preview: the rows come from the
    // browser, so their own error lists are not trusted. This also translates
    // the browser's column keys to the field names the import reads.
    const checked = await checkImportRows(schemeId, dataType, rows);
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
    // The lot checks read the building's rule pack (stage 2, step 10): a building with none fails closed, in plain words.
    if (err instanceof UnsupportedJurisdictionError) return { error: err.message };
    if (err instanceof MigrationImportError) {
      // Nothing was saved: the transaction rolled back. The database message stays in the log.
      logError(`Migration import error on row ${err.rowNumber}:`, err.cause);
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

    if (!isImportDataType(dataType)) return { error: `Unknown data type: ${dataType}` };

    // The same check the import runs. The rows go back with the browser's own
    // column keys, so the preview table and the import read them unchanged.
    const checked = await checkImportRows(schemeId, dataType, rows);
    const validatedRows = checked.map((r, i) => ({ ...r, data: rows[i].data }));

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
    if (err instanceof UnsupportedJurisdictionError) return { error: err.message };
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
