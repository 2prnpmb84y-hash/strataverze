/**
 * Fund names from the building's rule pack (QLD stage 2, step 4, 27 Oct 2026).
 *
 * The funds people see are named from the pack's FUND_CATALOGUE, so a
 * Queensland building shows its sinking fund where an NSW building shows its
 * capital works fund, though both are kept in the ledger's CAPITAL_WORKS
 * fund type. Pure, with type imports only, so client components can use it
 * with the catalogue their server parent passes them.
 */
import type { StatutoryRules } from "@/config/statutory";

/** A pack's funds (`rules.FUND_CATALOGUE`), plain data a server page can pass to the browser. */
export type FundCatalogue = StatutoryRules["FUND_CATALOGUE"];
export type FundEntry = FundCatalogue[number];
export type LedgerFund = FundEntry["ledgerFund"];

type CatalogueSource = FundCatalogue | Pick<StatutoryRules, "FUND_CATALOGUE">;

const catalogueOf = (source: CatalogueSource): FundCatalogue => ("FUND_CATALOGUE" in source ? source.FUND_CATALOGUE : source);

/**
 * The ledger fund each stored fund type is kept in. Legacy ADMIN is the
 * administrative fund and legacy SINKING an NSW capital works fund. SPECIAL
 * (and anything else) is not in the catalogue.
 */
const LEDGER_FUND: Readonly<Record<string, LedgerFund>> = {
  ADMINISTRATIVE: "ADMINISTRATIVE",
  ADMIN: "ADMINISTRATIVE",
  CAPITAL_WORKS: "CAPITAL_WORKS",
  SINKING: "CAPITAL_WORKS",
};

/** The ledger fund a stored fund type is kept in, or null (SPECIAL, or unknown). */
export function ledgerFundOf(fundType: string | null | undefined): LedgerFund | null {
  return LEDGER_FUND[String(fundType ?? "")] ?? null;
}

/**
 * The catalogue's fund for a stored fund type: ADMINISTRATIVE or ADMIN gives
 * the fund kept in ADMINISTRATIVE, CAPITAL_WORKS or SINKING the one kept in
 * CAPITAL_WORKS. Null for SPECIAL, an unknown type, or a pack without it.
 */
export function fundDefinition(source: CatalogueSource, fundType: string | null | undefined): FundEntry | null {
  const ledger = ledgerFundOf(fundType);
  return ledger ? (catalogueOf(source).find((f) => f.ledgerFund === ledger) ?? null) : null;
}

/** The catalogue's fund kept in a ledger fund. Throws if the pack has none. */
export function ledgerFundDefinition(source: CatalogueSource, ledger: LedgerFund): FundEntry {
  const fund = fundDefinition(source, ledger);
  if (!fund) throw new Error(`The rule pack has no fund kept in ${ledger}.`);
  return fund;
}

/** "Capital Works Fund", "Sinking Fund", or null when the type is not in the catalogue. */
export function fundLabel(source: CatalogueSource, fundType: string | null | undefined): string | null {
  return fundDefinition(source, fundType)?.label ?? null;
}

/** "Admin", "Capital Works", "Sinking Fund", or null when the type is not in the catalogue. */
export function fundShortLabel(source: CatalogueSource, fundType: string | null | undefined): string | null {
  return fundDefinition(source, fundType)?.shortLabel ?? null;
}

/** The label without its last word, as a fund's type is shown beside its name: "Administrative", "Capital Works", "Sinking". */
export function fundTypeWords(fund: Pick<FundEntry, "label">): string {
  return fund.label.replace(/ Fund$/, "");
}

/** The law's name without "fund", for a sentence naming funds together: "administrative", "capital works", "sinking". */
export function fundNameWords(fund: Pick<FundEntry, "name">): string {
  return fund.name.replace(/ fund$/, "");
}

/**
 * A fund's type as a fund list or fund page shows it: the page's own label
 * for a stored legacy type (ADMIN, SINKING, RESERVE, kept as those pages have
 * always shown them), else the pack's label ("Capital Works Fund", "Sinking
 * Fund"), else the type as stored (decided 27 Oct 2026, so no page shows
 * "CAPITAL_WORKS").
 */
export function fundTypeLabel(source: CatalogueSource, fundType: string, legacyLabels: Readonly<Record<string, string>>): string {
  return legacyLabels[fundType] ?? fundLabel(source, fundType) ?? fundType;
}

/** The funds every new building is given: the catalogue's required funds, in its order, named by their label. */
export function defaultFunds(source: CatalogueSource): { name: string; fundType: LedgerFund }[] {
  return catalogueOf(source)
    .filter((f) => f.required)
    .map((f) => ({ name: f.label, fundType: f.ledgerFund }));
}
