/**
 * Property onboarding checks (pure). Used by the Add Property wizard to show
 * problems as they are typed, and again by the server before anything is
 * saved, so the two always agree.
 *
 * What onboarding captures (24 Oct):
 *  - The financial year end as a full date: the end of the building's current
 *    financial year. The day and month are stored ("06-30") and roll forward.
 *  - Every lot, with its unit number, unit entitlement and the owner's name
 *    exactly as it appears on the strata roll. The number of lots must equal
 *    the building's total lots, and the unit entitlements must add up to its
 *    total unit entitlement.
 *  - The building's opening balances at the takeover date: the total, the
 *    administrative fund and the capital works fund, each backed by a short
 *    balance sheet that must come to the fund balance.
 *  - Each lot's opening balance: administrative fund, capital works fund,
 *    interest owing in each fund, and unallocated (a credit held for the
 *    lot). Interest is entered per fund from the handover, as the previous
 *    system charged it, so the lots tie exactly to each fund's levies
 *    receivable (24 Oct). Unallocated credits are held in the admin fund and
 *    must add up to levies paid in advance.
 *
 * The balances then become a draft cutover (see buildCutoverFiles), which the
 * Adviser signs off and posts in Finance with the existing cutover checks.
 *
 * The words in the problems (the entitlement, the funds, the levy and the late
 * charge) are the building's, from its rule pack (OnboardingCheckWords, made
 * by onboardingWordsFor in ./onboarding-words). Where none are passed the
 * checks use the words they have always shown (QLD go-live, 27 Oct 2026).
 * A pack with a second lot entitlement (Queensland's interest schedule,
 * Victoria's lot entitlement) has each lot's entitlement in it checked too: a
 * whole number, not 0. Each row holds it under the lot field the pack's
 * schedule is held in (OnboardingCheckWords.separate.field). The building
 * records no total for it, so the lots are not added up against one.
 */

import type { SeparateEntitlementField } from "@/lib/jurisdiction/building-data";

export const MAX_LOTS = 2000;

/** The building's words the checks use, from its rule pack (see ./onboarding-words). */
export interface OnboardingCheckWords {
  /** The entitlement held on each lot, as the pack names it: "unit entitlement". */
  entitlement: string;
  /**
   * A second entitlement each lot holds, as the pack names it, with the lot
   * field it is held and sent in, or null where the pack has none. A null
   * field is a schedule StrataVerze does not hold yet: checkLots refuses the
   * building rather than leave it out.
   */
  separate: { name: string; field: SeparateEntitlementField | null } | null;
  /** "levies" */
  levies: string;
  /** "interest" */
  lateCharge: string;
  /** The two funds, as the pack names them: "administrative fund", "capital works fund". */
  funds: { admin: string; capitalWorks: string };
}

/** The words the checks have always shown, used where a caller passes none. */
export const DEFAULT_CHECK_WORDS: OnboardingCheckWords = {
  entitlement: "unit entitlement",
  separate: null,
  levies: "levies",
  lateCharge: "interest",
  funds: { admin: "administrative fund", capitalWorks: "capital works fund" },
};

const firstUpper = (text: string) => (text ? text[0].toUpperCase() + text.slice(1) : text);
export const MAX_ENTITLEMENT = 1_000_000;
export const MAX_OWNER_NAME = 500;
export const MAX_LOT_NUMBER = 20;

// ─── Dates ──────────────────────────────────────────────────────────────────

/** A strict YYYY-MM-DD date, or null. */
export function parseIsoDate(value: string | null | undefined): { y: number; m: number; d: number } | null {
  const match = (value ?? "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return { y, m, d };
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(isoValue: string, days: number): string {
  const p = parseIsoDate(isoValue)!;
  return iso(new Date(Date.UTC(p.y, p.m - 1, p.d + days)));
}

/** DD/MM/YYYY for messages. */
export function auDate(isoValue: string): string {
  const p = parseIsoDate(isoValue);
  if (!p) return isoValue;
  return `${String(p.d).padStart(2, "0")}/${String(p.m).padStart(2, "0")}/${p.y}`;
}


/** The first day of the financial year that ends on `yearEnd`. */
export function yearStartFor(yearEnd: string): string {
  const p = parseIsoDate(yearEnd)!;
  return iso(new Date(Date.UTC(p.y - 1, p.m - 1, p.d + 1)));
}

/**
 * The end of the financial year that `today` falls in, for a year end stored
 * as "MM-DD". A legacy "02-29" is read as 28 February in every year, so the
 * edit form never offers a date that checkYearEnd refuses.
 */
export function currentYearEnd(mmdd: string | null | undefined, today: string): string {
  const match = (mmdd ?? "").match(/^(\d{2})-(\d{2})$/);
  const t = parseIsoDate(today)!;
  const m = match ? Number(match[1]) : 6;
  const d = match ? (Number(match[1]) === 2 && Number(match[2]) === 29 ? 28 : Number(match[2])) : 30;
  const make = (y: number) => {
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return iso(new Date(Date.UTC(y, m - 1, Math.min(d, last))));
  };
  const thisYear = make(t.y);
  return thisYear >= today ? thisYear : make(t.y + 1);
}

export type YearEndCheck = { ok: true; date: string; mmdd: string } | { ok: false; message: string };

/** The financial year end: a full date, the end of the building's current financial year. */
export function checkYearEnd(value: string | null | undefined, today: string): YearEndCheck {
  const p = parseIsoDate(value);
  if (!p) return { ok: false, message: "Enter the financial year end as a full date (day, month and year)." };
  if (p.m === 2 && p.d === 29) return { ok: false, message: "A financial year cannot end on 29 February, as that date does not occur every year." };
  const date = (value ?? "").trim();
  if (date < today) return { ok: false, message: `${auDate(date)} has passed. Enter the end of the building's current financial year.` };
  if (yearStartFor(date) > today) return { ok: false, message: `${auDate(date)} is more than a year away. Enter the end of the building's current financial year.` };
  return { ok: true, date, mmdd: `${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}` };
}

// ─── Money ──────────────────────────────────────────────────────────────────

/**
 * Dollars typed in a form to cents. Accepts "1234", "1,234.56", "$1,234.5"
 * and, where allowed, a leading minus. Blank is zero. Null when it is not an
 * amount (more than 2 decimal places, letters, misplaced commas).
 */
export function parseMoney(value: string | null | undefined, opts: { allowNegative?: boolean } = {}): number | null {
  let v = (value ?? "").trim().replace(/\s+/g, "");
  if (v === "") return 0;
  let negative = false;
  if (v.startsWith("-")) {
    negative = true;
    v = v.slice(1);
  }
  if (v.startsWith("$")) v = v.slice(1);
  if (!/^(\d{1,3}(,\d{3})+|\d+)(\.\d{1,2})?$/.test(v)) return null;
  const [whole, fraction = ""] = v.replace(/,/g, "").split(".");
  // Ledger amounts are numeric(12,2): at most 10 whole digits.
  if (whole.replace(/^0+(?=\d)/, "").length > 10) return null;
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (negative && cents !== 0 && !opts.allowNegative) return null;
  return negative ? -cents : cents;
}

/** Cents as "$1,234.56" (or "-$12.00"). */
export function formatMoney(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100).toLocaleString("en-AU");
  return `${sign}$${dollars}.${String(abs % 100).padStart(2, "0")}`;
}

/** Cents as "1234.56" for a cutover file. */
function plainMoney(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

// ─── Lots ───────────────────────────────────────────────────────────────────

export interface OnboardingLot {
  lotNumber: string;
  unitNumber: string;
  entitlement: string;
  ownerName: string;
  /** The second entitlement, where the building's pack has one (Queensland's interest schedule). */
  interestScheduleEntitlement?: string;
  /** The second entitlement, where the building's pack has one (Victoria's lot entitlement). */
  lotEntitlement?: string;
  /** Where the row was read from ("Roll page 1; owner on page 2"). Shown only; not saved. */
  source?: string;
}

export interface CleanLot {
  lotNumber: string;
  unitNumber: string | null;
  entitlement: number;
  /** As it appears on the strata roll: only leading and trailing spaces are removed. */
  ownerName: string | null;
  /** Present only where the building's pack has a second entitlement, under the field it is held in. */
  interestScheduleEntitlement?: number;
  lotEntitlement?: number;
}

export interface LotsCheck {
  ok: boolean;
  lots: CleanLot[];
  /** Problems with one row, by row index. */
  rowErrors: Record<number, string[]>;
  /** Problems with the lots as a whole. */
  errors: string[];
  count: number;
  entitlementSum: number;
  /** The second entitlements entered, added up (0 where the pack has none). */
  separateSum: number;
}

/** A blank row for each lot, numbered 1 to n. */
export function blankLots(n: number): OnboardingLot[] {
  const count = Number.isInteger(n) && n > 0 ? Math.min(n, MAX_LOTS) : 0;
  return Array.from({ length: count }, (_, i) => ({ lotNumber: String(i + 1), unitNumber: "", entitlement: "", ownerName: "" }));
}

const controlChars = /[\u0000-\u001F\u007F]/;

export function checkLots(
  rows: readonly OnboardingLot[],
  totalLots: number,
  totalEntitlement: number,
  words: OnboardingCheckWords = DEFAULT_CHECK_WORDS,
): LotsCheck {
  const ent = words.entitlement;
  const separate = words.separate;
  const rowErrors: Record<number, string[]> = {};
  const errors: string[] = [];
  const lots: CleanLot[] = [];
  const seen = new Map<string, number>();
  let entitlementSum = 0;
  let separateSum = 0;

  if (rows.length > MAX_LOTS) errors.push(`A building can have at most ${MAX_LOTS.toLocaleString("en-AU")} lots.`);

  rows.slice(0, MAX_LOTS).forEach((row, i) => {
    const problems: string[] = [];
    const lotNumber = String(row.lotNumber ?? "").trim();
    const unitNumber = String(row.unitNumber ?? "").trim();
    const ownerName = String(row.ownerName ?? "").trim();
    const entText = String(row.entitlement ?? "").trim().replace(/,/g, "");
    const entitlement = /^\d+$/.test(entText) ? Number(entText) : NaN;

    if (!lotNumber) problems.push("Enter the lot number.");
    else if (lotNumber.length > MAX_LOT_NUMBER) problems.push(`The lot number can be at most ${MAX_LOT_NUMBER} characters.`);
    else if (controlChars.test(lotNumber)) problems.push("The lot number contains a character that is not allowed.");
    else {
      const key = lotNumber.toLowerCase();
      const first = seen.get(key);
      if (first !== undefined) problems.push(`Lot ${lotNumber} is entered twice (also row ${first + 1}).`);
      else seen.set(key, i);
    }
    if (unitNumber.length > MAX_LOT_NUMBER) problems.push(`The unit number can be at most ${MAX_LOT_NUMBER} characters.`);
    else if (controlChars.test(unitNumber)) problems.push("The unit number contains a character that is not allowed.");
    if (!entText) problems.push(`Enter the ${ent}.`);
    else if (!Number.isInteger(entitlement) || entitlement < 1) problems.push(`The ${ent} must be a whole number of at least 1.`);
    else if (entitlement > MAX_ENTITLEMENT) problems.push(`The ${ent} is too large.`);
    let second = NaN;
    if (separate?.field) {
      const text = String(row[separate.field] ?? "").trim().replace(/,/g, "");
      second = /^\d+$/.test(text) ? Number(text) : NaN;
      if (!text) problems.push(`Enter the ${separate.name}.`);
      else if (!Number.isInteger(second) || second < 1) problems.push(`The ${separate.name} must be a whole number of at least 1.`);
      else if (second > MAX_ENTITLEMENT) problems.push(`The ${separate.name} is too large.`);
      if (Number.isInteger(second) && second > 0) separateSum += second;
    }
    if (!ownerName) problems.push("Enter the owner's name as it appears on the strata roll.");
    else if (ownerName.length > MAX_OWNER_NAME) problems.push(`The owner name can be at most ${MAX_OWNER_NAME} characters.`);
    else if (controlChars.test(ownerName)) problems.push("The owner name contains a line break or other character that is not allowed.");

    if (Number.isInteger(entitlement) && entitlement > 0) entitlementSum += entitlement;
    if (problems.length) rowErrors[i] = problems;
    else lots.push({ lotNumber, unitNumber: unitNumber || null, entitlement, ownerName: ownerName || null, ...(separate?.field ? { [separate.field]: second } : {}) });
  });

  const count = rows.length;
  // A second schedule StrataVerze does not hold yet: the building cannot be set up, never set up without it.
  if (separate && !separate.field) errors.push(`StrataVerze does not hold each lot's ${separate.name} yet, so a building with it cannot be set up.`);
  if (!Number.isInteger(totalLots) || totalLots < 1) errors.push("Enter the building's total number of lots on the Property Details step.");
  else if (count !== totalLots)
    errors.push(`You have entered ${count} ${count === 1 ? "lot" : "lots"}, but the building has ${totalLots}. The number of lots must match.`);
  if (!Number.isInteger(totalEntitlement) || totalEntitlement < 1) errors.push(`Enter the building's total ${ent} on the Property Details step.`);
  else if (entitlementSum !== totalEntitlement)
    errors.push(
      `The ${ent}s add up to ${entitlementSum.toLocaleString("en-AU")}, but the building's total ${ent} is ${totalEntitlement.toLocaleString("en-AU")}. They must match.`,
    );

  return { ok: errors.length === 0 && Object.keys(rowErrors).length === 0, lots, rowErrors, errors, count, entitlementSum, separateSum };
}

// ─── Building opening balances ──────────────────────────────────────────────

export interface FundSheet {
  cashAtBank: string;
  leviesReceivable: string;
  /** Administrative fund only: unallocated lot credits are held there. */
  leviesInAdvance: string;
  creditors: string;
  fundBalance: string;
}

export interface OpeningBalancesInput {
  /** The date the balances are taken over at (YYYY-MM-DD). */
  takeoverDate: string;
  totalBalance: string;
  admin: FundSheet;
  capitalWorks: FundSheet;
}

export interface FundCents {
  cashAtBank: number;
  leviesReceivable: number;
  leviesInAdvance: number;
  creditors: number;
  fundBalance: number;
}

export interface BalancesCheck {
  ok: boolean;
  errors: string[];
  /** Keyed "takeoverDate", "totalBalance", "admin.cashAtBank" and so on. */
  fieldErrors: Record<string, string>;
  takeoverDate: string | null;
  total: number;
  admin: FundCents;
  capitalWorks: FundCents;
  /** What each fund's balance sheet comes to. */
  netAssets: { admin: number; capitalWorks: number };
}

export const emptyFundSheet = (): FundSheet => ({ cashAtBank: "", leviesReceivable: "", leviesInAdvance: "", creditors: "", fundBalance: "" });

export const emptyOpeningBalances = (): OpeningBalancesInput => ({
  takeoverDate: "",
  totalBalance: "",
  admin: emptyFundSheet(),
  capitalWorks: emptyFundSheet(),
});


const netOf = (f: FundCents) => f.cashAtBank + f.leviesReceivable - f.leviesInAdvance - f.creditors;

export function checkOpeningBalances(
  input: OpeningBalancesInput,
  yearEnd: string | null,
  today: string,
  words: OnboardingCheckWords = DEFAULT_CHECK_WORDS,
): BalancesCheck {
  const levies = words.levies;
  const fundLabel = { admin: firstUpper(words.funds.admin), capitalWorks: firstUpper(words.funds.capitalWorks) };
  const errors: string[] = [];
  const fieldErrors: Record<string, string> = {};

  const money = (key: string, value: string, allowNegative = false) => {
    const c = parseMoney(value, { allowNegative });
    if (c === null) {
      fieldErrors[key] = allowNegative ? "Enter an amount, for example 1,234.56." : "Enter an amount of zero or more, for example 1,234.56.";
      return 0;
    }
    return c;
  };
  const fund = (which: "admin" | "capitalWorks"): FundCents => {
    const s = input[which];
    return {
      cashAtBank: money(`${which}.cashAtBank`, s.cashAtBank, true),
      leviesReceivable: money(`${which}.leviesReceivable`, s.leviesReceivable),
      // Unallocated credits are held in the admin fund (24 Oct), so the
      // capital works fund has no levies paid in advance.
      leviesInAdvance: which === "admin" ? money(`${which}.leviesInAdvance`, s.leviesInAdvance) : 0,
      creditors: money(`${which}.creditors`, s.creditors),
      fundBalance: money(`${which}.fundBalance`, s.fundBalance, true),
    };
  };

  let takeoverDate: string | null = null;
  const t = (input.takeoverDate ?? "").trim();
  if (!parseIsoDate(t)) fieldErrors.takeoverDate = "Enter the takeover date (day, month and year).";
  else if (t > today) fieldErrors.takeoverDate = "The takeover date cannot be in the future.";
  else if (yearEnd && parseIsoDate(yearEnd)) {
    const earliest = addDays(yearStartFor(yearEnd), -1);
    if (t < earliest)
      fieldErrors.takeoverDate = `The takeover date must be in the current financial year (from ${auDate(yearStartFor(yearEnd))}), or the last day of the previous year (${auDate(earliest)}).`;
    else takeoverDate = t;
  } else takeoverDate = t;

  const total = money("totalBalance", input.totalBalance, true);
  const admin = fund("admin");
  const capitalWorks = fund("capitalWorks");
  const netAssets = { admin: netOf(admin), capitalWorks: netOf(capitalWorks) };

  if (Object.keys(fieldErrors).filter((k) => k !== "takeoverDate").length === 0) {
    for (const which of ["admin", "capitalWorks"] as const) {
      const f = which === "admin" ? admin : capitalWorks;
      const net = netAssets[which];
      if (net !== f.fundBalance) {
        const parts = [`cash at bank ${formatMoney(f.cashAtBank)}`, `plus ${levies} receivable ${formatMoney(f.leviesReceivable)}`];
        if (which === "admin") parts.push(`less ${levies} paid in advance ${formatMoney(f.leviesInAdvance)}`);
        parts.push(`less creditors ${formatMoney(f.creditors)}`);
        errors.push(
          `${fundLabel[which]}: the balance sheet comes to ${formatMoney(net)} (${parts.join(", ")}), but the fund balance is ${formatMoney(f.fundBalance)}. Difference ${formatMoney(net - f.fundBalance)}.`,
        );
      }
    }
    if (total !== admin.fundBalance + capitalWorks.fundBalance)
      errors.push(
        `The total opening balance (${formatMoney(total)}) must equal the ${words.funds.admin} (${formatMoney(admin.fundBalance)}) plus the ${words.funds.capitalWorks} (${formatMoney(capitalWorks.fundBalance)}), which is ${formatMoney(admin.fundBalance + capitalWorks.fundBalance)}.`,
      );
  }

  return { ok: errors.length === 0 && Object.keys(fieldErrors).length === 0, errors, fieldErrors, takeoverDate, total, admin, capitalWorks, netAssets };
}

// ─── Lot opening balances ───────────────────────────────────────────────────

export interface LotBalanceInput {
  lotNumber: string;
  /** Levies owing to the administrative fund. */
  admin: string;
  /** Interest owing on administrative fund levies. */
  interestAdmin: string;
  /** Levies owing to the capital works fund. */
  capitalWorks: string;
  /** Interest owing on capital works fund levies. */
  interestCapitalWorks: string;
  /** A credit held for the lot: money paid but not yet applied to a levy. */
  unallocated: string;
}

export interface LotBalanceCents {
  lotNumber: string;
  admin: number;
  capitalWorks: number;
  unallocated: number;
  interestAdmin: number;
  interestCapitalWorks: number;
}

export interface LotBalancesCheck {
  ok: boolean;
  rows: LotBalanceCents[];
  rowErrors: Record<number, string[]>;
  errors: string[];
  totals: {
    admin: number;
    interestAdmin: number;
    capitalWorks: number;
    interestCapitalWorks: number;
    unallocated: number;
    receivableAdmin: number;
    receivableCapitalWorks: number;
  };
}

export const blankLotBalance = (lotNumber: string): LotBalanceInput => ({
  lotNumber,
  admin: "",
  interestAdmin: "",
  capitalWorks: "",
  interestCapitalWorks: "",
  unallocated: "",
});

export function checkLotBalances(
  rows: readonly LotBalanceInput[],
  lots: readonly { lotNumber: string }[],
  balances: { admin: FundCents; capitalWorks: FundCents },
  words: OnboardingCheckWords = DEFAULT_CHECK_WORDS,
): LotBalancesCheck {
  const { levies, lateCharge } = words;
  const admin = firstUpper(words.funds.admin);
  const capital = firstUpper(words.funds.capitalWorks);
  const rowErrors: Record<number, string[]> = {};
  const errors: string[] = [];
  const out: LotBalanceCents[] = [];
  // Matched without regard to case, but always written as the lot itself is
  // numbered, because the cutover matches lot numbers exactly.
  const known = new Map(lots.map((l) => [l.lotNumber.trim().toLowerCase(), l.lotNumber.trim()]));
  const seen = new Set<string>();

  rows.forEach((row, i) => {
    const problems: string[] = [];
    const typed = String(row.lotNumber ?? "").trim();
    const key = typed.toLowerCase();
    const lotNumber = known.get(key) ?? typed;
    if (!known.has(key)) problems.push(`Lot ${typed || "(blank)"} is not one of the building's lots.`);
    else if (seen.has(key)) problems.push(`Lot ${lotNumber} has two opening balances.`);
    seen.add(key);
    // Each column says what the amount is (owed in a fund, or held as a
    // credit), so the sign it was typed with does not matter. Urbanise, for
    // one, prints an amount owing as negative (-250.12) and a credit as
    // positive; other systems do the opposite.
    const amount = (label: string, value: string) => {
      const c = parseMoney(value, { allowNegative: true });
      if (c === null) {
        problems.push(`${label}: "${value.trim()}" is not an amount in dollars and cents.`);
        return 0;
      }
      return Math.abs(c);
    };
    const adminLevies = amount(`${admin} ${levies}`, row.admin);
    const interestAdmin = amount(`${admin} ${lateCharge}`, row.interestAdmin);
    const capitalWorks = amount(`${capital} ${levies}`, row.capitalWorks);
    const interestCapitalWorks = amount(`${capital} ${lateCharge}`, row.interestCapitalWorks);
    const unallocated = amount("Unallocated", row.unallocated);
    if (problems.length) rowErrors[i] = problems;
    else out.push({ lotNumber, admin: adminLevies, interestAdmin, capitalWorks, interestCapitalWorks, unallocated });
  });
  const missing = lots.filter((l) => !seen.has(l.lotNumber.trim().toLowerCase())).map((l) => l.lotNumber);
  if (missing.length) errors.push(`These lots have no opening balance row: ${missing.slice(0, 10).join(", ")}${missing.length > 10 ? ` and ${missing.length - 10} more` : ""}.`);

  const sum = (f: (r: LotBalanceCents) => number) => out.reduce((s, r) => s + f(r), 0);
  const totals = {
    admin: sum((r) => r.admin),
    capitalWorks: sum((r) => r.capitalWorks),
    interestAdmin: sum((r) => r.interestAdmin),
    interestCapitalWorks: sum((r) => r.interestCapitalWorks),
    unallocated: sum((r) => r.unallocated),
    receivableAdmin: sum((r) => r.admin + r.interestAdmin),
    receivableCapitalWorks: sum((r) => r.capitalWorks + r.interestCapitalWorks),
  };

  if (Object.keys(rowErrors).length === 0) {
    const tie = (label: string, lotsTotal: number, sheet: number, sheetLabel: string) => {
      if (lotsTotal !== sheet)
        errors.push(`${label} on the lots come to ${formatMoney(lotsTotal)}, but ${sheetLabel} on the balance sheet is ${formatMoney(sheet)}. Difference ${formatMoney(lotsTotal - sheet)}.`);
    };
    tie(`${admin} ${levies} and ${lateCharge}`, totals.receivableAdmin, balances.admin.leviesReceivable, `${words.funds.admin} ${levies} receivable`);
    tie(`${capital} ${levies} and ${lateCharge}`, totals.receivableCapitalWorks, balances.capitalWorks.leviesReceivable, `${words.funds.capitalWorks} ${levies} receivable`);
    tie("Unallocated amounts", totals.unallocated, balances.admin.leviesInAdvance, `${words.funds.admin} ${levies} paid in advance`);
  }

  return { ok: errors.length === 0 && Object.keys(rowErrors).length === 0, rows: out, rowErrors, errors, totals };
}

// ─── The draft cutover ──────────────────────────────────────────────────────

export interface CutoverAccounts {
  bank: string;
  receivable: { admin: string; capitalWorks: string };
  /** Administrative fund levies paid in advance. */
  inAdvance: string;
  payable: string;
  opening: { admin: string; capitalWorks: string };
}

export interface CutoverFile {
  fileName: string;
  content: string;
  mapping: Record<string, number>;
}

export interface OnboardingCutoverFiles {
  opening_balances: CutoverFile;
  levy_arrears?: CutoverFile;
  owner_credits?: CutoverFile;
}

function csvField(value: string): string {
  const v = value.replace(/[\r\n]+/g, " ");
  return /[",]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function csv(headers: string[], rows: string[][]): CutoverFile["content"] {
  return [headers, ...rows].map((r) => r.map(csvField).join(",")).join("\n") + "\n";
}

const mappingFor = (headers: string[]) => Object.fromEntries(headers.map((h, i) => [h, i]));

/**
 * The building and lot opening balances as cutover files, in the cutover's
 * own column names. Null when every balance is zero (nothing to post).
 *
 * The opening trial balance, for each fund: cash at bank (a debit, or a
 * credit if overdrawn), levies receivable (debit), levies paid in advance
 * (credit, admin only), creditors (credit) and the fund's opening balance
 * (credit, or a debit for a deficit). It nets to zero when the checks above
 * pass. The lot files are the detail behind receivables and paid in advance.
 *
 * Arrears carry the takeover date as their due date, because onboarding does
 * not collect each original due date.
 */
export function buildCutoverFiles(input: {
  takeoverDate: string;
  balances: { admin: FundCents; capitalWorks: FundCents };
  lotBalances: readonly LotBalanceCents[];
  accounts: CutoverAccounts;
  fundNames: { admin: string; capitalWorks: string };
}): OnboardingCutoverFiles | null {
  const { takeoverDate, balances, accounts, fundNames } = input;
  const description = "Opening balance at takeover (onboarding)";
  const lines: string[][] = [];
  const line = (code: string, fund: string, debitNormal: boolean, cents: number) => {
    if (cents === 0) return;
    const debit = debitNormal ? cents > 0 : cents < 0;
    const amount = plainMoney(Math.abs(cents));
    lines.push([code, debit ? amount : "0.00", debit ? "0.00" : amount, fund, description]);
  };
  for (const which of ["admin", "capitalWorks"] as const) {
    const f = balances[which];
    const fund = fundNames[which];
    line(accounts.bank, fund, true, f.cashAtBank);
    line(accounts.receivable[which], fund, true, f.leviesReceivable);
    if (which === "admin") line(accounts.inAdvance, fund, false, f.leviesInAdvance);
    line(accounts.payable, fund, false, f.creditors);
    line(accounts.opening[which], fund, false, f.fundBalance);
  }
  if (lines.length === 0) return null;

  const openingHeaders = ["accountCode", "debit", "credit", "fundName", "description"];
  const files: OnboardingCutoverFiles = {
    opening_balances: { fileName: "onboarding-opening-balances.csv", content: csv(openingHeaders, lines), mapping: mappingFor(openingHeaders) },
  };

  // Each brought-forward notice gets a short number of its own ("OB0001A",
  // "OB0001C"), which the cutover marks "BF-". Without one the cutover makes
  // a number from the lot number, which can clash for long lot numbers.
  const arrearsHeaders = ["lotNumber", "fundName", "noticeNumber", "dueDate", "levyOutstanding", "interestCharged", "interestPaid", "description"];
  const arrears: string[][] = [];
  input.lotBalances.forEach((r, i) => {
    for (const [levy, interest, fund, suffix] of [
      [r.admin, r.interestAdmin, fundNames.admin, "A"],
      [r.capitalWorks, r.interestCapitalWorks, fundNames.capitalWorks, "C"],
    ] as const) {
      if (levy === 0 && interest === 0) continue;
      const noticeNumber = `OB${String(i + 1).padStart(4, "0")}${suffix}`;
      arrears.push([r.lotNumber, fund, noticeNumber, takeoverDate, plainMoney(levy), plainMoney(interest), "0.00", "Brought forward at takeover (onboarding)"]);
    }
  });
  if (arrears.length) files.levy_arrears = { fileName: "onboarding-lot-arrears.csv", content: csv(arrearsHeaders, arrears), mapping: mappingFor(arrearsHeaders) };

  const creditHeaders = ["lotNumber", "fundName", "creditAmount", "note"];
  const credits = input.lotBalances
    .filter((r) => r.unallocated > 0)
    .map((r) => [r.lotNumber, fundNames.admin, plainMoney(r.unallocated), "Unallocated at takeover (onboarding)"]);
  if (credits.length) files.owner_credits = { fileName: "onboarding-lot-credits.csv", content: csv(creditHeaders, credits), mapping: mappingFor(creditHeaders) };

  return files;
}
