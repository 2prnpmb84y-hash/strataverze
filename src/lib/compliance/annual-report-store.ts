/**
 * Strata Hub annual reports (server side). The latest AGM is the latest of
 * the AGMs held in StrataVerze (an AGM or first AGM that has started) and
 * any AGM recorded by hand. The report for it is due within the rule pack's
 * months of that AGM.
 */
import { and, or } from "@prisma/orm-postgres/orm-client";
import { db } from "@/prisma/db";
import { rulesForState } from "@/lib/jurisdiction/scheme-rules";
import { timeZoneOf } from "@/lib/jurisdiction/scheme-time";
import { isCalendarDay, meetingZone, storedDayIn, todayIn } from "@/lib/jurisdiction/time-zone";
import { getFundsWithBalances } from "@/lib/queries/funds";
import { annualReportStatus } from "./annual-report";

export class AnnualReportError extends Error {
  constructor(message: string, readonly fieldErrors: Record<string, string> = {}) {
    super(message);
    this.name = "AnnualReportError";
  }
}

const day = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v ?? "")).slice(0, 10);
const ISO = { test: (v: string) => isCalendarDay(v) };
/** Meeting statuses that mean the meeting was held. */
const HELD = ["IN_PROGRESS", "MINUTES_DRAFT", "PUBLISHED"];

/** Lots that count for the report: every lot on the roll except a common property row. */
const countsAsLot = (l: { lotType: string | null }) => String(l.lotType ?? "").toUpperCase() !== "COMMON";

/**
 * The AGMs held, newest first: AGMs and first AGMs in StrataVerze that have
 * opened (not deleted, not adjourned), and AGMs recorded by hand. A row kept
 * only for reminders is not an AGM on its own.
 */
export async function agmsHeld(schemeId: string, tz: string, today: string) {
  const [meetings, rows] = await Promise.all([
    db.orm.public.Meeting.where((m) => and(m.schemeId.eq(schemeId), m.meetingType.in(["AGM", "FIRST_AGM"]), m.deletedAt.isNull())).limit(500).all(),
    db.orm.public.AnnualReport.where((r) => r.schemeId.eq(schemeId)).limit(500).all(),
  ]);
  const days = new Set<string>();
  for (const m of meetings) {
    if (!HELD.includes(String(m.status))) continue;
    const at = m.openedAt ?? m.startTime ?? m.scheduledAt;
    const d = storedDayIn(meetingZone(m, tz), at);
    if (d && d <= today) days.add(d);
  }
  for (const r of rows) if (r.agmRecorded || r.reportedOn) days.add(day(r.agmOn));
  return { agms: [...days].sort().reverse(), rows };
}

/** The scheme's report status and the information the report asks for. */
export async function annualReportOverview(schemeId: string, now: Date = new Date(), opts: { info?: boolean } = {}) {
  const withInfo = opts.info !== false;
  const scheme = await db.orm.public.Scheme.where((s) => s.id.eq(schemeId)).first();
  if (!scheme) return null;
  const tz = timeZoneOf(scheme);
  const today = todayIn(tz, now);
  const pack = rulesForState(scheme.state).rules;
  const rules = pack.ANNUAL_REPORTING;
  const [{ agms, rows }, lots, funds, policies] = await Promise.all([
    agmsHeld(schemeId, tz, today),
    db.orm.public.Lot.where((l) => l.schemeId.eq(schemeId)).limit(5000).all(),
    // The ledger balances and policies only for the page, not the daily reminders.
    withInfo ? getFundsWithBalances(schemeId) : Promise.resolve([]),
    withInfo ? db.orm.public.InsurancePolicy.where((p) => and(p.schemeId.eq(schemeId), p.status.eq("ACTIVE"), p.deletedAt.isNull())).limit(100).all() : Promise.resolve([]),
  ]);
  // The larger of the roll and the recorded total, so a partly loaded roll never makes a scheme exempt.
  const lotRows = lots.filter(countsAsLot);
  const schemeLots = Math.max(lotRows.length, scheme.totalLots);
  const lastAgmOn = agms[0] ?? null;
  const row = lastAgmOn ? rows.find((r) => day(r.agmOn) === lastAgmOn) ?? null : null;
  const status = annualReportStatus({ lastAgmOn, reportedOn: row?.reportedOn ? day(row.reportedOn) : null, schemeLots, today }, rules);

  const byType = new Map<string, number>();
  for (const l of lotRows) byType.set(String(l.lotType ?? "RESIDENTIAL"), (byType.get(String(l.lotType ?? "RESIDENTIAL")) ?? 0) + 1);
  const capitalWorks = funds.filter((f) => String(f.fundType).toUpperCase().includes("CAPITAL") || String(f.fundType).toUpperCase() === "SINKING");
  // Building cover: the BUILDING item of a strata or building policy, else a building policy's headline sum insured.
  const covered = policies.filter((p) => p.policyType === "BUILDING" || p.policyType === "STRATA");
  const items = covered.length ? await db.orm.public.InsuranceCoverageItem.where((c) => and(c.policyId.in(covered.map((p) => p.id)), c.category.eq("BUILDING"))).limit(50).all() : [];
  const buildingAmounts = items.filter((c) => c.sumInsured != null).map((c) => Number(c.sumInsured));
  if (!buildingAmounts.length) for (const p of covered) if (p.policyType === "BUILDING") buildingAmounts.push(Number(p.coverageAmount));
  const managers = withInfo
    ? await db.orm.public.SchemeMembership.where((m) => and(m.schemeId.eq(schemeId), m.role.in(["STRATA_MANAGER", "BUILDING_MANAGER", "ADVISER"]), m.isActive.eq(true))).limit(50).all()
    : [];
  const managerProfiles = managers.length ? await db.orm.public.Profile.where((p) => p.id.in([...new Set(managers.map((m) => m.profileId))])).limit(50).all() : [];
  const nameOf = (id: string) => {
    const p = managerProfiles.find((x) => x.id === id);
    return `${p?.firstName ?? ""} ${p?.lastName ?? ""}`.trim() || String(p?.email ?? "");
  };
  const roleNames = (role: string) => managers.filter((m) => m.role === role).map((m) => nameOf(m.profileId)).filter(Boolean);
  const info: Array<[string, string]> = [
    ["Strata plan number", String(scheme.planNumber)],
    ["Address", [scheme.address, scheme.suburb, scheme.state, scheme.postcode].filter(Boolean).join(", ")],
    ["Number of lots", String(schemeLots)],
    ["Lots by use", lotRows.length ? [...byType.entries()].map(([t, n]) => `${t.charAt(0)}${t.slice(1).toLowerCase()} ${n}`).join(", ") : "No lots on the roll yet"],
    ["Last AGM", lastAgmOn ?? "None recorded"],
    [
      "Building sum insured (the report asks for the replacement value from the latest valuation)",
      buildingAmounts.length ? buildingAmounts.map((a) => `$${a.toLocaleString("en-AU", { minimumFractionDigits: 2 })}`).join(", ") : "No building cover recorded on an active policy",
    ],
    ["Capital works fund balance (today)", capitalWorks.length ? capitalWorks.map((f) => `$${Number(f.balance ?? 0).toLocaleString("en-AU", { minimumFractionDigits: 2 })}`).join(", ") : "No capital works fund recorded"],
    ["Secretary and chairperson", "Not recorded in StrataVerze: take them from the committee"],
    [
      "Strata managing agent and building manager",
      [roleNames("STRATA_MANAGER").length ? `Strata manager: ${roleNames("STRATA_MANAGER").join(", ")}` : null, roleNames("BUILDING_MANAGER").length ? `Building manager: ${roleNames("BUILDING_MANAGER").join(", ")}` : null]
        .filter(Boolean)
        .join("; ") || "Not recorded in StrataVerze: add them from your records",
    ],
    ["Occupation certificate, fire safety statement, NABERS, storeys", "Not recorded in StrataVerze: add them from your records"],
    ["Emergency contacts", "Not recorded in StrataVerze: add up to four"],
  ];
  // AGMs recorded by hand with no report yet: these can be removed if entered by mistake.
  const recordedAgms = rows.filter((r) => r.agmRecorded && !r.reportedOn).map((r) => day(r.agmOn)).sort().reverse();
  return { scheme, today, timeZone: tz, rules, ...status, lastAgmOn, row, agms, info, schemeLots, recordedAgms };
}

/** Record an AGM held outside StrataVerze. */
export async function recordAgmHeld(input: { schemeId: string; agmOn: string; today: string }) {
  if (!ISO.test(input.agmOn) || input.agmOn > input.today) throw new AnnualReportError("Enter the date the AGM was held.", { agmOn: "Enter the date the AGM was held (not in the future)." });
  const existing = await db.orm.public.AnnualReport.where((r) => and(r.schemeId.eq(input.schemeId), r.agmOn.eq(input.agmOn))).first();
  if (existing) return;
  await db.orm.public.AnnualReport.create({ schemeId: input.schemeId, agmOn: input.agmOn, agmRecorded: true });
}

/** Remove an AGM recorded by hand by mistake (only one with no report recorded). */
export async function removeRecordedAgm(input: { schemeId: string; agmOn: string }) {
  if (!ISO.test(input.agmOn)) throw new AnnualReportError("Choose the AGM.");
  const n = await db.orm.public.AnnualReport.where((r) => and(r.schemeId.eq(input.schemeId), r.agmOn.eq(input.agmOn), r.agmRecorded.eq(true), r.reportedOn.isNull())).updateAndCount({ agmRecorded: false });
  if (n !== 1) throw new AnnualReportError("Only an AGM recorded by hand, with no report recorded, can be removed.");
}

/** Record that the report for an AGM was made on Strata Hub. */
export async function recordReported(input: { schemeId: string; agmOn: string; reportedOn: string; reference: string | null; actorId: string; today: string }) {
  const e: Record<string, string> = {};
  if (!ISO.test(input.agmOn)) e.agmOn = "Choose the AGM.";
  if (!ISO.test(input.reportedOn) || input.reportedOn > input.today) e.reportedOn = "Enter the date it was reported (not in the future).";
  else if (ISO.test(input.agmOn) && input.reportedOn < input.agmOn) e.reportedOn = "The report is made after the AGM.";
  if (Object.keys(e).length) throw new AnnualReportError("Check the report details.", e);
  const scheme = await db.orm.public.Scheme.where((s) => s.id.eq(input.schemeId)).first();
  if (!scheme) throw new AnnualReportError("Scheme not found.");
  const { agms } = await agmsHeld(input.schemeId, timeZoneOf(scheme), input.today);
  if (!agms.includes(input.agmOn)) throw new AnnualReportError("Choose an AGM that was held.", { agmOn: "Choose an AGM from the list." });
  const existing = await db.orm.public.AnnualReport.where((r) => and(r.schemeId.eq(input.schemeId), r.agmOn.eq(input.agmOn))).first();
  const data = { reportedOn: input.reportedOn, reference: input.reference?.trim() || null, reportedBy: input.actorId };
  if (existing) await db.orm.public.AnnualReport.where((r) => r.id.eq(existing.id)).update(data);
  else await db.orm.public.AnnualReport.create({ schemeId: input.schemeId, agmOn: input.agmOn, agmRecorded: false, ...data });
}

/** Claim today's reminder for an AGM's report (true when this run should send it). */
export async function claimReportReminder(input: { schemeId: string; agmOn: string; today: string }): Promise<boolean> {
  const existing = await db.orm.public.AnnualReport.where((r) => and(r.schemeId.eq(input.schemeId), r.agmOn.eq(input.agmOn))).first();
  if (!existing) {
    // A reminder-only row (agm_recorded false, no report): it does not make the date an AGM on its own.
    try {
      await db.orm.public.AnnualReport.create({ schemeId: input.schemeId, agmOn: input.agmOn, agmRecorded: false, lastReminderOn: input.today });
      return true;
    } catch (err) {
      const text = err instanceof Error ? `${err.message} ${JSON.stringify((err as { cause?: unknown }).cause ?? "")}` : String(err);
      if (/23505|unique|duplicate key/i.test(text)) return false; // another run created it first
      throw err;
    }
  }
  const n = await db.orm.public.AnnualReport.where((r) => and(r.id.eq(existing.id), or(r.lastReminderOn.isNull(), r.lastReminderOn.lt(input.today)))).updateAndCount({ lastReminderOn: input.today });
  return n === 1;
}
