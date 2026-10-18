"use server";

import { revalidatePath } from "next/cache";
import {
  requireSchemeMembership,
  AuthorisationError,
} from "@/lib/auth/require-membership";
import {
  importLots,
  importChartOfAccounts,
  importOpeningBalances,
  validateLots,
  validateChartOfAccounts,
  validateOpeningBalances,
} from "@/lib/queries/data-migration";

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
  cutoverDate?: string,
): Promise<ActionState> {
  try {
    const { membership } = await requireSchemeMembership(schemeId, [
      "ADVISER",
    ]);

    const validRows = rows.filter((r) => r.errors.length === 0);

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
      case "opening_balances": {
        if (!cutoverDate) {
          return { error: "Cutover date is required for opening balances." };
        }
        const result = await importOpeningBalances(
          schemeId,
          validRows,
          cutoverDate,
          membership.profileId,
        );
        created = result.lineCount;
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
    console.error("Migration import error:", err);
    return {
      error:
        err instanceof Error
          ? err.message
          : "An unexpected error occurred during import.",
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
    console.error("Migration validation error:", err);
    return {
      error:
        err instanceof Error
          ? err.message
          : "An unexpected error occurred during validation.",
    };
  }
}
