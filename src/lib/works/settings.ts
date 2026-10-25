/**
 * A building's works settings and preferred contractors (server side,
 * 25 Oct 2026). Callers authorise first: the settings are the committee's
 * (works.settings), the preferred contractors the committee's or the
 * Adviser's (works.preferred).
 */
import { and } from "@prisma/orm-postgres/orm-client";
import type { Numeric, TimestampString, Varchar } from "@prisma/orm-postgres/target/codec-types";
import { db } from "@/prisma/db";
import { DEFAULT_APPROVAL_RULE, isApprovalRule, isWorksTrade, type ApprovalRule } from "@/config/works";

const ts = (v: string) => v as unknown as TimestampString<3>;
const money = (v: number) => v.toFixed(2) as unknown as Numeric<12, 2>;
const trade60 = (v: string) => v as unknown as Varchar<60>;

export interface WorksSettingsView {
  approvalRule: ApprovalRule;
  /** Dollars, or null when not set (no urgent work orders until it is). */
  urgentLimit: number | null;
  adviserMayDecide: boolean;
  adviserLimit: number | null;
  updatedAt: string | null;
}

export async function getWorksSettings(schemeId: string): Promise<WorksSettingsView> {
  const row = await db.orm.public.WorksSettings.where((s) => s.schemeId.eq(schemeId)).first();
  return {
    approvalRule: row && isApprovalRule(row.approvalRule) ? row.approvalRule : DEFAULT_APPROVAL_RULE,
    urgentLimit: row?.urgentLimit != null ? Number(row.urgentLimit) : null,
    adviserMayDecide: !!row?.adviserMayDecide,
    adviserLimit: row?.adviserLimit != null ? Number(row.adviserLimit) : null,
    updatedAt: row?.updatedAt ? String(row.updatedAt) : null,
  };
}

export type SettingsCheck = { ok: true; value: Omit<WorksSettingsView, "updatedAt"> } | { ok: false; fieldErrors: Record<string, string> };

const AMOUNT = /^\d{1,9}(\.\d{1,2})?$/;

/** Check the settings form (pure). Amounts are dollars, blank for none. */
export function checkWorksSettings(raw: Record<string, unknown>): SettingsCheck {
  const fieldErrors: Record<string, string> = {};
  const rule = String(raw.approvalRule ?? "");
  if (!isApprovalRule(rule)) fieldErrors.approvalRule = "Choose how many committee members must agree.";
  const amount = (k: string, label: string) => {
    const v = String(raw[k] ?? "").replace(/[$,\s]/g, "");
    if (!v) return null;
    if (!AMOUNT.test(v)) {
      fieldErrors[k] = `Enter the ${label} in dollars, for example 2000.`;
      return null;
    }
    return Number(v);
  };
  const urgentLimit = amount("urgentLimit", "urgent spending limit");
  const adviserMayDecide = raw.adviserMayDecide === "on" || raw.adviserMayDecide === true;
  const adviserLimit = amount("adviserLimit", "Adviser's limit");
  if (adviserMayDecide && adviserLimit == null && !fieldErrors.adviserLimit) {
    fieldErrors.adviserLimit = "Set the most the Adviser may approve, or leave the delegation off.";
  }
  if (Object.keys(fieldErrors).length) return { ok: false, fieldErrors };
  return { ok: true, value: { approvalRule: rule as ApprovalRule, urgentLimit, adviserMayDecide, adviserLimit: adviserMayDecide ? adviserLimit : null } };
}

/** Save the settings, returning what was before (for the activity log). */
export async function saveWorksSettings(schemeId: string, actorId: string, value: Omit<WorksSettingsView, "updatedAt">) {
  const before = await getWorksSettings(schemeId);
  const data = {
    approvalRule: value.approvalRule,
    urgentLimit: value.urgentLimit == null ? null : money(value.urgentLimit),
    adviserMayDecide: value.adviserMayDecide,
    adviserLimit: value.adviserLimit == null ? null : money(value.adviserLimit),
    updatedById: actorId,
    updatedAt: ts(new Date().toISOString()),
  };
  const updated = await db.orm.public.WorksSettings.where((s) => s.schemeId.eq(schemeId)).updateAndCount(data);
  if (updated === 0) await db.orm.public.WorksSettings.create({ schemeId, ...data });
  return before;
}

// ─── Preferred contractors ─────────────────────────────────────────────────

export interface PreferredContractorRow {
  trade: string;
  contractorBusinessId: string;
  name: string;
  /** False when the contractor is no longer approved: urgent orders cannot go to them. */
  approved: boolean;
}

export async function getPreferredContractors(schemeId: string): Promise<PreferredContractorRow[]> {
  const rows = await db.orm.public.WorksPreferredContractor.where((p) => p.schemeId.eq(schemeId)).limit(200).all();
  if (!rows.length) return [];
  const businesses = await db.orm.public.ContractorBusiness.where((c) => c.id.in(rows.map((r) => r.contractorBusinessId))).limit(200).all();
  return rows
    .map((r) => {
      const b = businesses.find((x) => x.id === r.contractorBusinessId);
      return { trade: String(r.trade), contractorBusinessId: r.contractorBusinessId, name: String(b?.tradingName || b?.companyName || "Unknown contractor"), approved: b?.status === "APPROVED" && !b?.deletedAt };
    })
    .sort((a, b) => a.trade.localeCompare(b.trade));
}

/**
 * Approved contractors, for the preferred contractor choice. Contractors
 * type their own trades for now (the fixed trade list comes with the
 * marketplace, stage 3), so any approved contractor can be chosen;
 * `listsTrade` says whether they typed this one.
 */
export async function approvedContractors(trade?: string) {
  const approved = await db.orm.public.ContractorBusiness.where((c) => and(c.status.eq("APPROVED"), c.deletedAt.isNull())).limit(2000).all();
  const t = (trade ?? "").trim().toLowerCase();
  return approved
    .map((c) => {
      const trades = (c.tradeCategories ?? []).map((x) => String(x).trim()).filter(Boolean);
      return { id: c.id, name: String(c.tradingName || c.companyName), suburb: c.suburb ? String(c.suburb) : null, trades, listsTrade: !!t && trades.some((x) => x.toLowerCase() === t) };
    })
    .sort((a, b) => Number(b.listsTrade) - Number(a.listsTrade) || a.name.localeCompare(b.name));
}

export class PreferredContractorError extends Error {}

/** Set (or replace) the building's preferred contractor for a trade. */
export async function setPreferredContractor(schemeId: string, actorId: string, trade: string, contractorBusinessId: string) {
  if (!isWorksTrade(trade)) throw new PreferredContractorError("Choose a trade from the list.");
  const options = await approvedContractors(trade);
  if (!options.some((o) => o.id === contractorBusinessId)) {
    throw new PreferredContractorError("Choose a contractor approved on StrataVerze.");
  }
  const updated = await db.orm.public.WorksPreferredContractor
    .where((p) => and(p.schemeId.eq(schemeId), p.trade.eq(trade60(trade))))
    .updateAndCount({ contractorBusinessId, createdById: actorId, createdAt: ts(new Date().toISOString()) });
  if (updated === 0) await db.orm.public.WorksPreferredContractor.create({ schemeId, trade: trade60(trade), contractorBusinessId, createdById: actorId });
}

export async function removePreferredContractor(schemeId: string, trade: string): Promise<boolean> {
  const n = await db.orm.public.WorksPreferredContractor.where((p) => and(p.schemeId.eq(schemeId), p.trade.eq(trade60(trade)))).deleteAndCount();
  return n > 0;
}
