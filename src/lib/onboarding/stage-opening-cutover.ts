import {
  CutoverError,
  ONBOARDING_SOURCE,
  createCutover,
  discardDraftCutover,
  loadCutoverLookups,
  stageCutoverFile,
} from "@/lib/finance/migration-batches";
import type { CutoverDataType } from "@/lib/finance/migration-cutover";
import { buildCutoverFiles, type CutoverAccounts, type FundCents, type LotBalanceCents } from "./property-onboarding";

/**
 * Put a new building's opening balances into a draft cutover, ready for the
 * Adviser to sign off and post in Finance (onboarding, 24 Oct).
 *
 * Nothing is posted here. The cutover's own checks run again when it is
 * signed off, and the Adviser may replace any file (for example, the lot
 * arrears with the original notices and due dates) before signing.
 *
 * Returns the cutover's id, or null when every balance is zero.
 */
export async function stageOnboardingCutover(input: {
  schemeId: string;
  actorId: string;
  takeoverDate: string;
  balances: { admin: FundCents; capitalWorks: FundCents };
  lotBalances: readonly LotBalanceCents[];
}): Promise<string | null> {
  const lookups = await loadCutoverLookups(input.schemeId);
  const admin = lookups.funds.find((f) => f.fundType === "ADMINISTRATIVE");
  const capitalWorks = lookups.funds.find((f) => f.fundType === "CAPITAL_WORKS");
  if (!admin || !capitalWorks) throw new CutoverError("The building has no administrative or capital works fund.");

  const code = (subType: string, fundId: string, what: string) => {
    const account =
      lookups.accounts.find((a) => a.accountSubType === subType && a.fundId === fundId) ??
      // The default chart has one operating bank account and one accounts
      // payable account, in the admin fund. Lines for the capital works fund
      // use them, tagged to that fund.
      (fundId === capitalWorks.id ? lookups.accounts.find((a) => a.accountSubType === subType && a.fundId === admin.id) : undefined);
    if (!account) throw new CutoverError(`The chart of accounts has no ${what} account.`);
    return account.code;
  };
  const accounts: CutoverAccounts = {
    bank: code("BANK", admin.id, "bank"),
    receivable: {
      admin: code("ACCOUNTS_RECEIVABLE", admin.id, "administrative fund levies receivable"),
      capitalWorks: code("ACCOUNTS_RECEIVABLE", capitalWorks.id, "capital works fund levies receivable"),
    },
    inAdvance: code("LEVIES_IN_ADVANCE", admin.id, "levies paid in advance"),
    payable: code("ACCOUNTS_PAYABLE", admin.id, "accounts payable"),
    opening: {
      admin: code("OPENING_BALANCE", admin.id, "administrative fund opening balance"),
      capitalWorks: code("OPENING_BALANCE", capitalWorks.id, "capital works fund opening balance"),
    },
  };

  const files = buildCutoverFiles({
    takeoverDate: input.takeoverDate,
    balances: input.balances,
    lotBalances: input.lotBalances,
    accounts,
    fundNames: { admin: admin.name, capitalWorks: capitalWorks.name },
  });
  if (!files) return null;

  const batchId = await createCutover(
    {
      schemeId: input.schemeId,
      sourceSystem: ONBOARDING_SOURCE.value,
      cutoverDate: input.takeoverDate,
      actorId: input.actorId,
    },
    { onboarding: true },
  );
  try {
    for (const [dataType, file] of Object.entries(files) as [CutoverDataType, NonNullable<(typeof files)[keyof typeof files]>][]) {
      const result = await stageCutoverFile({
        schemeId: input.schemeId,
        batchId,
        dataType,
        fileName: file.fileName,
        content: file.content,
        mapping: file.mapping,
        actorId: input.actorId,
      });
      if (!result.staged) throw new CutoverError(`The ${dataType} file could not be staged (missing ${result.missing.join(", ")}).`);
    }
  } catch (err) {
    // All the files or none: a draft with only some of them could be signed
    // off with receivables that have no notices behind them.
    await discardDraftCutover(input.schemeId, batchId).catch(() => {});
    throw err;
  }
  return batchId;
}
