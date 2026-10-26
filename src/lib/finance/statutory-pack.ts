/**
 * Statutory statements pack (server side) for a financial year, per fund:
 * the statement of key financial information (SSMA 2015 s 94(2) approved
 * form), the income and expenditure statement on the fund's accounting
 * basis, the balance sheet, the levy register and arrears at year end, and
 * notes. Adopting it at the AGM stores a locked snapshot.
 */
import { createHash } from "node:crypto";
import { graceText } from "@/lib/jurisdiction/wording";
import { priorYearActualLines } from "./prior-year-actuals";
import { db } from "@/prisma/db";
import { formatAud } from "@/lib/billing/money";
import { and } from "@prisma/orm-postgres/orm-client";
import type { TimestampString, Varchar } from "@prisma/orm-postgres/target/codec-types";
import { toCents } from "@/lib/billing/money";
import { financialYearStart, addDays } from "@/lib/levies/notice-plan";
import { toBasisEntries } from "@/lib/queries/reports";
import { logActivity } from "@/lib/queries/activity-log";
import type { StatutoryRules } from "@/config/statutory";
import { levyIncomeAccountPicker, recognisedIncomeExpense, incomeExpenseTotals, type AccountingBasis, type RecognisedLine } from "./accounting-basis";
import { auditLotCount, auditRequired, keyFinancialInformation, leviesRaisedForYear, unpaidAt, type KeyFinancialInformation } from "./key-financial-information";
import { currentBudgetLines } from "./budgets";
import { getAdoptedPlan, isCapitalWorksFund } from "./capital-works-plans";
import { getSchemeInterestSetting } from "./interest-setting";
import { generalMeetingResolutionProblem } from "./resolutions";
import { LEDGER_STATUSES } from "@/lib/finance/ledger-status";
import { migratedInvoiceEntries } from "./migrated-invoices";
import { livePayments } from "./levy-reversal";

export class StatutoryPackError extends Error {}

const ts = (v: string) => v as unknown as TimestampString<3>;
const varchar = <N extends number>(v: string) => v as unknown as Varchar<N>;
const isoDay = (v: unknown) => String(v ?? "").slice(0, 10);

export interface BalanceSheetLine {
  /** Absent in packs adopted before drill-down was added. */
  accountId?: string;
  accountCode: string;
  accountName: string;
  accountType: "ASSET" | "LIABILITY";
  cents: number;
}

export interface FundPack {
  fundId: string;
  fundName: string;
  fundType: string;
  basis: AccountingBasis;
  keyInformation: KeyFinancialInformation;
  income: RecognisedLine[];
  expenditure: RecognisedLine[];
  comparative: { incomeCents: number; expenseCents: number; surplusCents: number };
  totals: { incomeCents: number; expenseCents: number; surplusCents: number };
  balanceSheet: { assets: BalanceSheetLine[]; liabilities: BalanceSheetLine[]; ownersFundsCents: number };
  levyRegister: { noticeNumber: string; lotNumber: string; dueDate: string; owedCents: number; paidByYearEndCents: number; unpaidAtYearEndCents: number }[];
  arrearsByLot: { lotNumber: string; unpaidCents: number }[];
}

export interface StatutoryPack {
  scheme: { name: string; planNumber: string | null; lots: number };
  financialYear: number;
  start: string;
  end: string;
  generatedAt: string;
  funds: FundPack[];
  notes: string[];
  /** `annualBudgetCents` is the amount tested: the total levies raised for the year (see the pack's AUDIT_THRESHOLD). */
  audit: {
    required: boolean;
    byLots: boolean;
    byBudget: boolean;
    annualBudgetCents: number;
    /** Lots counted for the test (parking and utility lots left out). Absent on packs adopted before 26 Oct 2026. */
    lotsCounted?: number;
    /** Parking and utility lots left out of the count. */
    lotsExcluded?: number;
  };
  /** The building's rule pack the statements were prepared under, and the parts of it they show. */
  rules: {
    rulePack: string;
    keyFinancialInformation: StatutoryRules["KEY_FINANCIAL_INFORMATION"];
    /** Packs adopted before 2026.10.3 stored the threshold without the lot types, label, timing and standard. */
    auditThreshold: Omit<StatutoryRules["AUDIT_THRESHOLD"], "excludedLotTypes" | "excludedLotsLabel" | "timing" | "standard"> &
      Partial<Pick<StatutoryRules["AUDIT_THRESHOLD"], "excludedLotTypes" | "excludedLotsLabel" | "timing" | "standard">>;
  };
  adopted: { meetingId: string; adoptedAt: string; snapshotId: string } | null;
}

/** Start and end (YYYY-MM-DD) of a scheme's financial year that starts in `financialYear`. */
export function financialYearRange(financialYear: number, financialYearEnd: string) {
  const start = financialYearStart(financialYear, financialYearEnd);
  const end = addDays(financialYearStart(financialYear + 1, financialYearEnd), -1);
  return { start, end, dayBefore: addDays(start, -1) };
}

export async function getStatutoryStatementsPack(schemeId: string, financialYear: number): Promise<StatutoryPack> {
  const scheme = await db.orm.public.Scheme.where((s) => s.id.eq(schemeId)).first();
  if (!scheme) throw new StatutoryPackError("Scheme not found.");
  const { start, end, dayBefore } = financialYearRange(financialYear, String(scheme.financialYearEnd ?? "06-30"));
  const prior = financialYearRange(financialYear - 1, String(scheme.financialYearEnd ?? "06-30"));

  const [entries, funds, levyIncomeAccounts, notices, lots, nextBudget, plan, interest, snapshot] = await Promise.all([
    db.orm.public.JournalEntry
      .where((je) => and(je.schemeId.eq(schemeId), je.status.in(LEDGER_STATUSES), je.transactionDate.lte(ts(end))))
      .include("lines", (l) => l.include("accountCode"))
      .limit(50000)
      .all(),
    db.orm.public.Fund.where((f) => and(f.schemeId.eq(schemeId), f.isActive.eq(true))).limit(20).all(),
    db.orm.public.AccountCode.where((a) => and(a.schemeId.eq(schemeId), a.accountSubType.eq("LEVY_INCOME"))).limit(20).all(),
    db.orm.public.LevyNotice
      .where((n) => and(n.schemeId.eq(schemeId), n.status.neq("DRAFT"), n.dueDate.lte(ts(end))))
      .limit(20000)
      .all(),
    db.orm.public.Lot.where((l) => l.schemeId.eq(schemeId)).limit(5000).all(),
    currentBudgetLines(schemeId, financialYear + 1),
    getAdoptedPlan(schemeId),
    getSchemeInterestSetting(schemeId),
    db.orm.public.StatutoryPackSnapshot.where((s) => and(s.schemeId.eq(schemeId), s.financialYear.eq(financialYear))).first(),
  ]);
  // The building's rule pack (from the interest setting, which reads the building).
  const { rules, label: rulePack } = interest.rules;
  const { AUDIT_THRESHOLD, CAPITAL_WORKS_PLAN, KEY_FINANCIAL_INFORMATION, STATUTORY_INTEREST } = rules;
  const payments = notices.length
    ? livePayments(await db.orm.public.LevyPayment.where((p) => p.levyNoticeId.in(notices.map((n) => n.id))).limit(100000).all(), end)
    : [];
  const accountIds = [...new Set(nextBudget.map((b) => b.accountCodeId))];
  const budgetAccounts = accountIds.length ? await db.orm.public.AccountCode.where((a) => a.id.in(accountIds)).limit(500).all() : [];

  const basisEntries = toBasisEntries(entries);
  const migratedInvoices = await migratedInvoiceEntries(schemeId);
  const priorYear = await priorYearActualLines(schemeId, prior.start, prior.end);
  const basisForFund = (fid: string) => (funds.find((f) => f.id === fid)?.accountingBasis === "ACCRUAL" ? "ACCRUAL" : "CASH") as AccountingBasis;
  const levyIncomeAccount = levyIncomeAccountPicker(levyIncomeAccounts);
  const lotNumber = (lotId: string) => String(lots.find((l) => l.id === lotId)?.lotNumber ?? "?");

  const fundPacks: FundPack[] = funds.map((f) => {
    const onlyFund = basisEntries.map((e) => ({ ...e, lines: e.lines.filter((l) => l.fundId === f.id) }));
    const extraInvoices = migratedInvoices.map((e) => ({ ...e, lines: e.lines.filter((l) => l.fundId === f.id) }));
    const recognised = recognisedIncomeExpense({ entries: onlyFund, start, end, basisForFund, levyIncomeAccount, extraInvoices });
    // Plus last year's actuals entered at onboarding (comparatives only, never posted).
    const comparative = incomeExpenseTotals([
      ...recognisedIncomeExpense({ entries: onlyFund, start: prior.start, end: prior.end, basisForFund, levyIncomeAccount, extraInvoices }),
      ...priorYear.filter((l) => l.fundId === f.id).map((l) => ({ ...l, accountSubType: null })),
    ]);

    const fundNotices = notices.filter((n) => n.fundId === f.id);
    const unpaidInput = fundNotices.map((n) => ({
      dueDate: isoDay(n.dueDate),
      owedCents: toCents(String(n.amountDue)) + toCents(String(n.interestCharged ?? 0)),
      payments: payments.filter((p) => p.levyNoticeId === n.id).map((p) => ({ date: isoDay(p.paymentDate), amountCents: toCents(String(p.amount)) })),
    }));

    const nextItems = [
      ...nextBudget
        .filter((b) => b.fundId === f.id)
        .map((b) => ({ b, a: budgetAccounts.find((a) => a.id === b.accountCodeId) }))
        .filter((x) => x.a?.accountType === "EXPENSE")
        .map((x) => ({ description: String(x.a!.name), amountCents: toCents(String(x.b.budgetAmount)) })),
      ...(isCapitalWorksFund(f.fundType) && plan
        ? (plan.items ?? []).filter((i) => i.plannedYear === financialYear + 1).map((i) => ({ description: i.description, amountCents: toCents(String(i.estimatedCost)) }))
        : []),
    ];

    const keyInformation = keyFinancialInformation({
      // Every fund's lines: money moved between the funds in the bank is
      // recognised from both sides (the function picks this fund's lines).
      entries: basisEntries,
      fundId: f.id,
      start,
      end,
      dayBefore,
      recognised,
      unpaidNotices: unpaidInput,
      principalItemsNextPeriod: nextItems,
    });

    // Balance sheet at year end: assets and liabilities by account.
    const bs = new Map<string, BalanceSheetLine>();
    for (const e of onlyFund) {
      if (e.date > end) continue;
      for (const l of e.lines) {
        if (l.accountType !== "ASSET" && l.accountType !== "LIABILITY") continue;
        const row = bs.get(l.accountId) ?? { accountId: l.accountId, accountCode: l.accountCode, accountName: l.accountName, accountType: l.accountType, cents: 0 };
        row.cents += l.accountType === "ASSET" ? l.debitCents - l.creditCents : l.creditCents - l.debitCents;
        bs.set(l.accountId, row);
      }
    }
    const bsLines = [...bs.values()].filter((r) => r.cents !== 0).sort((a, b) => a.accountCode.localeCompare(b.accountCode));
    const assets = bsLines.filter((r) => r.accountType === "ASSET");
    const liabilities = bsLines.filter((r) => r.accountType === "LIABILITY");

    const register = fundNotices
      .filter((n) => isoDay(n.dueDate) >= start)
      .map((n) => {
        const u = unpaidInput[fundNotices.indexOf(n)];
        const paid = u.payments.filter((p) => p.date <= end).reduce((s, p) => s + p.amountCents, 0);
        return {
          noticeNumber: String(n.noticeNumber),
          lotNumber: lotNumber(n.lotId),
          dueDate: isoDay(n.dueDate),
          owedCents: u.owedCents,
          paidByYearEndCents: Math.min(paid, u.owedCents),
          unpaidAtYearEndCents: Math.max(0, u.owedCents - paid),
        };
      })
      .sort((a, b) => a.lotNumber.localeCompare(b.lotNumber, "en-AU", { numeric: true }) || a.dueDate.localeCompare(b.dueDate));

    const byLot = new Map<string, number>();
    fundNotices.forEach((n, i) => byLot.set(n.lotId, (byLot.get(n.lotId) ?? 0) + unpaidAt([unpaidInput[i]], end)));
    const arrearsByLot = [...byLot.entries()]
      .filter(([, c]) => c > 0)
      .map(([lotId, c]) => ({ lotNumber: lotNumber(lotId), unpaidCents: c }))
      .sort((a, b) => a.lotNumber.localeCompare(b.lotNumber, "en-AU", { numeric: true }));

    return {
      fundId: f.id,
      fundName: String(f.name),
      fundType: f.fundType,
      basis: basisForFund(f.id),
      keyInformation,
      income: recognised.filter((r) => r.accountType === "INCOME"),
      expenditure: recognised.filter((r) => r.accountType === "EXPENSE"),
      comparative,
      totals: incomeExpenseTotals(recognised),
      balanceSheet: {
        assets,
        liabilities,
        ownersFundsCents: assets.reduce((s, r) => s + r.cents, 0) - liabilities.reduce((s, r) => s + r.cents, 0),
      },
      levyRegister: register,
      arrearsByLot,
    };
  });

  // The audit test: total levies raised for the year (the pack's AUDIT_THRESHOLD).
  const schedules = await db.orm.public.LevySchedule.where((x) => and(x.schemeId.eq(schemeId), x.financialYear.eq(financialYear))).limit(500).all();
  const raised = leviesRaisedForYear({
    schedules: schedules.map((x) => ({ fundId: x.fundId, status: String(x.status), budgetAmountCents: toCents(String(x.budgetAmount)) })),
    notices: notices.filter((n) => isoDay(n.dueDate) >= start).map((n) => ({ fundId: n.fundId, amountDueCents: toCents(String(n.amountDue)) })),
  });
  const annualBudgetCents = raised.totalCents;
  // Lots counted for the audit test: parking and utility lots are left out (AUDIT_THRESHOLD).
  const lotCount = auditLotCount({ lots: lots.map((l) => ({ lotType: l.lotType ? String(l.lotType) : null })), totalLots: scheme.totalLots, excludedLotTypes: AUDIT_THRESHOLD.excludedLotTypes });
  const audit = {
    ...auditRequired({ lots: lotCount.counted, leviesRaisedCents: annualBudgetCents, lotsMoreThan: AUDIT_THRESHOLD.lotsMoreThan, leviesRaisedMoreThanCents: AUDIT_THRESHOLD.leviesRaisedMoreThanCents }),
    annualBudgetCents,
    lotsCounted: lotCount.counted,
    lotsExcluded: lotCount.excluded,
  };

  const notes = [
    `The statement of key financial information follows the approved form (${KEY_FINANCIAL_INFORMATION.source}).`,
    ...fundPacks.map(
      (f) =>
        `${f.fundName} is reported on ${f.basis === "CASH" ? "a cash basis: levy contributions when received and expenses when paid" : "an accrual basis: levies when raised and expenses when invoices are approved"}.`,
    ),
    interest.mode === "NO_INTEREST"
      ? `The ${rules.TERMINOLOGY.ownersCorporation} has resolved that contributions bear no interest (${rules.CITATIONS.noInterestResolution}).`
      : `Interest on unpaid contributions is charged at ${STATUTORY_INTEREST.annualRatePercent}% a year simple interest when unpaid ${graceText(STATUTORY_INTEREST)} after the due date (${STATUTORY_INTEREST.source}).`,
    plan
      ? `Capital works fund plan "${plan.title}" was adopted${plan.adoptedAt ? ` on ${isoDay(plan.adoptedAt)}` : ""} and is due for review by ${isoDay(plan.reviewDueAt)} (${CAPITAL_WORKS_PLAN.source}).`
      : "No capital works fund plan has been adopted in StrataVerze.",
    audit.required
      ? `An audit is required (${audit.byLots ? `more than ${AUDIT_THRESHOLD.lotsMoreThan} lots, not counting ${AUDIT_THRESHOLD.excludedLotsLabel}` : `levies raised for the year of ${formatAud(annualBudgetCents)}, more than ${formatAud(AUDIT_THRESHOLD.leviesRaisedMoreThanCents)}`}; ${AUDIT_THRESHOLD.source}). It must be done ${AUDIT_THRESHOLD.timing}, in accordance with ${AUDIT_THRESHOLD.standard}.`
      : `An audit is not required by size, but the annual general meeting must consider whether to have the accounts audited (${AUDIT_THRESHOLD.source}).`,
    "Interest earned is the total of interest income accounts, which include interest charged on overdue levies.",
  ];

  return {
    scheme: { name: String(scheme.name), planNumber: scheme.planNumber ? String(scheme.planNumber) : null, lots: scheme.totalLots },
    financialYear,
    start,
    end,
    generatedAt: new Date().toISOString(),
    funds: fundPacks,
    notes,
    audit,
    rules: { rulePack, keyFinancialInformation: KEY_FINANCIAL_INFORMATION, auditThreshold: AUDIT_THRESHOLD },
    adopted: snapshot ? { meetingId: snapshot.meetingId, adoptedAt: String(snapshot.adoptedAt), snapshotId: snapshot.id } : null,
  };
}

/**
 * Adopt the pack at the AGM: store a locked snapshot (with a hash of its
 * content) and a financial document linked to the meeting.
 */
export async function adoptStatutoryPack(input: { schemeId: string; financialYear: number; meetingId: string; motionId: string; actorId: string }) {
  const meeting = await db.orm.public.Meeting.where((m) => m.id.eq(input.meetingId)).first();
  if (!meeting || meeting.schemeId !== input.schemeId || !["AGM", "FIRST_AGM"].includes(meeting.meetingType)) {
    throw new StatutoryPackError("Choose the annual general meeting the statements were presented at.");
  }
  const problem = await generalMeetingResolutionProblem(input.schemeId, input.meetingId, input.motionId, ["AGM", "FIRST_AGM"]);
  if (problem) throw new StatutoryPackError(problem);
  const existing = await db.orm.public.StatutoryPackSnapshot.where((s) => and(s.schemeId.eq(input.schemeId), s.financialYear.eq(input.financialYear))).first();
  if (existing) throw new StatutoryPackError("The statements for this year have already been adopted and are locked.");

  const pack = await getStatutoryStatementsPack(input.schemeId, input.financialYear);
  const content = JSON.stringify({ ...pack, adopted: null });
  const hash = createHash("sha256").update(content).digest("hex");
  const snapshot = await db.orm.public.StatutoryPackSnapshot.create({
    schemeId: input.schemeId,
    financialYear: input.financialYear,
    meetingId: input.meetingId,
    motionId: input.motionId,
    content,
    contentHash: hash,
    financialDocumentId: null,
    adoptedBy: input.actorId,
  });
  const doc = await db.orm.public.FinancialDocument.create({
    schemeId: input.schemeId,
    documentType: "STATUTORY_PACK",
    uploadedBy: input.actorId,
    fileName: varchar<500>(`statutory-statements-FY${input.financialYear}.json`),
    fileUrl: `/api/finance/statutory-pack/${snapshot.id}`,
    fileSize: Buffer.byteLength(content, "utf8"),
    mimeType: varchar<100>("application/json"),
    meetingId: input.meetingId,
    documentDate: ts(pack.end),
    documentStatus: "VERIFIED",
    verificationStatus: "MATCHED",
    reviewNotes: `Adopted at ${String(meeting.title)}. SHA-256 ${hash}.`,
  });
  await db.orm.public.StatutoryPackSnapshot.where((s) => s.id.eq(snapshot.id)).update({ financialDocumentId: doc.id });
  await logActivity({
    schemeId: input.schemeId,
    actorId: input.actorId,
    action: "STATUTORY_PACK_ADOPTED",
    entityType: "StatutoryPack",
    entityId: snapshot.id,
    metadata: { financialYear: input.financialYear, meetingId: input.meetingId, hash },
  });
  return snapshot;
}
