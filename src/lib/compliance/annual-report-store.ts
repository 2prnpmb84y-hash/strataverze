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
import { meetingZone, storedDayIn, todayIn } from "@/lib/jurisdiction/time-zone";
import { getFundsWithBalances } from "@/lib/queries/funds";
import { annualReportStatus } from "./annual-report";

export class AnnualReportError extends Error {
  constructor(message: string, readonly fieldErrors: Record<string, string> = {}) {
    super(message);
    this.name = "AnnualReportError";
  }
}

const day = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v ?? "")).slice(0, 10);
const ISO = /^\d{4}-\d{2}-\d{2}$/;
/** Meeting statuses that mean the meeting was held. */
const HELD = ["IN_PROGRESS", "MINUTES_DRAFT", "PUBLISHED"];

/** The AGMs held, newest first: from meetings in StrataVerze and AGMs recorded by hand. */
async function agmsHeld(schemeId: string, tz: string, today: string) {
  const [meetings, rows] = await Promise.all([
    db.orm.public.Meeting.where((m) => and(m.schemeId.eq(schemeId), m.meetingType.in(["AGM", "FIRST_AGM"]))).limit(500).all(),
    db.orm.public.AnnualReport.where((r) => r.schemeId.eq(schemeId)).limit(500).all(),
  ]);
  const days = new Set<string>();
  for (const m of meetings) {
    if (!HELD.includes(String(m.status)) || !m.startTime) continue;
    const d = storedDayIn(meetingZone(m, tz), m.startTime);
    if (d && d <= today) days.add(d);
  }
  for (const r of rows) days.add(day(r.agmOn));
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
    withInfo ? db.orm.public.InsurancePolicy.where((p) => and(p.schemeId.eq(schemeId), p.status.eq("ACTIVE"))).limit(100).all() : Promise.resolve([]),
  ]);
  // The larger of the roll and the recorded total, so a partly loaded roll never makes a scheme exempt.
  const schemeLots = Math.max(lots.length, scheme.totalLots);
  const lastAgmOn = agms[0] ?? null;
  const row = lastAgmOn ? rows.find((r) => day(r.agmOn) === lastAgmOn) ?? null : null;
  const status = annualReportStatus({ lastAgmOn, reportedOn: row?.reportedOn ? day(row.reportedOn) : null, schemeLots, today }, rules);

  const byType = new Map<string, number>();
  for (const l of lots) byType.set(String(l.lotType ?? "RESIDENTIAL"), (byType.get(String(l.lotType ?? "RESIDENTIAL")) ?? 0) + 1);
  const capitalWorks = funds.filter((f) => String(f.fundType).toUpperCase().includes("CAPITAL") || String(f.fundType).toUpperCase() === "SINKING");
  const building = policies.filter((p) => p.policyType === "BUILDING");
  const info: Array<[string, string]> = [
    ["Strata plan number", String(scheme.planNumber)],
    ["Address", [scheme.address, scheme.suburb, scheme.state, scheme.postcode].filter(Boolean).join(", ")],
    ["Number of lots", String(schemeLots)],
    ["Lots by use", lots.length ? [...byType.entries()].map(([t, n]) => `${t.charAt(0)}${t.slice(1).toLowerCase()} ${n}`).join(", ") : "No lots on the roll yet"],
    ["Last AGM", lastAgmOn ?? "None recorded"],
    ["Building insurance sum insured", building.length ? building.map((p) => `$${Number(p.coverageAmount).toLocaleString("en-AU", { minimumFractionDigits: 2 })}`).join(", ") : "No active building policy recorded"],
    ["Capital works fund balance (today)", capitalWorks.length ? capitalWorks.map((f) => `$${Number(f.balance ?? 0).toLocaleString("en-AU", { minimumFractionDigits: 2 })}`).join(", ") : "No capital works fund recorded"],
    ["Secretary and chairperson", "Not recorded in StrataVerze: take them from the committee"],
    ["Strata managing agent and building manager", "Not recorded in StrataVerze as such: add them from your records"],
    ["Occupation certificate, fire safety statement, NABERS, storeys", "Not recorded in StrataVerze: add them from your records"],
    ["Emergency contacts", "Not recorded in StrataVerze: add up to four"],
  ];
  return { scheme, today, timeZone: tz, rules, ...status, lastAgmOn, row, agms, info, schemeLots };
}

/** Record an AGM held outside StrataVerze. */
export async function recordAgmHeld(input: { schemeId: string; agmOn: string; today: string }) {
  if (!ISO.test(input.agmOn) || input.agmOn > input.today) throw new AnnualReportError("Enter the date the AGM was held.", { agmOn: "Enter the date the AGM was held (not in the future)." });
  const existing = await db.orm.public.AnnualReport.where((r) => and(r.schemeId.eq(input.schemeId), r.agmOn.eq(input.agmOn))).first();
  if (existing) return;
  await db.orm.public.AnnualReport.create({ schemeId: input.schemeId, agmOn: input.agmOn, agmRecorded: true });
}

/** Record that the report for an AGM was made on Strata Hub. */
export async function recordReported(input: { schemeId: string; agmOn: string; reportedOn: string; reference: string | null; actorId: string; today: string }) {
  const e: Record<string, string> = {};
  if (!ISO.test(input.agmOn)) e.agmOn = "Choose the AGM.";
  if (!ISO.test(input.reportedOn) || input.reportedOn > input.today) e.reportedOn = "Enter the date it was reported (not in the future).";
  else if (ISO.test(input.agmOn) && input.reportedOn < input.agmOn) e.reportedOn = "The report is made after the AGM.";
  if (Object.keys(e).length) throw new AnnualReportError("Check the report details.", e);
  const existing = await db.orm.public.AnnualReport.where((r) => and(r.schemeId.eq(input.schemeId), r.agmOn.eq(input.agmOn))).first();
  const data = { reportedOn: input.reportedOn, reference: input.reference?.trim() || null, reportedBy: input.actorId };
  if (existing) await db.orm.public.AnnualReport.where((r) => r.id.eq(existing.id)).update(data);
  else await db.orm.public.AnnualReport.create({ schemeId: input.schemeId, agmOn: input.agmOn, agmRecorded: false, ...data });
}

/** Claim today's reminder for an AGM's report (true when this run should send it). */
export async function claimReportReminder(input: { schemeId: string; agmOn: string; today: string }): Promise<boolean> {
  const existing = await db.orm.public.AnnualReport.where((r) => and(r.schemeId.eq(input.schemeId), r.agmOn.eq(input.agmOn))).first();
  if (!existing) {
    try {
      await db.orm.public.AnnualReport.create({ schemeId: input.schemeId, agmOn: input.agmOn, agmRecorded: false, lastReminderOn: input.today });
      return true;
    } catch {
      return false; // another run created it first
    }
  }
  const n = await db.orm.public.AnnualReport.where((r) => and(r.id.eq(existing.id), or(r.lastReminderOn.isNull(), r.lastReminderOn.lt(input.today)))).updateAndCount({ lastReminderOn: input.today });
  return n === 1;
}
