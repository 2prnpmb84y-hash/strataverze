import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";
import type {
  Numeric,
  TimestampString,
  Varchar,
} from "@prisma/orm-postgres/target/codec-types";
import { accountFundProblem } from "@/lib/finance/fund-integrity";

function toNumeric(value: number | string): Numeric<12, 2> {
  return String(value) as unknown as Numeric<12, 2>;
}

function toTimestamp(value: string): TimestampString<3> {
  return value as unknown as TimestampString<3>;
}

function toVarchar<N extends number>(value: string): Varchar<N> {
  return value as unknown as Varchar<N>;
}

/**
 * Fetch all matching rules for a scheme, ordered by priority (highest first).
 */
export async function getMatchingRulesForScheme(
  schemeId: string,
  includeInactive = false,
  limit = 200,
) {
  let query = db.orm.public.MatchingRule.where((r) => r.schemeId.eq(schemeId));

  if (!includeInactive) {
    query = query.where((r) => r.isActive.eq(true));
  }

  return query
    .include("targetAccountCode")
    .include("targetFund")
    .orderBy((r) => r.priority.desc())
    .limit(limit)
    .all();
}

/**
 * Fetch a single matching rule by ID.
 */
export async function getMatchingRuleById(ruleId: string) {
  try {
    return db.orm.public.MatchingRule
      .where((r) => r.id.eq(ruleId))
      .include("targetAccountCode")
      .include("targetFund")
      .first();
  } catch {
    // Table may not exist yet
    return null;
  }
}

/**
 * Create a new matching rule.
 */
export async function createMatchingRule(data: {
  schemeId: string;
  name: string;
  description?: string;
  matchType: string;
  descriptionPattern?: string;
  referencePattern?: string;
  exactAmount?: number;
  minAmount?: number;
  maxAmount?: number;
  transactionSign?: string;
  targetAccountCodeId?: string;
  targetFundId?: string;
  autoPost?: boolean;
  priority?: number;
}) {
  return db.orm.public.MatchingRule.create({
    schemeId: data.schemeId,
    name: toVarchar<200>(data.name),
    description: data.description ? toVarchar<500>(data.description) : null,
    matchType: data.matchType,
    descriptionPattern: data.descriptionPattern
      ? toVarchar<500>(data.descriptionPattern)
      : null,
    referencePattern: data.referencePattern
      ? toVarchar<200>(data.referencePattern)
      : null,
    exactAmount:
      data.exactAmount !== undefined ? toNumeric(data.exactAmount) : null,
    minAmount: data.minAmount !== undefined ? toNumeric(data.minAmount) : null,
    maxAmount: data.maxAmount !== undefined ? toNumeric(data.maxAmount) : null,
    transactionSign: data.transactionSign ?? null,
    targetAccountCodeId: data.targetAccountCodeId ?? null,
    targetFundId: data.targetFundId ?? null,
    autoPost: data.autoPost ?? false,
    priority: data.priority ?? 0,
  });
}

/**
 * Update an existing matching rule.
 */
export async function updateMatchingRule(
  schemeId: string,
  ruleId: string,
  data: Partial<{
    name: string;
    description: string | null;
    matchType: string;
    descriptionPattern: string | null;
    referencePattern: string | null;
    exactAmount: number | null;
    minAmount: number | null;
    maxAmount: number | null;
    transactionSign: string | null;
    targetAccountCodeId: string | null;
    targetFundId: string | null;
    autoPost: boolean;
    priority: number;
    isActive: boolean;
  }>,
) {
  const updateData: Record<string, unknown> = {};

  if (data.name !== undefined)
    updateData.name = toVarchar<200>(data.name);
  if (data.description !== undefined)
    updateData.description = data.description
      ? toVarchar<500>(data.description)
      : null;
  if (data.matchType !== undefined) updateData.matchType = data.matchType;
  if (data.descriptionPattern !== undefined)
    updateData.descriptionPattern = data.descriptionPattern
      ? toVarchar<500>(data.descriptionPattern)
      : null;
  if (data.referencePattern !== undefined)
    updateData.referencePattern = data.referencePattern
      ? toVarchar<200>(data.referencePattern)
      : null;
  if (data.exactAmount !== undefined)
    updateData.exactAmount =
      data.exactAmount !== null ? toNumeric(data.exactAmount) : null;
  if (data.minAmount !== undefined)
    updateData.minAmount =
      data.minAmount !== null ? toNumeric(data.minAmount) : null;
  if (data.maxAmount !== undefined)
    updateData.maxAmount =
      data.maxAmount !== null ? toNumeric(data.maxAmount) : null;
  if (data.transactionSign !== undefined)
    updateData.transactionSign = data.transactionSign;
  if (data.targetAccountCodeId !== undefined)
    updateData.targetAccountCodeId = data.targetAccountCodeId;
  if (data.targetFundId !== undefined)
    updateData.targetFundId = data.targetFundId;
  if (data.autoPost !== undefined) updateData.autoPost = data.autoPost;
  if (data.priority !== undefined) updateData.priority = data.priority;
  if (data.isActive !== undefined) updateData.isActive = data.isActive;

  // Scheme-scoped: returns null when the rule is not this scheme's.
  return db.orm.public.MatchingRule
    .where((r) => and(r.id.eq(ruleId), r.schemeId.eq(schemeId)))
    .update(updateData);
}

/**
 * Delete a matching rule (hard delete since rules have no financial impact).
 * Scheme-scoped: returns null, and changes nothing, when the rule is not this
 * scheme's.
 */
export async function deleteMatchingRule(schemeId: string, ruleId: string) {
  const rule = await db.orm.public.MatchingRule
    .where((r) => and(r.id.eq(ruleId), r.schemeId.eq(schemeId)))
    .first();
  if (!rule) return null;

  // First clear matching_rule_id from any transactions that reference this rule
  await db.orm.public.BankTransaction
    .where((t) => and(t.matchingRuleId.eq(rule.id), t.schemeId.eq(schemeId)))
    .updateAndCount({ matchingRuleId: null });

  await db.orm.public.MatchingRule
    .where((r) => and(r.id.eq(rule.id), r.schemeId.eq(schemeId)))
    .delete();
  return rule;
}

/**
 * Check if a bank transaction matches a rule's criteria.
 * Exported for unit testing.
 */
export function transactionMatchesRule(
  transaction: {
    description: string;
    reference: string | null;
    amount: number;
  },
  rule: {
    matchType: string;
    descriptionPattern: string | null;
    referencePattern: string | null;
    exactAmount: unknown;
    minAmount: unknown;
    maxAmount: unknown;
    transactionSign: string | null;
  },
): boolean {
  const desc = String(transaction.description).toLowerCase();
  const ref = transaction.reference
    ? String(transaction.reference).toLowerCase()
    : "";
  const amount = transaction.amount;

  // Check transaction sign filter
  if (rule.transactionSign === "CREDIT" && amount < 0) return false;
  if (rule.transactionSign === "DEBIT" && amount > 0) return false;

  const matchesDescription =
    rule.descriptionPattern &&
    desc.includes(String(rule.descriptionPattern).toLowerCase());

  const matchesReference =
    rule.referencePattern &&
    ref.includes(String(rule.referencePattern).toLowerCase());

  const exactAmt = rule.exactAmount !== null ? Number(rule.exactAmount) : null;
  const minAmt = rule.minAmount !== null ? Number(rule.minAmount) : null;
  const maxAmt = rule.maxAmount !== null ? Number(rule.maxAmount) : null;

  const absAmount = Math.abs(amount);
  const matchesExactAmount =
    exactAmt !== null && Math.abs(absAmount - exactAmt) < 0.005;
  const matchesAmountRange =
    (minAmt === null || absAmount >= minAmt) &&
    (maxAmt === null || absAmount <= maxAmt) &&
    (minAmt !== null || maxAmt !== null);

  switch (rule.matchType) {
    case "DESCRIPTION":
      return !!matchesDescription;
    case "REFERENCE":
      return !!matchesReference;
    case "AMOUNT":
      return matchesExactAmount || matchesAmountRange;
    case "DESCRIPTION_AND_AMOUNT":
      return (
        !!matchesDescription &&
        (matchesExactAmount || matchesAmountRange)
      );
    default:
      return false;
  }
}

/**
 * Run auto-matching: apply all active matching rules to unmatched transactions.
 * Returns the number of transactions matched.
 */
export async function autoMatchTransactions(
  schemeId: string,
  bankAccountId?: string,
  profileId?: string,
) {
  // Get active rules ordered by priority
  const rules = await getMatchingRulesForScheme(schemeId, false);
  if (rules.length === 0) return { matched: 0, results: [] };

  // Get unmatched transactions
  let query = db.orm.public.BankTransaction.where((t) =>
    and(
      t.schemeId.eq(schemeId),
      t.reconciliationStatus.eq("UNMATCHED"),
      t.isDuplicate.eq(false),
    ),
  );

  if (bankAccountId) {
    query = query.where((t) => t.bankAccountId.eq(bankAccountId));
  }

  const transactions = await query
    .orderBy((t) => t.transactionDate.asc())
    .limit(1000)
    .all();

  if (transactions.length === 0) return { matched: 0, results: [] };

  const results: Array<{
    transactionId: string;
    ruleName: string;
    accountCode: string;
    fundName: string;
  }> = [];

  for (const txn of transactions) {
    for (const rule of rules) {
      const matches = transactionMatchesRule(
        {
          description: String(txn.description),
          reference: txn.reference ? String(txn.reference) : null,
          amount: Number(txn.amount),
        },
        rule,
      );

      // A rule whose account belongs to the other fund would post across the
      // funds: leave the transaction for a person to allocate (review B1).
      if (matches && rule.targetAccountCodeId && rule.targetFundId && (await accountFundProblem(db.orm, schemeId, rule.targetAccountCodeId, rule.targetFundId))) continue;
      if (matches && rule.targetAccountCodeId && rule.targetFundId) {
        // Create a journal entry for the matched transaction
        const entryNumber = await getNextMatchEntryNumber(schemeId);
        const absAmount = Math.abs(Number(txn.amount));
        const isCredit = Number(txn.amount) > 0;

        // Find the bank system account code for this scheme
        const bankAccountCode = await db.orm.public.AccountCode
          .where((a) =>
            and(
              a.schemeId.eq(schemeId),
              a.accountSubType.eq("BANK"),
              a.isSystemAccount.eq(true),
              a.isActive.eq(true),
            ),
          )
          .first();

        const bankLedgerAccountId = bankAccountCode?.id;

        if (bankLedgerAccountId) {
          const journalEntry = await db.orm.public.JournalEntry.create({
            schemeId,
            entryNumber: toVarchar<20>(entryNumber),
            transactionDate: txn.transactionDate,
            description: toVarchar<500>(
              `Auto-match: ${String(txn.description).slice(0, 400)}`,
            ),
            entryType: "STANDARD",
            sourceType: "BANK_IMPORT",
            sourceId: txn.id,
            status: rule.autoPost ? "POSTED" : "DRAFT",
            createdBy: profileId ?? schemeId,
          });

          // Create journal lines: bank account and target account
          if (isCredit) {
            // Money in: debit bank, credit target
            await db.orm.public.JournalLine.create({
              journalEntryId: journalEntry.id,
              accountCodeId: bankLedgerAccountId,
              fundId: rule.targetFundId!,
              debit: toNumeric(absAmount),
              credit: toNumeric(0),
              description: null,
            });
            await db.orm.public.JournalLine.create({
              journalEntryId: journalEntry.id,
              accountCodeId: rule.targetAccountCodeId!,
              fundId: rule.targetFundId!,
              debit: toNumeric(0),
              credit: toNumeric(absAmount),
              description: null,
            });
          } else {
            // Money out: credit bank, debit target
            await db.orm.public.JournalLine.create({
              journalEntryId: journalEntry.id,
              accountCodeId: bankLedgerAccountId,
              fundId: rule.targetFundId!,
              debit: toNumeric(0),
              credit: toNumeric(absAmount),
              description: null,
            });
            await db.orm.public.JournalLine.create({
              journalEntryId: journalEntry.id,
              accountCodeId: rule.targetAccountCodeId!,
              fundId: rule.targetFundId!,
              debit: toNumeric(absAmount),
              credit: toNumeric(0),
              description: null,
            });
          }

          // Allocate the whole transaction to the new entry, then mark it matched.
          await db.orm.public.BankTransactionAllocation.create({
            schemeId,
            bankTransactionId: txn.id,
            journalEntryId: journalEntry.id,
            amount: toNumeric(absAmount),
            createdBy: profileId ?? null,
          });

          // Update the bank transaction
          await db.orm.public.BankTransaction
            .where({ id: txn.id })
            .update({
              reconciliationStatus: "MATCHED",
              matchedJournalEntryId: journalEntry.id,
              matchedAt: toTimestamp(new Date().toISOString()),
              matchingRuleId: rule.id,
            });

          // Update rule match count
          await db.orm.public.MatchingRule
            .where({ id: rule.id })
            .update({
              matchCount: rule.matchCount + 1,
              lastMatchedAt: toTimestamp(new Date().toISOString()),
            });

          results.push({
            transactionId: txn.id,
            ruleName: String(rule.name),
            accountCode: rule.targetAccountCode
              ? `${String(rule.targetAccountCode.code)} — ${String(rule.targetAccountCode.name)}`
              : "—",
            fundName: rule.targetFund ? String(rule.targetFund.name) : "—",
          });
        }

        break; // First matching rule wins
      }
    }
  }

  return { matched: results.length, results };
}

/**
 * Generate the next auto-match journal entry number.
 */
async function getNextMatchEntryNumber(schemeId: string): Promise<string> {
  const existing = await db.orm.public.JournalEntry
    .where((je) =>
      and(
        je.schemeId.eq(schemeId),
        je.sourceType.eq("BANK_IMPORT"),
      ),
    )
    .orderBy((je) => je.createdAt.desc())
    .limit(1)
    .all();

  if (existing.length === 0) return "AM-0001";

  const lastNumber = String(existing[0].entryNumber);
  const match = lastNumber.match(/AM-(\d+)/);
  if (match) {
    return `AM-${String(Number(match[1]) + 1).padStart(4, "0")}`;
  }

  // Count-based fallback
  const count = await db.orm.public.JournalEntry
    .where((je) =>
      and(
        je.schemeId.eq(schemeId),
        je.sourceType.eq("BANK_IMPORT"),
      ),
    )
    .aggregate((a) => ({ n: a.count() })).then((r) => r.n);

  return `AM-${String(Number(count) + 1).padStart(4, "0")}`;
}
