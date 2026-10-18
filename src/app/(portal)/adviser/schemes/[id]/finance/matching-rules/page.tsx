import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemeById } from "@/lib/queries/schemes";
import { getMatchingRulesForScheme } from "@/lib/queries/matching-rules";
import { getAccountCodesForScheme } from "@/lib/queries/account-codes";
import { getFundsForScheme } from "@/lib/queries/funds";
import { getBankAccountsForScheme } from "@/lib/queries/bank-accounts";
import { PageHeader } from "@/components/ui/page-header";
import { MatchingRulesClient } from "./matching-rules-client";
import { connection } from "next/server";

export default async function MatchingRulesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();

  const isAdviser = scheme.memberships.some(
    (m) => m.profileId === profile.id && m.role === "ADVISER",
  );
  if (!isAdviser) notFound();

  const [rules, accountCodes, funds, bankAccounts] = await Promise.all([
    getMatchingRulesForScheme(id, true),
    getAccountCodesForScheme(id),
    getFundsForScheme(id),
    getBankAccountsForScheme(id),
  ]);

  const activeAccounts = accountCodes
    .filter((a) => a.isActive)
    .map((a) => ({
      id: a.id,
      code: String(a.code),
      name: String(a.name),
    }))
    .sort((a, b) => a.code.localeCompare(b.code));

  const activeFunds = funds
    .filter((f) => !f.deletedAt)
    .map((f) => ({
      id: f.id,
      name: String(f.name),
    }));

  const bankAccountList = bankAccounts.map((ba) => ({
    id: ba.id,
    accountName: String(ba.accountName),
    bsb: String(ba.bsb),
    accountNumber: String(ba.accountNumber),
  }));

  const serialisedRules = rules.map((r) => ({
    id: r.id,
    name: String(r.name),
    description: r.description ? String(r.description) : null,
    matchType: r.matchType,
    descriptionPattern: r.descriptionPattern
      ? String(r.descriptionPattern)
      : null,
    referencePattern: r.referencePattern ? String(r.referencePattern) : null,
    exactAmount: r.exactAmount,
    minAmount: r.minAmount,
    maxAmount: r.maxAmount,
    transactionSign: r.transactionSign,
    targetAccountCodeId: r.targetAccountCodeId,
    targetFundId: r.targetFundId,
    autoPost: r.autoPost,
    priority: r.priority,
    isActive: r.isActive,
    matchCount: r.matchCount,
    lastMatchedAt: r.lastMatchedAt,
    targetAccountCode: r.targetAccountCode
      ? {
          id: r.targetAccountCode.id,
          code: r.targetAccountCode.code,
          name: r.targetAccountCode.name,
        }
      : null,
    targetFund: r.targetFund
      ? { id: r.targetFund.id, name: r.targetFund.name }
      : null,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Matching Rules"
        description="Manage automated bank transaction matching rules. Rules are applied in priority order to unmatched transactions during bank imports."
      />

      <MatchingRulesClient
        schemeId={id}
        rules={serialisedRules}
        accounts={activeAccounts}
        funds={activeFunds}
        bankAccounts={bankAccountList}
      />
    </div>
  );
}
