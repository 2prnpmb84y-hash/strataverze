/**
 * Capital works fund plans (server side): preparing a plan, adopting it at a
 * general meeting, the review reminder in the compliance register, and the
 * capital works levy schedule generated from the adopted plan.
 */
import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";
import type { Numeric, TimestampString } from "@prisma/orm-postgres/target/codec-types";
import { fromCents, toCents } from "@/lib/billing/money";
import { logActivity } from "@/lib/queries/activity-log";
import { createLevySchedule } from "@/lib/queries/levy-schedules";
import { rulesForScheme } from "@/lib/jurisdiction/scheme-rules";
import {
  CONTRIBUTION_METHOD_LABELS,
  planAdoptionProblem,
  requiredAnnualContribution,
  reviewDueDate,
  type ContributionMethod,
} from "./capital-works-plan";
import { generalMeetingResolutionProblem } from "./resolutions";

export class CapitalWorksPlanError extends Error {}

const num = (cents: number) => String(fromCents(cents)) as unknown as Numeric<12, 2>;
const ts = (v: string) => v as unknown as TimestampString<3>;
const isoDay = (v: unknown) => String(v ?? "").slice(0, 10);
export const isCapitalWorksFund = (fundType: string) => fundType === "CAPITAL_WORKS" || fundType === "SINKING";

export async function getPlans(schemeId: string) {
  return db.orm.public.CapitalWorksPlan.where((p) => p.schemeId.eq(schemeId)).include("items").orderBy((p) => p.createdAt.desc()).limit(50).all();
}

export async function getAdoptedPlan(schemeId: string) {
  return db.orm.public.CapitalWorksPlan.where((p) => and(p.schemeId.eq(schemeId), p.status.eq("ADOPTED"))).include("items").first();
}

async function loadPlan(schemeId: string, planId: string) {
  const plan = await db.orm.public.CapitalWorksPlan.where((p) => p.id.eq(planId)).include("items").first();
  if (!plan || plan.schemeId !== schemeId) throw new CapitalWorksPlanError("Capital works plan not found.");
  return plan;
}

const itemsOf = (plan: { items?: { plannedYear: number; estimatedCost: unknown }[] }) =>
  (plan.items ?? []).map((i) => ({ plannedYear: i.plannedYear, estimatedCostCents: toCents(String(i.estimatedCost)) }));

/** The building's capital works plan rule (throws for a state with no rule pack). */
async function capitalWorksRule(schemeId: string) {
  return (await rulesForScheme(schemeId)).rules.CAPITAL_WORKS_PLAN;
}

/** Work out and store the yearly contribution the plan needs. */
async function recompute(planId: string) {
  const plan = await db.orm.public.CapitalWorksPlan.where((p) => p.id.eq(planId)).include("items").first();
  if (!plan) return;
  const rule = await capitalWorksRule(plan.schemeId);
  const cents = requiredAnnualContribution({
    items: itemsOf(plan),
    startYear: plan.periodStartYear,
    openingBalanceCents: toCents(String(plan.openingBalance)),
    method: plan.contributionMethod as ContributionMethod,
    years: rule.horizonYears,
  });
  await db.orm.public.CapitalWorksPlan.where((p) => p.id.eq(planId)).update({ annualContribution: num(cents) });
}

export async function createPlan(input: {
  schemeId: string;
  title: string;
  preparedBy: string | null;
  preparedAt: string;
  periodStartYear: number;
  openingBalanceCents: number;
  method: ContributionMethod;
  actorId: string;
}) {
  if (!input.title.trim()) throw new CapitalWorksPlanError("Give the plan a title.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.preparedAt)) throw new CapitalWorksPlanError("Enter the date the plan was prepared.");
  if (!(input.periodStartYear >= 2000 && input.periodStartYear <= 2100)) throw new CapitalWorksPlanError("Enter the first financial year of the plan.");
  const rule = await capitalWorksRule(input.schemeId);
  const plan = await db.orm.public.CapitalWorksPlan.create({
    schemeId: input.schemeId,
    title: input.title.trim(),
    preparedBy: input.preparedBy?.trim() || null,
    preparedAt: ts(input.preparedAt),
    periodStartYear: input.periodStartYear,
    reviewDueAt: ts(reviewDueDate(input.preparedAt, rule.reviewEveryYears)),
    openingBalance: num(input.openingBalanceCents),
    contributionMethod: input.method,
    annualContribution: null,
    status: "DRAFT",
    adoptedMeetingId: null,
    adoptedMotionId: null,
    adoptedAt: null,
    complianceItemId: null,
    createdBy: input.actorId,
  });
  await logActivity({ schemeId: input.schemeId, actorId: input.actorId, action: "CAPITAL_WORKS_PLAN_CREATED", entityType: "CapitalWorksPlan", entityId: plan.id, metadata: { title: plan.title } });
  return plan;
}

/** Start a new draft from an existing plan (for the five-yearly review), copying its items. */
export async function copyPlanForReview(schemeId: string, planId: string, preparedAt: string, actorId: string) {
  const plan = await loadPlan(schemeId, planId);
  const startYear = Number(preparedAt.slice(5, 7)) >= 7 ? Number(preparedAt.slice(0, 4)) : Number(preparedAt.slice(0, 4)) - 1;
  const draft = await createPlan({
    schemeId,
    title: `${plan.title} (review ${preparedAt.slice(0, 4)})`,
    preparedBy: plan.preparedBy,
    preparedAt,
    periodStartYear: startYear,
    openingBalanceCents: toCents(String(plan.openingBalance)),
    method: plan.contributionMethod as ContributionMethod,
    actorId,
  });
  for (const i of plan.items ?? []) {
    if (i.plannedYear < startYear) continue;
    await db.orm.public.CapitalWorksPlanItem.create({
      planId: draft.id,
      description: i.description,
      component: i.component,
      plannedYear: i.plannedYear,
      estimatedCost: i.estimatedCost,
      fundingSource: i.fundingSource,
      notes: i.notes,
    });
  }
  await recompute(draft.id);
  return draft;
}

function assertDraft(plan: { status: string }) {
  if (plan.status !== "DRAFT") throw new CapitalWorksPlanError("An adopted plan cannot be changed. Start a review to prepare a new version.");
}

export async function updatePlanSettings(schemeId: string, planId: string, input: { openingBalanceCents: number; method: ContributionMethod }, actorId: string) {
  const plan = await loadPlan(schemeId, planId);
  assertDraft(plan);
  await db.orm.public.CapitalWorksPlan.where((p) => p.id.eq(planId)).update({ openingBalance: num(input.openingBalanceCents), contributionMethod: input.method });
  await recompute(planId);
  await logActivity({ schemeId, actorId, action: "CAPITAL_WORKS_PLAN_UPDATED", entityType: "CapitalWorksPlan", entityId: planId, metadata: { ...input } });
}

export async function addPlanItem(
  schemeId: string,
  planId: string,
  item: { description: string; component: string | null; plannedYear: number; estimatedCostCents: number; notes: string | null },
  actorId: string,
) {
  const plan = await loadPlan(schemeId, planId);
  assertDraft(plan);
  if (!item.description.trim()) throw new CapitalWorksPlanError("Describe the work.");
  const rule = await capitalWorksRule(schemeId);
  const last = plan.periodStartYear + rule.horizonYears - 1;
  if (item.plannedYear < plan.periodStartYear || item.plannedYear > last) {
    throw new CapitalWorksPlanError(`Choose a year from FY ${plan.periodStartYear} to FY ${last}.`);
  }
  if (!(item.estimatedCostCents >= 0)) throw new CapitalWorksPlanError("Enter the estimated cost.");
  await db.orm.public.CapitalWorksPlanItem.create({
    planId,
    description: item.description.trim(),
    component: item.component?.trim() || null,
    plannedYear: item.plannedYear,
    estimatedCost: num(item.estimatedCostCents),
    fundingSource: "CAPITAL_WORKS_FUND",
    notes: item.notes?.trim() || null,
  });
  await recompute(planId);
  await logActivity({ schemeId, actorId, action: "CAPITAL_WORKS_PLAN_UPDATED", entityType: "CapitalWorksPlan", entityId: planId, metadata: { added: item.description } });
}

export async function removePlanItem(schemeId: string, planId: string, itemId: string, actorId: string) {
  const plan = await loadPlan(schemeId, planId);
  assertDraft(plan);
  if (!(plan.items ?? []).some((i) => i.id === itemId)) throw new CapitalWorksPlanError("Item not found.");
  await db.orm.public.CapitalWorksPlanItem.where((i) => i.id.eq(itemId)).delete();
  await recompute(planId);
  await logActivity({ schemeId, actorId, action: "CAPITAL_WORKS_PLAN_UPDATED", entityType: "CapitalWorksPlan", entityId: planId, metadata: { removed: itemId } });
}

/**
 * Adopt the plan at a general meeting. Any earlier adopted plan is superseded,
 * and the five-yearly review goes into the compliance register.
 */
export async function adoptPlan(schemeId: string, planId: string, meetingId: string | null, motionId: string | null, actorId: string) {
  const plan = await loadPlan(schemeId, planId);
  const rule = await capitalWorksRule(schemeId);
  const problem =
    planAdoptionProblem({ status: plan.status, items: itemsOf(plan), startYear: plan.periodStartYear, horizonYears: rule.horizonYears, meetingId, motionId }) ??
    (await generalMeetingResolutionProblem(schemeId, meetingId, motionId));
  if (problem) throw new CapitalWorksPlanError(problem);
  await recompute(planId);

  const due = isoDay(plan.reviewDueAt);
  const compliance = await db.orm.public.ComplianceItem.create({
    schemeId,
    title: "Review the capital works fund plan",
    description: `The capital works fund plan "${plan.title}" must be reviewed at least every ${rule.reviewEveryYears} years (${rule.source}).`,
    category: "OTHER",
    dueDate: ts(`${due}T00:00:00+10:00`),
    status: "PENDING",
    lastChecked: null,
    notes: `capital-works-plan:${plan.id}`,
  });

  await db.transaction(async (tx) => {
    await tx.orm.public.CapitalWorksPlan.where((p) => and(p.schemeId.eq(schemeId), p.status.eq("ADOPTED"))).updateAndCount({ status: "SUPERSEDED" });
    await tx.orm.public.CapitalWorksPlan.where((p) => p.id.eq(planId)).update({
      status: "ADOPTED",
      adoptedMeetingId: meetingId,
      adoptedMotionId: motionId,
      adoptedAt: ts(new Date().toISOString()),
      complianceItemId: compliance.id,
    });
  });
  await logActivity({ schemeId, actorId, action: "CAPITAL_WORKS_PLAN_ADOPTED", entityType: "CapitalWorksPlan", entityId: planId, metadata: { meetingId, motionId, reviewDue: due } });
}

/**
 * A draft capital works levy schedule for a financial year from the adopted
 * plan: the plan's yearly contribution, with the method recorded. It still
 * needs the owners corporation's approval and an adopted budget.
 */
export async function generateLevyFromPlan(input: { schemeId: string; financialYear: number; frequency: string; actorId: string }) {
  const plan = await getAdoptedPlan(input.schemeId);
  if (!plan) throw new CapitalWorksPlanError("Adopt a capital works fund plan first.");
  const cents = toCents(String(plan.annualContribution ?? 0));
  if (cents <= 0) throw new CapitalWorksPlanError("The adopted plan does not need a contribution this year.");
  const rule = await capitalWorksRule(input.schemeId);
  const last = plan.periodStartYear + rule.horizonYears - 1;
  if (input.financialYear < plan.periodStartYear || input.financialYear > last) {
    throw new CapitalWorksPlanError(`FY ${input.financialYear} is outside the adopted plan (FY ${plan.periodStartYear} to FY ${last}).`);
  }
  const [funds, scheme] = await Promise.all([
    db.orm.public.Fund.where((f) => f.schemeId.eq(input.schemeId)).limit(20).all(),
    db.orm.public.Scheme.where((s) => s.id.eq(input.schemeId)).first(),
  ]);
  const fund = funds.find((f) => isCapitalWorksFund(f.fundType) && f.isActive);
  if (!fund || !scheme) throw new CapitalWorksPlanError("The scheme has no capital works fund.");
  const method = plan.contributionMethod as ContributionMethod;
  const schedule = await createLevySchedule({
    schemeId: input.schemeId,
    fundId: fund.id,
    financialYear: input.financialYear,
    budgetAmount: fromCents(cents),
    frequency: input.frequency,
    totalLots: scheme.totalLots,
    totalEntitlement: Number(scheme.totalEntitlement),
    levyType: "ORDINARY",
    title: `Capital works contribution FY ${input.financialYear}`,
    description: `From the adopted capital works fund plan "${plan.title}". Method: ${CONTRIBUTION_METHOD_LABELS[method]}.`,
    capitalWorksPlanId: plan.id,
  });
  await logActivity({
    schemeId: input.schemeId,
    actorId: input.actorId,
    action: "CAPITAL_WORKS_LEVY_GENERATED",
    entityType: "LevySchedule",
    entityId: schedule.id,
    metadata: { planId: plan.id, amount: fromCents(cents), method },
  });
  return schedule;
}
