/**
 * Last year's income and expenditure entered at onboarding (24 Oct), as
 * comparatives. They are never posted, so they are added to the comparative
 * column of the income and expenditure report and the statutory statements
 * only, for a period that covers the whole financial year they belong to.
 * The ledger holds nothing before the takeover, so nothing is counted twice.
 */
import { db } from "@/prisma/db";
import { yearRange } from "@/lib/onboarding/income-budget";
import { logError } from "@/lib/log";

export interface PriorYearActualLine {
  fundId: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: "INCOME" | "EXPENSE";
  amountCents: number;
}

/** Pure: the financial years (by start year) wholly inside a period. */
export function yearsWithin(years: number[], start: string, end: string, yearEndMmdd: string): number[] {
  return years.filter((fy) => {
    const r = yearRange(fy, yearEndMmdd);
    return r.start >= start && r.end <= end;
  });
}

export async function priorYearActualLines(schemeId: string, start: string, end: string): Promise<PriorYearActualLine[]> {
  try {
    const scheme = await db.orm.public.Scheme.where((s) => s.id.eq(schemeId)).first();
    if (!scheme) return [];
    const rows = await db.orm.public.PriorYearActual.where((p) => p.schemeId.eq(schemeId)).limit(5000).all();
    if (!rows.length) return [];
    const inPeriod = new Set(yearsWithin([...new Set(rows.map((r) => r.financialYear))], start, end, String(scheme.financialYearEnd ?? "06-30")));
    const wanted = rows.filter((r) => inPeriod.has(r.financialYear));
    if (!wanted.length) return [];
    const accounts = await db.orm.public.AccountCode.where((a) => a.id.in([...new Set(wanted.map((r) => r.accountCodeId))])).limit(5000).all();
    return wanted.flatMap((r) => {
      const a = accounts.find((x) => x.id === r.accountCodeId);
      if (!a || (a.accountType !== "INCOME" && a.accountType !== "EXPENSE")) return [];
      return [{ fundId: r.fundId, accountId: a.id, accountCode: String(a.code), accountName: String(a.name), accountType: a.accountType, amountCents: Math.round(Number(r.amount) * 100) }];
    });
  } catch (err) {
    // Comparatives are left out rather than failing the report, but not silently.
    logError("priorYearActualLines: last year's actuals could not be read:", err);
    return [];
  }
}
