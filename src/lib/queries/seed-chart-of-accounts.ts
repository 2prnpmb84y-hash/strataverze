import { db } from "@/prisma/db";
import type { Varchar } from "@prisma/orm-postgres/target/codec-types";

/** Cast a plain string to the Prisma 8 Varchar branded type. */
function toVarchar<N extends number>(value: string): Varchar<N> {
  return value as unknown as Varchar<N>;
}

/**
 * Default chart of accounts for NSW strata schemes per SSMA 2015.
 * Created automatically when a new scheme is set up.
 *
 * Each entry specifies:
 *   code        — account code (unique within scheme)
 *   name        — display name
 *   accountType — ASSET | LIABILITY | EQUITY | INCOME | EXPENSE
 *   subType     — sub-classification for reporting
 *   fundType    — ADMINISTRATIVE | CAPITAL_WORKS (maps to the scheme's fund)
 *   gstApplicable — whether GST may apply to transactions on this account
 */
const DEFAULT_ACCOUNTS: Array<{
  code: string;
  name: string;
  accountType: string;
  subType: string;
  fundType: "ADMINISTRATIVE" | "CAPITAL_WORKS";
  gstApplicable: boolean;
}> = [
  // ── Administrative Fund ──────────────────────────────────────
  {
    code: "1-1000",
    name: "Bank Account — Operating",
    accountType: "ASSET",
    subType: "BANK",
    fundType: "ADMINISTRATIVE",
    gstApplicable: false,
  },
  {
    code: "1-1100",
    name: "Levies Receivable — Admin",
    accountType: "ASSET",
    subType: "ACCOUNTS_RECEIVABLE",
    fundType: "ADMINISTRATIVE",
    gstApplicable: false,
  },
  {
    code: "2-1000",
    name: "Accounts Payable",
    accountType: "LIABILITY",
    subType: "ACCOUNTS_PAYABLE",
    fundType: "ADMINISTRATIVE",
    gstApplicable: false,
  },
  {
    code: "2-1100",
    name: "GST Collected",
    accountType: "LIABILITY",
    subType: "GST_COLLECTED",
    fundType: "ADMINISTRATIVE",
    gstApplicable: false,
  },
  {
    code: "2-1200",
    name: "GST Paid",
    accountType: "ASSET",
    subType: "GST_PAID",
    fundType: "ADMINISTRATIVE",
    gstApplicable: false,
  },
  {
    code: "2-1300",
    name: "Levies Paid in Advance — Admin",
    accountType: "LIABILITY",
    subType: "LEVIES_IN_ADVANCE",
    fundType: "ADMINISTRATIVE",
    gstApplicable: false,
  },
  {
    code: "3-1000",
    name: "Retained Funds — Admin",
    accountType: "EQUITY",
    subType: "RETAINED_FUNDS",
    fundType: "ADMINISTRATIVE",
    gstApplicable: false,
  },
  {
    code: "3-1100",
    name: "Opening Balance — Admin",
    accountType: "EQUITY",
    subType: "OPENING_BALANCE",
    fundType: "ADMINISTRATIVE",
    gstApplicable: false,
  },
  {
    code: "4-1000",
    name: "Levy Income — Admin",
    accountType: "INCOME",
    subType: "LEVY_INCOME",
    fundType: "ADMINISTRATIVE",
    gstApplicable: false,
  },
  {
    code: "4-1100",
    name: "Interest Income",
    accountType: "INCOME",
    subType: "INTEREST_INCOME",
    fundType: "ADMINISTRATIVE",
    gstApplicable: false,
  },
  {
    code: "4-1200",
    name: "Sundry Income",
    accountType: "INCOME",
    subType: "SUNDRY_INCOME",
    fundType: "ADMINISTRATIVE",
    gstApplicable: true,
  },
  {
    code: "5-1000",
    name: "Management Fees",
    accountType: "EXPENSE",
    subType: "MANAGEMENT_FEE",
    fundType: "ADMINISTRATIVE",
    gstApplicable: true,
  },
  {
    code: "5-1100",
    name: "Insurance",
    accountType: "EXPENSE",
    subType: "INSURANCE_EXPENSE",
    fundType: "ADMINISTRATIVE",
    gstApplicable: true,
  },
  {
    code: "5-1200",
    name: "Maintenance and Repairs",
    accountType: "EXPENSE",
    subType: "MAINTENANCE_EXPENSE",
    fundType: "ADMINISTRATIVE",
    gstApplicable: true,
  },
  {
    code: "5-1300",
    name: "Utilities",
    accountType: "EXPENSE",
    subType: "UTILITIES_EXPENSE",
    fundType: "ADMINISTRATIVE",
    gstApplicable: true,
  },
  {
    code: "5-1400",
    name: "Professional Fees",
    accountType: "EXPENSE",
    subType: "PROFESSIONAL_FEE",
    fundType: "ADMINISTRATIVE",
    gstApplicable: true,
  },
  {
    code: "5-1500",
    name: "Sundry Expenses",
    accountType: "EXPENSE",
    subType: "SUNDRY_EXPENSE",
    fundType: "ADMINISTRATIVE",
    gstApplicable: true,
  },

  // ── Capital Works Fund ───────────────────────────────────────
  {
    code: "1-2100",
    name: "Levies Receivable — Capital Works",
    accountType: "ASSET",
    subType: "ACCOUNTS_RECEIVABLE",
    fundType: "CAPITAL_WORKS",
    gstApplicable: false,
  },
  {
    code: "2-2300",
    name: "Levies Paid in Advance — Capital Works",
    accountType: "LIABILITY",
    subType: "LEVIES_IN_ADVANCE",
    fundType: "CAPITAL_WORKS",
    gstApplicable: false,
  },
  {
    code: "3-2000",
    name: "Retained Funds — Capital Works",
    accountType: "EQUITY",
    subType: "RETAINED_FUNDS",
    fundType: "CAPITAL_WORKS",
    gstApplicable: false,
  },
  {
    code: "3-2100",
    name: "Opening Balance — Capital Works",
    accountType: "EQUITY",
    subType: "OPENING_BALANCE",
    fundType: "CAPITAL_WORKS",
    gstApplicable: false,
  },
  {
    code: "4-2000",
    name: "Levy Income — Capital Works",
    accountType: "INCOME",
    subType: "LEVY_INCOME",
    fundType: "CAPITAL_WORKS",
    gstApplicable: false,
  },
  {
    code: "5-2000",
    name: "Capital Works Expenditure",
    accountType: "EXPENSE",
    subType: "MAINTENANCE_EXPENSE",
    fundType: "CAPITAL_WORKS",
    gstApplicable: true,
  },
];

/**
 * Seed the default NSW strata chart of accounts for a scheme.
 *
 * Looks up the scheme's ADMINISTRATIVE and CAPITAL_WORKS funds and creates
 * all default accounts as system accounts within a single transaction.
 *
 * This function is idempotent: if accounts with the same codes already exist
 * for the scheme, they are skipped.
 *
 * @param schemeId - The scheme to seed accounts for
 * @returns The created account records (excludes any skipped duplicates)
 */
export async function seedDefaultChartOfAccounts(schemeId: string) {
  return db.transaction(async (tx) => {
    // Fetch the scheme's funds to map fundType to fundId
    const funds = await tx.orm.public.Fund
      .where((f) => f.schemeId.eq(schemeId))
      .all();

    const fundMap = new Map<string, string>();
    for (const fund of funds) {
      fundMap.set(fund.fundType, fund.id);
    }

    const adminFundId = fundMap.get("ADMINISTRATIVE");
    const capitalFundId = fundMap.get("CAPITAL_WORKS");

    if (!adminFundId) {
      throw new Error(
        `Scheme ${schemeId} has no ADMINISTRATIVE fund. Create funds before seeding the chart of accounts.`,
      );
    }
    if (!capitalFundId) {
      throw new Error(
        `Scheme ${schemeId} has no CAPITAL_WORKS fund. Create funds before seeding the chart of accounts.`,
      );
    }

    // Check for existing accounts to make this idempotent
    const existingAccounts = await tx.orm.public.AccountCode
      .where((a) => a.schemeId.eq(schemeId))
      .all();

    const existingCodes = new Set(existingAccounts.map((a) => a.code));

    const created = [];

    for (const account of DEFAULT_ACCOUNTS) {
      // Skip if an account with this code already exists
      if (existingCodes.has(toVarchar<10>(account.code))) {
        continue;
      }

      const fundId =
        account.fundType === "ADMINISTRATIVE" ? adminFundId : capitalFundId;

      const record = await tx.orm.public.AccountCode.create({
        schemeId,
        code: toVarchar<10>(account.code),
        name: toVarchar<200>(account.name),
        accountType: account.accountType,
        accountSubType: account.subType,
        fundId,
        isSystemAccount: true,
        isActive: true,
        gstApplicable: account.gstApplicable,
        description: null,
        parentAccountId: null,
      });

      created.push(record);
    }

    return created;
  });
}

/**
 * The fund's "Levies Paid in Advance" liability account (owner credits),
 * created if a scheme seeded before it existed does not have it.
 */
export async function ensureLeviesInAdvanceAccount(schemeId: string, fundId: string) {
  const existing = await db.orm.public.AccountCode
    .where((a) => a.schemeId.eq(schemeId))
    .limit(500)
    .all();
  const found = existing.find((a) => a.accountSubType === "LEVIES_IN_ADVANCE" && a.fundId === fundId && a.isActive);
  if (found) return found;
  const fund = await db.orm.public.Fund.where((f) => f.id.eq(fundId)).first();
  if (!fund) return null;
  const isCapital = fund.fundType === "CAPITAL_WORKS";
  const template = DEFAULT_ACCOUNTS.find((a) => a.subType === "LEVIES_IN_ADVANCE" && a.fundType === (isCapital ? "CAPITAL_WORKS" : "ADMINISTRATIVE"))!;
  const codes = new Set(existing.map((a) => String(a.code)));
  let code = template.code;
  // 2-1300, then 2-1310, 2-1320 ... if a scheme already uses the code.
  for (let i = 1; codes.has(code) && i < 9; i++) code = `${template.code.slice(0, 2)}${Number(template.code.slice(2)) + i * 10}`;
  return db.orm.public.AccountCode.create({
    schemeId,
    code: toVarchar<10>(code),
    name: toVarchar<200>(template.name),
    accountType: template.accountType,
    accountSubType: template.subType,
    fundId,
    isSystemAccount: true,
    isActive: true,
    gstApplicable: false,
    description: "Owner credits: levies paid in advance or overpaid.",
    parentAccountId: null,
  });
}
