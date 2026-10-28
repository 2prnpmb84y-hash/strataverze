import { logError } from "@/lib/log";
import { and } from "@prisma/orm-postgres/orm-client";
import type { Varchar } from "@prisma/orm-postgres/target/codec-types";
import { isUpcomingMeeting } from "@/lib/meetings/lifecycle";
import { defaultTimeZone } from "@/lib/jurisdiction/time-zone";
import { rulesForState } from "@/lib/jurisdiction/scheme-rules";
import { defaultFunds } from "@/lib/jurisdiction/funds";
import { seedDefaultChartOfAccounts } from "./seed-chart-of-accounts";
import { db } from "@/prisma/db";
import { needRule, type StatutoryRules } from "@/config/statutory";
import { planFormatChoiceProblem, regulationModuleChoiceProblem, separateEntitlement } from "@/lib/jurisdiction/building-data";
import { MAX_ENTITLEMENT } from "@/lib/onboarding/property-onboarding";

/**
 * Fetch all schemes managed by a given adviser (by profile ID).
 */
export async function getSchemesForAdviser(profileId: string) {
  return db.orm.public.Scheme
    .include("memberships", (m) =>
      m.where((sm) => sm.profileId.eq(profileId))
        .where((sm) => sm.role.eq("ADVISER"))
        .where((sm) => sm.isActive.eq(true)),
    )
    // The property photo, for the small picture beside each building.
    .include("images", (i) => i.orderBy((img) => img.sortOrder.asc()))
    .orderBy((s) => s.name.asc())
    .all()
    .then((schemes) =>
      schemes.filter((s) => s.memberships.length > 0),
    );
}

/**
 * Fetch all schemes an owner belongs to (by profile ID).
 */
export async function getSchemesForOwner(profileId: string) {
  return db.orm.public.Scheme
    .include("memberships", (m) =>
      m.where((sm) => sm.profileId.eq(profileId))
        .where((sm) => sm.role.eq("OWNER"))
        .where((sm) => sm.isActive.eq(true))
        .include("lot"),
    )
    .include("images", (i) => i.orderBy((img) => img.sortOrder.asc()))
    .orderBy((s) => s.name.asc())
    .all()
    .then((schemes) =>
      schemes.filter((s) => s.memberships.length > 0),
    );
}

/**
 * Fetch all schemes a committee member belongs to (by profile ID).
 */
export async function getSchemesForCommittee(profileId: string) {
  return db.orm.public.Scheme
    .include("memberships", (m) =>
      m.where((sm) => sm.profileId.eq(profileId))
        .where((sm) => sm.role.eq("COMMITTEE"))
        .where((sm) => sm.isActive.eq(true)),
    )
    .orderBy((s) => s.name.asc())
    .all()
    .then((schemes) =>
      schemes.filter((s) => s.memberships.length > 0),
    );
}

/**
 * Fetch all schemes an external accountant has read-only access to.
 */
export async function getSchemesForAccountant(profileId: string) {
  return db.orm.public.Scheme
    .include("memberships", (m) =>
      m.where((sm) => sm.profileId.eq(profileId))
        .where((sm) => sm.role.eq("ACCOUNTANT"))
        .where((sm) => sm.isActive.eq(true)),
    )
    .orderBy((s) => s.name.asc())
    .all()
    .then((schemes) =>
      schemes.filter((s) => s.memberships.length > 0),
    );
}

/**
 * Fetch a single scheme by ID with lot count and membership summary.
 */
export async function getSchemeById(schemeId: string) {
  return db.orm.public.Scheme
    .include("lots")
    .include("memberships", (m) =>
      m.where((sm) => sm.isActive.eq(true))
        .include("profile"),
    )
    .include("funds")
    .include("bankAccounts")
    .include("images", (i) => i.orderBy((img) => img.sortOrder.asc()))
    .first({ id: schemeId });
}

/** A new building's data its rule pack does not allow: nothing is created. */
export class SchemeDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SchemeDataError";
  }
}

/**
 * Why createScheme cannot save a building's pack data, or null (QLD
 * onboarding go-live, 27 Oct 2026). Checked here as well as by the caller, so
 * no caller can save a module or plan format for a building whose pack has no
 * such selector (the schemes_regulation_module_state_check and
 * schemes_plan_format_state_check constraints), a module StrataVerze does not
 * apply, a plan format that is not listed, or a second lot entitlement that
 * is not a positive whole number or that the pack does not hold.
 */
export function newSchemeDataProblem(
  rules: Pick<StatutoryRules, "REGULATION_MODULE" | "ENTITLEMENT_SCHEDULES"> & Partial<Pick<StatutoryRules, "PLAN_FORMAT">>,
  data: { regulationModule?: string | null; planFormat?: string | null },
  lots: readonly { lotNumber: string; interestScheduleEntitlement?: number | null }[],
): string | null {
  if (data.regulationModule != null) {
    if (!rules.REGULATION_MODULE) return "This building's rules have no regulation module, so none can be saved.";
    const problem = regulationModuleChoiceProblem(rules, data.regulationModule);
    if (problem) return problem;
  }
  if (data.planFormat != null) {
    if (!rules.PLAN_FORMAT) return "This building's rules have no plan format, so none can be saved.";
    const problem = planFormatChoiceProblem(rules, data.planFormat);
    if (problem) return problem;
  }
  const separate = separateEntitlement(rules);
  const held = separate?.field === "interestScheduleEntitlement";
  for (const lot of lots) {
    const value = lot.interestScheduleEntitlement;
    if (value == null) continue;
    if (!held) return `Lot ${lot.lotNumber} has a second lot entitlement, which this building's rules do not hold.`;
    if (!Number.isInteger(value) || value < 1 || value > MAX_ENTITLEMENT)
      return `Lot ${lot.lotNumber}: the ${separate!.name} must be a whole number from 1 to ${MAX_ENTITLEMENT.toLocaleString("en-AU")}.`;
  }
  return null;
}

/**
 * Create a new scheme and wire the creator as its adviser.
 */
export async function createScheme(
  data: {
    name: string;
    planNumber: string;
    address: string;
    suburb: string;
    state: string;
    postcode: string;
    totalLots: number;
    totalEntitlement: number;
    financialYearEnd?: string;
    abnNumber?: string;
    buildingType?: string;
    buildingClass?: string;
    buildingSubType?: string;
    folio?: string;
    isActive?: boolean;
    allInclusiveFees?: boolean;
    paymentPlan?: string;
    debtCollection?: boolean;
    /** The regulation module, where the building's pack has one (Queensland). Checked again here. */
    regulationModule?: string;
    /** The plan format, where the building's pack has one (Queensland). Checked again here. */
    planFormat?: string;
  },
  adviserProfileId: string,
  /**
   * The building's lots from onboarding, already checked (count and unit
   * entitlement total match the building). Each owner's name is stored as it
   * appears on the strata roll.
   */
  lots: readonly { lotNumber: string; unitNumber: string | null; entitlement: number; ownerName: string | null; interestScheduleEntitlement?: number | null }[] = [],
) {
  // The building's rule pack. A state with no pack is refused before anything is created.
  const { rules } = rulesForState(data.state);
  // The pack's own data is checked here too, whatever the caller checked.
  const dataProblem = newSchemeDataProblem(rules, data, lots);
  if (dataProblem) throw new SchemeDataError(dataProblem);
  const defaultAccountingBasis = needRule(rules, "defaultAccountingBasis");
  // The building's time zone, from its state and postcode.
  const timeZone = defaultTimeZone(data.state, data.postcode);
  if (!timeZone) throw new Error(`No time zone is known for ${data.state}.`);
  const created = await db.transaction(async (tx) => {
    const scheme = await tx.orm.public.Scheme.create({
      name: data.name,
      planNumber: data.planNumber,
      address: data.address,
      suburb: data.suburb,
      state: data.state,
      postcode: data.postcode,
      timeZone: timeZone as unknown as Varchar<64>,
      totalLots: data.totalLots,
      totalEntitlement: data.totalEntitlement,
      financialYearEnd: data.financialYearEnd ?? "06-30",
      abnNumber: data.abnNumber ?? null,
      buildingType: data.buildingType ?? null,
      buildingClass: data.buildingClass ?? null,
      buildingSubType: data.buildingSubType ?? null,
      folio: data.folio ?? null,
      isActive: data.isActive ?? true,
      allInclusiveFees: data.allInclusiveFees ?? false,
      paymentPlan: data.paymentPlan ?? null,
      debtCollection: data.debtCollection ?? false,
      // The late charge setting the pack starts a building on (NSW statutory interest, Queensland no penalty).
      interestMode: rules.LATE_CHARGE.defaultMode,
      // Only where the pack has a module and a plan format (Queensland), checked above; an NSW building is created as before.
      ...(data.regulationModule != null ? { regulationModule: data.regulationModule } : {}),
      ...(data.planFormat != null ? { planFormat: data.planFormat } : {}),
    });

    // Link the creator as the adviser
    await tx.orm.public.SchemeMembership.create({
      schemeId: scheme.id,
      profileId: adviserProfileId,
      role: "ADVISER",
      isActive: true,
    });

    // The default funds: the pack's required funds, named as the pack names them.
    for (const fund of defaultFunds(rules)) {
      await tx.orm.public.Fund.create({
        schemeId: scheme.id,
        name: fund.name,
        fundType: fund.fundType,
        accountingBasis: defaultAccountingBasis(fund.fundType),
      });
    }

    // The lots, in batches, with the owner's name as on the strata roll.
    for (let i = 0; i < lots.length; i += 500) {
      const batch = lots.slice(i, i + 500);
      const rows = await tx.orm.public.Lot.createAll(
        batch.map((l) => ({
          schemeId: scheme.id,
          lotNumber: l.lotNumber,
          unitNumber: l.unitNumber,
          entitlement: l.entitlement,
          // The second entitlement, where the pack has one (Queensland's interest schedule).
          ...(l.interestScheduleEntitlement != null ? { interestScheduleEntitlement: l.interestScheduleEntitlement } : {}),
        })),
      );
      const idByNumber = new Map(rows.map((r) => [r.lotNumber, r.id]));
      const details = batch
        .filter((l) => l.ownerName)
        .map((l) => ({ lotId: idByNumber.get(l.lotNumber)!, rollOwnerName: l.ownerName }));
      if (details.some((d) => !d.lotId)) throw new Error("A lot was not created.");
      if (details.length) await tx.orm.public.LotDetail.createAll(details);
    }

    return scheme;
  });

  // The default chart of accounts, so the ledger can post from day one.
  // A failure here does not undo the scheme; the adviser can seed it from Finance.
  try {
    await seedDefaultChartOfAccounts(created.id);
  } catch (err) {
    logError("[schemes] Could not seed the chart of accounts:", err);
  }
  return created;
}

/**
 * Update an existing scheme.
 */
export async function updateScheme(
  schemeId: string,
  data: Partial<{
    name: string;
    address: string;
    suburb: string;
    state: string;
    postcode: string;
    totalLots: number;
    totalEntitlement: number;
    financialYearEnd: string;
    abnNumber: string | null;
    buildingSubType: string | null;
    folio: string | null;
    isActive: boolean;
    allInclusiveFees: boolean;
    paymentPlan: string | null;
    debtCollection: boolean;
  }>,
) {
  // A changed state or postcode can mean a new time zone (Broken Hill, Lord
  // Howe Island). Only a real change resets it, so a time zone StrataVerze set
  // by hand survives other edits.
  let timeZone: string | null = null;
  // A regulation module belongs to its state's rule pack (QLD stage 2,
  // step 10): a building moved to another state no longer has one, and the
  // database holds a module for Queensland only. An NSW building has none, so
  // nothing changes for it. The plan format (QLD go-live gap) belongs to the
  // pack the same way and is cleared with it.
  let clearModule = false;
  let clearPlanFormat = false;
  // The building selectors (VIC, ACT and WA stage 2, PR 2) belong to the pack
  // the same way: a state change deletes the recorded selector values and
  // clears the facts the derived ones read (services only, replacement cost,
  // each lot's occupiable answer), so nothing recorded under one state's
  // rules is read under another's. Only a real state change does this, and
  // only where something is held, so an NSW building's update is as before.
  let clearSelectors = false;
  const clearFacts: { servicesOnly?: null; replacementCost?: null } = {};
  if (data.state !== undefined || data.postcode !== undefined) {
    const current = await db.orm.public.Scheme.where({ id: schemeId }).first();
    const norm = (v: unknown) => String(v ?? "").trim().toUpperCase();
    const stateChanged = data.state !== undefined && norm(data.state) !== norm(current?.state);
    const changed = stateChanged || (data.postcode !== undefined && norm(data.postcode) !== norm(current?.postcode));
    if (changed) {
      timeZone = defaultTimeZone(data.state ?? current?.state, data.postcode ?? current?.postcode);
      if (!timeZone) throw new Error(`No time zone is known for ${data.state ?? current?.state ?? "this state"}.`);
    }
    clearModule = stateChanged && current?.regulationModule != null;
    clearPlanFormat = stateChanged && current?.planFormat != null;
    clearSelectors = stateChanged;
    if (stateChanged && current?.servicesOnly != null) clearFacts.servicesOnly = null;
    if (stateChanged && current?.replacementCost != null) clearFacts.replacementCost = null;
  }
  const update = {
    ...data,
    ...(timeZone ? { timeZone: timeZone as unknown as Varchar<64> } : {}),
    ...(clearModule ? { regulationModule: null } : {}),
    ...(clearPlanFormat ? { planFormat: null } : {}),
    ...clearFacts,
  };
  if (!clearSelectors) return db.orm.public.Scheme.where({ id: schemeId }).update(update);
  return db.transaction(async (tx) => {
    const updated = await tx.orm.public.Scheme.where({ id: schemeId }).update(update);
    await tx.orm.public.SchemeSelectorValue.where((v) => v.schemeId.eq(schemeId)).deleteAndCount();
    await tx.orm.public.Lot.where((l) => and(l.schemeId.eq(schemeId), l.occupiable.isNotNull())).updateAndCount({ occupiable: null });
    return updated;
  });
}

/**
 * Delete a scheme and all cascaded records.
 */
export async function deleteScheme(schemeId: string) {
  return db.orm.public.Scheme.where({ id: schemeId }).delete();
}

/**
 * Fetch the name of a scheme by ID.
 */
export async function getSchemeNameById(schemeId: string) {
  const scheme = await db.orm.public.Scheme.first({ id: schemeId });
  return scheme?.name ?? "Unknown Scheme";
}

/**
 * Get notification summary counts per scheme for the selection grid.
 * Returns a map of schemeId -> { pendingLevies, activeWorkOrders, upcomingMeetings }.
 */
export async function getSchemeNotificationCounts(
  schemeIds: string[],
  ownerLotIds: Set<string>,
) {
  if (schemeIds.length === 0) return new Map<string, { pendingLevies: number; activeWorkOrders: number; upcomingMeetings: number }>();

  const [levies, workOrders, meetings] = await Promise.all([
    ownerLotIds.size > 0
      ? db.orm.public.LevyNotice
          .where((ln) => ln.schemeId.in(schemeIds))
          .where((ln) => ln.lotId.in([...ownerLotIds]))
          .where((ln) => ln.status.in(["ISSUED", "PARTIALLY_PAID", "OVERDUE"]))
          .limit(2000)
          .all()
      : Promise.resolve([]),
    db.orm.public.WorkOrder
      .where((wo) => wo.schemeId.in(schemeIds))
      .where((wo) => wo.status.in(["OPEN", "IN_PROGRESS"]))
      .limit(1000)
      .all(),
    // Current meetings in any status of either flow; which are upcoming is decided below.
    db.orm.public.Meeting
      .where((m) => m.schemeId.in(schemeIds))
      .where((m) => m.deletedAt.eq(null))
      .where((m) => m.status.in(["DRAFT", "SCHEDULED", "NOTICE_ISSUED", "IN_PROGRESS", "ADJOURNED", "MINUTES_DRAFT"]))
      .limit(2000)
      .all(),
  ]);

  const counts = new Map<string, { pendingLevies: number; activeWorkOrders: number; upcomingMeetings: number }>();

  for (const id of schemeIds) {
    counts.set(id, { pendingLevies: 0, activeWorkOrders: 0, upcomingMeetings: 0 });
  }

  // Count unpaid levy notices on the owner's lots
  for (const notice of levies) {
    const entry = counts.get(notice.schemeId);
    if (entry && Number(notice.balanceOutstanding ?? 0) > 0) entry.pendingLevies++;
  }

  // Count active work orders per scheme
  for (const wo of workOrders) {
    const entry = counts.get(wo.schemeId);
    if (entry) entry.activeWorkOrders++;
  }

  // Count upcoming meetings per scheme
  const now = new Date();
  for (const meeting of meetings) {
    const entry = counts.get(meeting.schemeId);
    if (entry && isUpcomingMeeting(String(meeting.status), new Date(String(meeting.scheduledAt)), now)) entry.upcomingMeetings++;
  }

  return counts;
}

/**
 * Fetch email addresses for all active members of a scheme,
 * optionally filtered by role (e.g. "OWNER", "COMMITTEE", "ADVISER").
 */
export async function getMemberEmailsForScheme(
  schemeId: string,
  role?: "OWNER" | "COMMITTEE" | "ADVISER",
) {
  const memberships = role
    ? await db.orm.public.SchemeMembership
        .where((m) => m.schemeId.eq(schemeId))
        .where((m) => m.role.eq(role))
        .where((m) => m.isActive.eq(true))
        .include("profile")
        .limit(500)
        .all()
    : await db.orm.public.SchemeMembership
        .where((m) => m.schemeId.eq(schemeId))
        .where((m) => m.isActive.eq(true))
        .include("profile")
        .limit(500)
        .all();

  return memberships
    .map((m) => m.profile.email)
    .filter((email) => email.length > 0);
}
