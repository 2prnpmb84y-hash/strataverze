"use server";

import { revalidatePath } from "next/cache";
import { requireSchemeMembership, AuthorisationError } from "@/lib/auth/require-membership";
import { saveIncomeBudget, IncomeBudgetError } from "@/lib/onboarding/save-income-budget";
import type { IncomeBudgetCheck, IncomeBudgetInput } from "@/lib/onboarding/income-budget";
import { readIncomeStatementPDF, type IncomeStatement } from "@/lib/onboarding/read-income-statement";
import { TooManyPagesError } from "@/lib/pdf/layout-text";

export interface SaveIncomeBudgetState {
  saved?: boolean;
  error?: string;
  check?: Omit<IncomeBudgetCheck, "parsed">;
}

function parseInput(raw: unknown): IncomeBudgetInput | null {
  if (typeof raw !== "string" || raw.length > 500_000) return null;
  try {
    const v = JSON.parse(raw) as IncomeBudgetInput;
    const str = (x: unknown) => typeof x === "string";
    if (!v || !Array.isArray(v.funds) || !v.adoption || !v.levies) return null;
    for (const f of v.funds) {
      if (!str(f.fundId) || !str(f.openingBalance) || !Array.isArray(f.rows) || f.rows.length > 500) return null;
      for (const r of f.rows) if (![r.accountId, r.newAccountName, r.accountType, r.actual, r.budget].every(str)) return null;
    }
    if (!str(v.adoption.kind) || !str(v.adoption.meetingDate) || !str(v.levies.frequency)  || !str(v.levies.raisedBeforeTakeover)) return null;
    if (v.levies.raisedInstalments !== undefined && (!Array.isArray(v.levies.raisedInstalments) || v.levies.raisedInstalments.length > 12 || !v.levies.raisedInstalments.every((n) => Number.isInteger(n)))) return null;
    return v;
  } catch {
    return null;
  }
}

/** Save last year's income and expenditure, this year's budget and the levies. */
export async function saveIncomeBudgetAction(schemeId: string, _prev: SaveIncomeBudgetState, formData: FormData): Promise<SaveIncomeBudgetState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);
    const input = parseInput(formData.get("input"));
    if (!input) return { error: "The form could not be read. Reload the page and try again." };
    const result = await saveIncomeBudget(schemeId, profile.id, input);
    const { parsed: _parsed, ...check } = result.check;
    void _parsed;
    if (result.saved) {
      revalidatePath(`/adviser/schemes/${schemeId}/finance`, "layout");
    }
    return { saved: result.saved, check };
  } catch (err) {
    if (err instanceof AuthorisationError || err instanceof IncomeBudgetError) return { error: err.message };
    throw err;
  }
}

export type ReadStatementResult = { ok: true; statement: IncomeStatement } | { ok: false; error: string };

/** Read the income and expenditure statements from the previous manager's annual financial statement PDF. */
export async function readIncomeStatementAction(schemeId: string, formData: FormData): Promise<ReadStatementResult> {
  try {
    await requireSchemeMembership(schemeId, ["ADVISER"]);
  } catch (err) {
    if (err instanceof AuthorisationError) return { ok: false, error: err.message };
    throw err;
  }
  const file = formData.get("statement") as File | null;
  if (!file || file.size === 0) return { ok: false, error: "Choose the annual financial statement PDF." };
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (file.type !== "application/pdf" && ext !== "pdf") return { ok: false, error: "Only a PDF can be read." };
  if (file.size > 30 * 1024 * 1024) return { ok: false, error: "The file must be smaller than 30 MB." };
  try {
    const statement = await readIncomeStatementPDF(new Uint8Array(await file.arrayBuffer()));
    return { ok: true, statement };
  } catch (err) {
    if (err instanceof TooManyPagesError) return { ok: false, error: err.message };
    return { ok: false, error: "The PDF could not be read. Enter the figures by hand." };
  }
}
