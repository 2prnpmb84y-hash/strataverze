/**
 * Fund integrity of a journal (financials review B1, 26 Oct 2026).
 *
 * An owners corporation keeps an administrative fund and a capital works fund
 * (SSMA 2015 ss 73 and 74), and their money must not be mixed. The ledger
 * tags every journal line with a fund, so two rules keep the funds apart:
 *
 * 1. Each fund balances on its own: in one journal, a fund's debits equal its
 *    credits. A journal cannot move value from one fund to another.
 * 2. An account that belongs to a fund is used only for that fund. The
 *    accounts both funds share (the bank, suspense, accounts payable and GST
 *    accounts, and any account with no fund) can be used for either fund,
 *    and their balance by fund comes from the line tags.
 *
 * Moving money between the funds on purpose (a transfer or loan) is not
 * supported by a journal: it needs its own reviewed workflow.
 */
import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";

import { SHARED_ACCOUNT_SUB_TYPES, isSharedAccount } from "./fund-balance-check";

export { SHARED_ACCOUNT_SUB_TYPES, isSharedAccount };

export interface IntegrityLine {
  accountCodeId: string;
  fundId: string;
  debit?: number | string | null;
  credit?: number | string | null;
}

export interface IntegrityAccount {
  id: string;
  code: string;
  name: string;
  accountSubType: string | null;
  fundId: string | null;
}

export class FundIntegrityError extends Error {
  constructor(readonly problems: string[]) {
    super(problems.join(" "));
    this.name = "FundIntegrityError";
  }
}

const cents = (v: number | string | null | undefined) => Math.round(Number(v ?? 0) * 100);
const dollars = (c: number) =>
  `$${(Math.abs(c) / 100).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * The problems that stop a journal from posting, in plain words. Empty when
 * every fund balances and every account is used for its own fund.
 */
export function fundIntegrityProblems(
  lines: IntegrityLine[],
  accounts: ReadonlyMap<string, IntegrityAccount>,
  fundName: (fundId: string) => string = () => "fund",
): string[] {
  const problems: string[] = [];
  const byFund = new Map<string, { dr: number; cr: number }>();
  const seenMisuse = new Set<string>();

  for (const line of lines) {
    const t = byFund.get(line.fundId) ?? { dr: 0, cr: 0 };
    t.dr += cents(line.debit);
    t.cr += cents(line.credit);
    byFund.set(line.fundId, t);

    const account = accounts.get(line.accountCodeId);
    if (!account) {
      problems.push("A line uses an account that is not in this scheme's chart of accounts.");
      continue;
    }
    if (!isSharedAccount(account) && account.fundId !== line.fundId) {
      const key = `${account.id}:${line.fundId}`;
      if (seenMisuse.has(key)) continue;
      seenMisuse.add(key);
      problems.push(
        `${account.code} ${account.name} belongs to the ${fundName(account.fundId!)}, so it cannot be used for the ${fundName(line.fundId)}.`,
      );
    }
  }

  for (const [fundId, t] of byFund) {
    if (t.dr !== t.cr) {
      problems.push(
        `The ${fundName(fundId)} lines are out of balance by ${dollars(t.dr - t.cr)} (debits ${dollars(t.dr)}, credits ${dollars(t.cr)}). Each fund must balance on its own, so a journal cannot move money between funds.`,
      );
    }
  }
  return problems;
}

/**
 * Check a journal's lines against the scheme's accounts and funds, and throw
 * FundIntegrityError if a fund is out of balance or an account is used for
 * another fund. Pass `db.orm` or a transaction's `tx.orm`.
 */
export async function assertFundIntegrity(orm: typeof db.orm, schemeId: string, lines: IntegrityLine[]): Promise<void> {
  const ids = [...new Set(lines.map((l) => l.accountCodeId))];
  const fundIds = [...new Set(lines.map((l) => l.fundId))];
  const [accountRows, fundRows] = await Promise.all([
    ids.length ? orm.public.AccountCode.where((a) => and(a.schemeId.eq(schemeId), a.id.in(ids))).limit(ids.length).all() : Promise.resolve([]),
    fundIds.length ? orm.public.Fund.where((f) => and(f.schemeId.eq(schemeId), f.id.in(fundIds))).limit(fundIds.length).all() : Promise.resolve([]),
  ]);
  const accounts = new Map<string, IntegrityAccount>();
  for (const r of accountRows) {
    accounts.set(r.id, { id: r.id, code: String(r.code), name: String(r.name), accountSubType: r.accountSubType ?? null, fundId: r.fundId ?? null });
  }
  const names = new Map<string, string>(fundRows.map((f) => [f.id, String(f.name)]));
  const problems: string[] = [];
  if (lines.some((l) => !names.has(l.fundId))) problems.push("A line uses a fund that is not one of this scheme's funds.");
  problems.push(...fundIntegrityProblems(lines, accounts, (id) => names.get(id) ?? "another fund"));
  if (problems.length) throw new FundIntegrityError(problems);
}

/**
 * Why an account cannot be used for a fund (an invoice, a matching rule),
 * or null if it can. Checked when the record is saved, so the journal
 * posted later from it cannot fail (financials review B1).
 */
export async function accountFundProblem(orm: typeof db.orm, schemeId: string, accountCodeId: string, fundId: string): Promise<string | null> {
  const [account, fund] = await Promise.all([
    orm.public.AccountCode.where((a) => and(a.schemeId.eq(schemeId), a.id.eq(accountCodeId))).first(),
    orm.public.Fund.where((f) => and(f.schemeId.eq(schemeId), f.id.eq(fundId))).first(),
  ]);
  if (!account || !fund) return null; // Checked elsewhere (the record must be this scheme's).
  if (isSharedAccount({ accountSubType: account.accountSubType ?? null, fundId: account.fundId ?? null }) || account.fundId === fundId) return null;
  const owner = await orm.public.Fund.where((f) => f.id.eq(account.fundId!)).first();
  return `${String(account.code)} ${String(account.name)} belongs to the ${owner ? String(owner.name) : "other fund"}, so it cannot be used for the ${String(fund.name)}. Choose an account of the ${String(fund.name)}, or change the fund.`;
}
