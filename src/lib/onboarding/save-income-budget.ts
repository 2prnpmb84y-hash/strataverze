/**
 * Onboarding: load and save last year's income and expenditure, this year's
 * budget and the year's levy schedules (server side, 24 Oct).
 *
 * The takeover date and each fund's balance at takeover come from the
 * building's cutover: the executed one, else the onboarding draft, else the
 * latest draft with opening balances staged. Nothing here posts to the
 * ledger. Saving again replaces what onboarding saved before, as long as the
 * budget was not adopted at a meeting held in StrataVerze and no levy notices
 * have been raised from the schedule.
 */
import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";
import type { Numeric, TimestampString, Varchar } from "@prisma/orm-postgres/target/codec-types";
import { getCutoverView, listCutovers, ONBOARDING_SOURCE, sourceSystemLabel } from "@/lib/finance/migration-batches";
import { workingBudgets } from "@/lib/finance/budget-status";
import { logActivity } from "@/lib/queries/activity-log";
import { toIsoDay } from "@/lib/levies/notice-plan";
import {
  checkIncomeBudget,
  codePrefix,
  nextAccountCodes,
  onboardingYears,
  type ContextFund,
  type FundIncomeBudgetInput,
  type FundKind,
  type IncomeBudgetCheck,
  type IncomeBudgetContext,
  type IncomeBudgetInput,
  type LineType,
  type OnboardingLevyFrequency,
} from "./income-budget";
import { formatMoney } from "./property-onboarding";

export class IncomeBudgetError extends Error {}

const num = (cents: number) => (cents / 100).toFixed(2) as unknown as Numeric<12, 2>;
const ts = (v: string) => v as unknown as TimestampString<3>;
const vc = <N extends number>(v: string) => v as unknown as Varchar<N>;
const centsOf = (v: unknown) => Math.round(Number(v ?? 0) * 100);

export interface IncomeBudgetLocks {
  /** By fund id: why the budget cannot be changed here. */
  budget: Record<string, string>;
  /** By fund id: why the levy schedule cannot be changed here. */
  levies: Record<string, string>;
}

export interface IncomeBudgetPageData {
  ctx: IncomeBudgetContext;
  cutover: { id: string; label: string; status: string };
  /** What onboarding (or the Budget page) saved before, to fill the form. */
  saved: IncomeBudgetInput;
  locks: IncomeBudgetLocks;
  lotCount: number;
  totalEntitlement: number;
}

/** The cutover the onboarding figures reconcile with. */
async function takeoverCutover(schemeId: string) {
  const batches = await listCutovers(schemeId);
  const withOpening = batches.filter((b) => (b.files as Record<string, unknown> | null)?.opening_balances && b.cutoverDate);
  return (
    withOpening.find((b) => b.status === "EXECUTED") ??
    withOpening.find((b) => b.sourceSystem === ONBOARDING_SOURCE.value) ??
    withOpening.find((b) => b.status !== "DISCARDED") ??
    null
  );
}

export async function loadIncomeBudget(schemeId: string): Promise<IncomeBudgetPageData | { problem: string }> {
  const scheme = await db.orm.public.Scheme.where((s) => s.id.eq(schemeId)).first();
  if (!scheme) return { problem: "Building not found." };
  const batch = await takeoverCutover(schemeId);
  if (!batch) {
    return { problem: "Enter the building's opening balances first. Last year's figures are reconciled with them, and the takeover date sets the years." };
  }
  const view = await getCutoverView(schemeId, batch.id);
  const takeoverDate = view.cutoverDate!;
  const years = onboardingYears(takeoverDate, String(scheme.financialYearEnd ?? "06-30"));

  const [funds, accounts, actuals, budgets, schedules, lots] = await Promise.all([
    db.orm.public.Fund.where((f) => and(f.schemeId.eq(schemeId), f.isActive.eq(true))).limit(20).all(),
    db.orm.public.AccountCode.where((a) => a.schemeId.eq(schemeId)).limit(5000).all(),
    db.orm.public.PriorYearActual.where((p) => and(p.schemeId.eq(schemeId), p.financialYear.eq(years.lastYear.financialYear))).limit(2000).all(),
    db.orm.public.Budget.where((b) => and(b.schemeId.eq(schemeId), b.financialYear.eq(years.budgetYear.financialYear))).limit(100).all(),
    db.orm.public.LevySchedule.where((l) => and(l.schemeId.eq(schemeId), l.financialYear.eq(years.budgetYear.financialYear), l.levyType.eq("ORDINARY"))).limit(100).all(),
    db.orm.public.Lot.where((l) => l.schemeId.eq(schemeId)).limit(5000).all(),
  ]);

  // Each fund's balance at takeover: its equity lines in the opening balances.
  const equity = new Map<string, number>();
  for (const r of view.evaluation.rows.opening_balances ?? []) {
    if (!r.value || r.value.accountType !== "EQUITY") continue;
    equity.set(r.value.fundId, (equity.get(r.value.fundId) ?? 0) + r.value.creditCents - r.value.debitCents);
  }

  const working = workingBudgets(budgets);
  const lines = working.length ? await db.orm.public.BudgetLine.where((l) => l.budgetId.in(working.map((b) => b.id))).limit(2000).all() : [];

  // A fund's accounts: its own and the shared ones (no fund), active, plus any
  // account its saved figures already use, so nothing saved is hidden.
  const ctxFunds: ContextFund[] = funds
    .filter((f) => f.fundType === "ADMINISTRATIVE" || f.fundType === "CAPITAL_WORKS")
    .sort((a, b) => (a.fundType === "ADMINISTRATIVE" ? -1 : 1) - (b.fundType === "ADMINISTRATIVE" ? -1 : 1))
    .map((f) => {
      const used = new Set([...actuals.filter((x) => x.fundId === f.id).map((x) => x.accountCodeId), ...lines.filter((x) => x.fundId === f.id).map((x) => x.accountCodeId)]);
      const usable = accounts.filter(
        (a) => (a.accountType === "INCOME" || a.accountType === "EXPENSE") && (used.has(a.id) || (a.isActive && (a.fundId === f.id || a.fundId === null))),
      );
      const levy = usable.find((a) => a.accountSubType === "LEVY_INCOME" && a.fundId === f.id) ?? usable.find((a) => a.accountSubType === "LEVY_INCOME" && a.fundId === null);
      return {
        id: f.id,
        name: String(f.name),
        fundType: f.fundType as FundKind,
        balanceAtTakeoverCents: equity.has(f.id) ? equity.get(f.id)! : null,
        levyIncomeAccountId: levy?.id ?? null,
        accounts: usable
          .map((a) => ({ id: a.id, code: String(a.code), name: String(a.name), accountType: a.accountType as LineType }))
          .sort((a, b) => a.code.localeCompare(b.code)),
      };
    });
  const liveSchedules = schedules.filter((s) => s.status !== "SUPERSEDED");
  const noticeCounts = new Map<string, number>();
  if (liveSchedules.length) {
    const notices = await db.orm.public.LevyNotice.where((n) => n.levyScheduleId.in(liveSchedules.map((s) => s.id))).limit(20000).all();
    for (const n of notices) noticeCounts.set(String(n.levyScheduleId), (noticeCounts.get(String(n.levyScheduleId)) ?? 0) + 1);
  }

  const locks: IncomeBudgetLocks = { budget: {}, levies: {} };
  const savedFunds: FundIncomeBudgetInput[] = ctxFunds.map((f) => {
    const b = working.find((x) => x.fundId === f.id);
    if (budgets.some((x) => x.fundId === f.id && x.status === "ADOPTED" && !x.adoptedBeforeTakeoverOn)) {
      locks.budget[f.id] = `The ${f.name} budget was adopted at a general meeting held in StrataVerze. Change it on the Budget page.`;
    }
    if (liveSchedules.some((x) => x.fundId === f.id && (x.status === "ACTIVE" || (noticeCounts.get(x.id) ?? 0) > 0))) {
      locks.levies[f.id] = `Levy notices have been raised for the ${f.name} this year. Change the levies on the Levies page.`;
    }
    const byAccount = new Map<string, { actual: number; budget: number | null }>();
    for (const a of actuals.filter((x) => x.fundId === f.id)) byAccount.set(a.accountCodeId, { actual: centsOf(a.amount), budget: null });
    for (const l of lines.filter((x) => b && x.budgetId === b.id)) {
      const cur = byAccount.get(l.accountCodeId) ?? { actual: 0, budget: null };
      cur.budget = centsOf(l.budgetAmount);
      byAccount.set(l.accountCodeId, cur);
    }
    const rows = [...byAccount.entries()]
      .map(([accountId, v]) => ({ account: f.accounts.find((a) => a.id === accountId), v }))
      .filter((x) => x.account)
      .sort((a, b) => a.account!.code.localeCompare(b.account!.code))
      .map(({ account, v }) => ({
        accountId: account!.id,
        newAccountName: "",
        accountType: account!.accountType,
        actual: v.actual ? (v.actual / 100).toFixed(2) : "",
        budget: v.budget !== null ? (v.budget / 100).toFixed(2) : "",
      }));
    // Saved figures reconciled, so last year's opening balance follows from them.
    const fundActuals = actuals.filter((x) => x.fundId === f.id);
    let openingBalance = "";
    if (fundActuals.length && years.takeoverAtYearEnd && f.balanceAtTakeoverCents !== null) {
      const typeOf = (id: string) => f.accounts.find((a) => a.id === id)?.accountType;
      const net = fundActuals.reduce((s, a) => s + (typeOf(a.accountCodeId) === "INCOME" ? 1 : -1) * centsOf(a.amount), 0);
      openingBalance = ((f.balanceAtTakeoverCents - net) / 100).toFixed(2);
    }
    return { fundId: f.id, openingBalance, rows };
  });

  const adoptedBefore = working.find((b) => b.adoptedBeforeTakeoverOn);
  const anyDraft = working.some((b) => b.status === "DRAFT" || b.status === "PROPOSED");
  const firstSchedule = liveSchedules[0];
  const saved: IncomeBudgetInput = {
    funds: savedFunds,
    adoption: adoptedBefore
      ? { kind: "before_takeover", meetingDate: toIsoDay(adoptedBefore.adoptedBeforeTakeoverOn) }
      : { kind: anyDraft ? "draft" : "before_takeover", meetingDate: "" },
    levies: {
      frequency: firstSchedule ? String(firstSchedule.frequency) : "QUARTERLY",
      // A schedule was made only when none of the year's notices had been raised.
      raisedBeforeTakeover: liveSchedules.length ? "none" : "",
    },
  };

  return {
    ctx: { takeoverDate, years, funds: ctxFunds },
    cutover: { id: batch.id, label: sourceSystemLabel(batch.sourceSystem), status: batch.status },
    saved,
    locks,
    lotCount: lots.length,
    totalEntitlement: lots.reduce((s, l) => s + Number(l.entitlement), 0),
  };
}

export interface SaveIncomeBudgetResult {
  check: IncomeBudgetCheck;
  saved: boolean;
}

/** Check and save. Nothing is saved unless every check passes. */
export async function saveIncomeBudget(schemeId: string, actorId: string, input: IncomeBudgetInput): Promise<SaveIncomeBudgetResult> {
  const data = await loadIncomeBudget(schemeId);
  if ("problem" in data) throw new IncomeBudgetError(data.problem);
  const { ctx, locks } = data;
  const check = checkIncomeBudget(input, ctx);
  for (const f of ctx.funds) {
    if (locks.budget[f.id]) check.fundProblems[f.id].push(locks.budget[f.id]);
    if (locks.levies[f.id]) check.fundProblems[f.id].push(locks.levies[f.id]);
  }
  if (!check.parsed || Object.values(check.fundProblems).some((l) => l.length)) return { check: { ...check, parsed: null }, saved: false };
  const parsed = check.parsed;
  const { lastYear, budgetYear } = ctx.years;
  const adoption = parsed.adoption;
  const now = new Date().toISOString();

  const summary = await db.transaction(async (tx) => {
    // 1. New accounts, coded after the fund's existing ones.
    const all = await tx.orm.public.AccountCode.where((a) => a.schemeId.eq(schemeId)).limit(5000).all();
    const codes = all.map((a) => String(a.code));
    const created: Array<{ code: string; name: string }> = [];
    const newIds = new Map<string, string>();
    for (const f of parsed.funds) {
      for (const type of ["INCOME", "EXPENSE"] as const) {
        const wanted = f.rows.filter((r) => !r.accountId && r.accountType === type);
        if (!wanted.length) continue;
        const prefix = codePrefix(f.fundType, type);
        const next = nextAccountCodes(codes, prefix, wanted.length);
        if (!next) throw new IncomeBudgetError(`There are no free account codes left in ${prefix}000 to ${prefix}999.`);
        for (const [i, r] of wanted.entries()) {
          const a = await tx.orm.public.AccountCode.create({
            schemeId,
            code: vc<10>(next[i]),
            name: vc<200>(r.newAccountName!),
            accountType: type,
            accountSubType: null,
            fundId: f.fundId,
            isSystemAccount: false,
            isActive: true,
            gstApplicable: false,
            description: "Added at onboarding from the previous manager's statements.",
            parentAccountId: null,
          });
          codes.push(next[i]);
          newIds.set(`${f.fundId}:${r.newAccountName}`, a.id);
          created.push({ code: next[i], name: r.newAccountName! });
        }
      }
    }
    const accountOf = (fundId: string, r: (typeof parsed.funds)[number]["rows"][number]) => r.accountId ?? newIds.get(`${fundId}:${r.newAccountName}`)!;

    // 2. Last year's actuals: replace what onboarding saved for that year.
    await tx.orm.public.PriorYearActual
      // Every year: if the takeover date has changed, the old year's figures go too.
      .where((p) => and(p.schemeId.eq(schemeId), p.source.eq("onboarding")))
      .deleteAndCount();
    const actualRows = parsed.funds.flatMap((f) =>
      f.rows
        .filter((r) => r.actualCents !== 0)
        .map((r) => ({
          schemeId,
          fundId: f.fundId,
          accountCodeId: accountOf(f.fundId, r),
          financialYear: lastYear.financialYear,
          amount: num(r.actualCents),
          source: "onboarding",
          createdBy: actorId,
          createdAt: ts(now),
          updatedAt: ts(now),
        })),
    );
    if (actualRows.length) await tx.orm.public.PriorYearActual.createAll(actualRows);

    // 3. The budget for each fund.
    const budgetsOut: Array<{ fundId: string; budgetId: string; status: string }> = [];
    for (const f of parsed.funds) {
      const versions = await tx.orm.public.Budget.where((b) => and(b.fundId.eq(f.fundId), b.financialYear.eq(budgetYear.financialYear))).limit(100).all();
      let budget = workingBudgets(versions)[0];
      if (versions.some((v) => v.status === "ADOPTED" && !v.adoptedBeforeTakeoverOn)) throw new IncomeBudgetError("A budget was adopted in StrataVerze while you were editing. Reload the page.");
      if (!budget) {
        budget = await tx.orm.public.Budget.create({
          schemeId,
          fundId: f.fundId,
          financialYear: budgetYear.financialYear,
          version: versions.reduce((m, v) => Math.max(m, v.version), 0) + 1,
          status: "DRAFT",
          adoptedMeetingId: null,
          adoptedMotionId: null,
          adoptedAt: null,
          adoptedBy: null,
          adoptedBeforeTakeoverOn: null,
          createdBy: actorId,
        });
      }
      await tx.orm.public.BudgetLine.where((l) => l.budgetId.eq(budget.id)).deleteAndCount();
      const lineRows = f.rows
        .filter((r) => r.budgetCents > 0)
        .map((r) => ({
          fundId: f.fundId,
          accountCodeId: accountOf(f.fundId, r),
          financialYear: budgetYear.financialYear,
          budgetId: budget.id,
          budgetAmount: num(r.budgetCents),
          notes: null,
          createdAt: ts(now),
          updatedAt: ts(now),
        }));
      if (lineRows.length) await tx.orm.public.BudgetLine.createAll(lineRows);
      const status = adoption.kind === "before_takeover" ? "ADOPTED" : "DRAFT";
      // Only one version is adopted: an earlier one recorded at onboarding gives way.
      for (const v of versions.filter((v) => v.id !== budget.id && v.status === "ADOPTED")) {
        await tx.orm.public.Budget.where((b) => b.id.eq(v.id)).update({ status: "SUPERSEDED", updatedAt: ts(now) });
      }
      await tx.orm.public.Budget.where((b) => b.id.eq(budget.id)).update({
        status,
        adoptedMeetingId: null,
        adoptedMotionId: null,
        adoptedAt: adoption.kind === "before_takeover" ? ts(adoption.meetingDate) : null,
        adoptedBy: adoption.kind === "before_takeover" ? actorId : null,
        adoptedBeforeTakeoverOn: adoption.kind === "before_takeover" ? ts(adoption.meetingDate) : null,
        updatedAt: ts(now),
      });
      budgetsOut.push({ fundId: f.fundId, budgetId: budget.id, status });
    }

    // 4. The levy schedule for each fund, from the budget's levy income line.
    const schedulesOut: Array<{ fundId: string; scheduleId: string | null; levyCents: number }> = [];
    for (const f of parsed.levies.makeSchedules ? parsed.funds : []) {
      const all = await tx.orm.public.LevySchedule
        .where((l) => and(l.fundId.eq(f.fundId), l.financialYear.eq(budgetYear.financialYear), l.levyType.eq("ORDINARY")))
        .limit(50)
        .all();
      // Checked again here, in case notices were raised since the page loaded.
      const ids = all.filter((s) => s.status !== "SUPERSEDED").map((s) => s.id);
      const raised = ids.length ? await tx.orm.public.LevyNotice.where((n) => n.levyScheduleId.in(ids)).limit(1).all() : [];
      if (raised.length || all.some((s) => s.status === "ACTIVE")) throw new IncomeBudgetError("Levy notices have been raised for this year since the page was opened. Reload the page.");
      const existing = all.filter((s) => s.status === "DRAFT" || s.status === "APPROVED");
      const keep = existing[0] ?? null;
      for (const extra of existing.slice(1)) {
        await tx.orm.public.LevySchedule.where((l) => l.id.eq(extra.id)).update({ status: "SUPERSEDED" });
      }
      if (f.levyCents === 0) {
        if (keep) await tx.orm.public.LevySchedule.where((l) => l.id.eq(keep.id)).update({ status: "SUPERSEDED" });
        schedulesOut.push({ fundId: f.fundId, scheduleId: null, levyCents: 0 });
        continue;
      }
      const values = {
        budgetAmount: num(f.levyCents),
        frequency: parsed.levies.frequency as OnboardingLevyFrequency,
        totalLots: data.lotCount,
        totalEntitlement: String(data.totalEntitlement) as unknown as Numeric<10, 2>,
        status: adoption.kind === "before_takeover" ? "APPROVED" : "DRAFT",
        approvedAt: adoption.kind === "before_takeover" ? ts(adoption.meetingDate) : null,
        approvedBy: adoption.kind === "before_takeover" ? actorId : null,
      };
      if (keep) {
        await tx.orm.public.LevySchedule.where((l) => l.id.eq(keep.id)).update(values);
        schedulesOut.push({ fundId: f.fundId, scheduleId: keep.id, levyCents: f.levyCents });
      } else {
        const s = await tx.orm.public.LevySchedule.create({
          ...values,
          schemeId,
          fundId: f.fundId,
          financialYear: budgetYear.financialYear,
          levyType: "ORDINARY",
          title: null,
          description: "Set up at onboarding from the budget.",
          dueDate: null,
          capitalWorksPlanId: null,
        });
        schedulesOut.push({ fundId: f.fundId, scheduleId: s.id, levyCents: f.levyCents });
      }
    }
    return { created, budgetsOut, schedulesOut, actualCount: actualRows.length };
  });

  await logActivity({
    schemeId,
    actorId,
    action: "ONBOARDING_INCOME_BUDGET_SAVED",
    entityType: "Scheme",
    entityId: schemeId,
    metadata: {
      lastYear: lastYear.financialYear,
      budgetYear: budgetYear.financialYear,
      actuals: summary.actualCount,
      newAccounts: summary.created,
      adoption: adoption.kind === "before_takeover" ? `adopted ${adoption.meetingDate}` : "draft",
      levies: summary.schedulesOut.map((s) => ({ fundId: s.fundId, amount: formatMoney(s.levyCents) })),
      frequency: parsed.levies.frequency,
    },
  });
  return { check, saved: true };
}
