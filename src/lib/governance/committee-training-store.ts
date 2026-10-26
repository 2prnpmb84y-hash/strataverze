/**
 * Committee training records (server side). Each active committee member of
 * a scheme has a status from the rule pack (`rules.COMMITTEE_TRAINING`).
 * Until an adviser records the appointment date, the date the member's
 * committee access began is used, and shown as such.
 */
import { and, or } from "@prisma/orm-postgres/orm-client";
import { db } from "@/prisma/db";
import { rulesForState } from "@/lib/jurisdiction/scheme-rules";
import { storedDayIn, todayIn } from "@/lib/jurisdiction/time-zone";
import { timeZoneOf } from "@/lib/jurisdiction/scheme-time";
import { isTrainingExemption, trainingStatus, type TrainingStatus } from "./committee-training";

export class TrainingError extends Error {
  constructor(message: string, readonly fieldErrors: Record<string, string> = {}) {
    super(message);
    this.name = "TrainingError";
  }
}

const day = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v ?? "")).slice(0, 10);
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export interface TrainingRow {
  profileId: string;
  name: string;
  email: string | null;
  appointedOn: string;
  appointedOnRecorded: boolean;
  completedOn: string | null;
  exemption: string | null;
  note: string | null;
  status: TrainingStatus;
  dueOn: string | null;
  daysLeft: number | null;
}

/** The number of lots, for the two-lot exemption: the roll, or the recorded total when the roll is empty. */
async function schemeLotCount(scheme: { id: string; totalLots: number }) {
  const lots = await db.orm.public.Lot.where((l) => l.schemeId.eq(scheme.id)).limit(5000).all();
  return lots.length || scheme.totalLots;
}

/** Every active committee member of a scheme with their training status. */
export async function committeeTrainingRows(schemeId: string, now: Date = new Date()) {
  const scheme = await db.orm.public.Scheme.where((s) => s.id.eq(schemeId)).first();
  if (!scheme) return null;
  const tz = timeZoneOf(scheme);
  const today = todayIn(tz, now);
  const rules = rulesForState(scheme.state).rules;
  const [members, records, schemeLots] = await Promise.all([
    db.orm.public.SchemeMembership.where((m) => and(m.schemeId.eq(schemeId), m.role.eq("COMMITTEE"), m.isActive.eq(true))).limit(200).all(),
    db.orm.public.CommitteeTraining.where((t) => t.schemeId.eq(schemeId)).limit(500).all(),
    schemeLotCount(scheme),
  ]);
  const profiles = members.length ? await db.orm.public.Profile.where((p) => p.id.in(members.map((m) => m.profileId))).limit(200).all() : [];
  const rows: TrainingRow[] = members.map((m) => {
    const p = profiles.find((x) => x.id === m.profileId);
    const r = records.find((x) => x.profileId === m.profileId);
    const appointedOn = r ? day(r.appointedOn) : storedDayIn(tz, m.startDate);
    const s = trainingStatus(
      { appointedOn, completedOn: r?.completedOn ? day(r.completedOn) : null, exemption: r?.exemption ?? null, schemeLots, today },
      rules.COMMITTEE_TRAINING,
    );
    return {
      profileId: m.profileId,
      name: `${p?.firstName ?? ""} ${p?.lastName ?? ""}`.trim() || String(p?.email ?? "Member"),
      email: p?.email ?? null,
      appointedOn,
      appointedOnRecorded: !!r?.recordedBy,
      completedOn: r?.completedOn ? day(r.completedOn) : null,
      exemption: r?.exemption ?? null,
      note: r?.note ?? null,
      ...s,
    };
  });
  rows.sort((a, b) => a.name.localeCompare(b.name, "en-AU"));
  return { scheme, today, timeZone: tz, rules: rules.COMMITTEE_TRAINING, ownersCorporation: rules.TERMINOLOGY.ownersCorporation, rows };
}

async function activeCommitteeMember(schemeId: string, profileId: string) {
  return db.orm.public.SchemeMembership.where((m) => and(m.schemeId.eq(schemeId), m.profileId.eq(profileId), m.role.eq("COMMITTEE"), m.isActive.eq(true))).first();
}

/** Adviser: record a member's appointment, completion and any exemption. */
export async function saveCommitteeTraining(input: {
  schemeId: string;
  profileId: string;
  appointedOn: string;
  completedOn: string | null;
  exemption: string | null;
  note: string | null;
  actorId: string;
  today: string;
}) {
  const e: Record<string, string> = {};
  if (!ISO.test(input.appointedOn) || input.appointedOn > input.today) e.appointedOn = "Enter the date they were appointed (not in the future).";
  if (input.completedOn && (!ISO.test(input.completedOn) || input.completedOn > input.today)) e.completedOn = "Enter the date on the certificate (not in the future).";
  if (input.exemption && !isTrainingExemption(input.exemption)) e.exemption = "Choose an exemption from the list.";
  if (input.exemption && !(input.note ?? "").trim()) e.note = "Note the evidence of the exemption the member gave.";
  if (Object.keys(e).length) throw new TrainingError("Check the training details.", e);
  if (!(await activeCommitteeMember(input.schemeId, input.profileId))) throw new TrainingError("They are not on the committee of this scheme.");
  await upsert(input.schemeId, input.profileId, {
    appointedOn: input.appointedOn,
    completedOn: input.completedOn,
    exemption: input.exemption,
    note: input.note?.trim() || null,
    recordedBy: input.actorId,
  });
}

/** A committee member records their own completion (the date on their certificate). */
export async function recordOwnCompletion(input: { schemeId: string; profileId: string; completedOn: string; today: string; defaultAppointedOn: string }) {
  if (!ISO.test(input.completedOn) || input.completedOn > input.today) throw new TrainingError("Enter the date on your certificate.", { completedOn: "Enter the date on your certificate (not in the future)." });
  if (!(await activeCommitteeMember(input.schemeId, input.profileId))) throw new TrainingError("You are not on the committee of this scheme.");
  const existing = await db.orm.public.CommitteeTraining.where((t) => and(t.schemeId.eq(input.schemeId), t.profileId.eq(input.profileId))).first();
  await upsert(input.schemeId, input.profileId, {
    appointedOn: existing ? day(existing.appointedOn) : input.defaultAppointedOn,
    completedOn: input.completedOn,
    exemption: existing?.exemption ?? null,
    note: existing?.note ?? null,
    recordedBy: input.profileId,
  });
}

async function upsert(schemeId: string, profileId: string, data: { appointedOn: string; completedOn: string | null; exemption: string | null; note: string | null; recordedBy: string }) {
  const existing = await db.orm.public.CommitteeTraining.where((t) => and(t.schemeId.eq(schemeId), t.profileId.eq(profileId))).first();
  if (existing) await db.orm.public.CommitteeTraining.where((t) => t.id.eq(existing.id)).update(data);
  else await db.orm.public.CommitteeTraining.create({ schemeId, profileId, ...data });
}

/**
 * Claim today's reminder for a member (true when this run should send it).
 * A member with no training record yet gets one, dated from when their
 * committee access began, as shown on the page.
 */
export async function claimTrainingReminder(input: { schemeId: string; profileId: string; appointedOn: string; today: string }): Promise<boolean> {
  const existing = await db.orm.public.CommitteeTraining.where((t) => and(t.schemeId.eq(input.schemeId), t.profileId.eq(input.profileId))).first();
  if (!existing) {
    try {
      await db.orm.public.CommitteeTraining.create({ schemeId: input.schemeId, profileId: input.profileId, appointedOn: input.appointedOn, lastReminderOn: input.today });
      return true;
    } catch {
      return false; // another run created it first
    }
  }
  const n = await db.orm.public.CommitteeTraining.where((t) => and(t.id.eq(existing.id), or(t.lastReminderOn.isNull(), t.lastReminderOn.lt(input.today)))).updateAndCount({ lastReminderOn: input.today });
  return n === 1;
}
