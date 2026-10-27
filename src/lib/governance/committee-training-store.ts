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
import { needRule } from "@/config/statutory";

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
  /** The recorded appointment is old enough that the member may have been re-elected since. */
  checkAppointment: boolean;
}

/**
 * The number of lots, for the two-lot exemption: the larger of the roll and
 * the recorded total, so a partly loaded roll never makes a scheme exempt.
 */
async function schemeLotCount(scheme: { id: string; totalLots: number }) {
  const lots = await db.orm.public.Lot.where((l) => l.schemeId.eq(scheme.id)).limit(5000).all();
  // A common property row on the roll is not a lot.
  return Math.max(lots.filter((l) => String(l.lotType ?? "").toUpperCase() !== "COMMON").length, scheme.totalLots);
}

/** Every active committee member of a scheme with their training status. */
export async function committeeTrainingRows(schemeId: string, now: Date = new Date()) {
  const scheme = await db.orm.public.Scheme.where((s) => s.id.eq(schemeId)).first();
  if (!scheme) return null;
  const tz = timeZoneOf(scheme);
  const today = todayIn(tz, now);
  const pack = rulesForState(scheme.state).rules;
  // Only buildings whose pack has committee training: for the others there is nothing to track or remind.
  if (!pack.FEATURES.committeeTraining) return null;
  const training = needRule(pack, "COMMITTEE_TRAINING");
  const [members, records, schemeLots] = await Promise.all([
    db.orm.public.SchemeMembership.where((m) => and(m.schemeId.eq(schemeId), m.role.eq("COMMITTEE"), m.isActive.eq(true))).limit(200).all(),
    db.orm.public.CommitteeTraining.where((t) => t.schemeId.eq(schemeId)).limit(500).all(),
    schemeLotCount(scheme),
  ]);
  const profiles = members.length ? await db.orm.public.Profile.where((p) => p.id.in(members.map((m) => m.profileId))).limit(200).all() : [];
  const rows: TrainingRow[] = members.map((m) => {
    const p = profiles.find((x) => x.id === m.profileId);
    const r = records.find((x) => x.profileId === m.profileId);
    // Until an adviser records the appointment date, the date committee access began is shown (not used for a due date).
    const appointmentRecorded = !!r?.appointedRecordedBy;
    const appointedOn = r && appointmentRecorded ? day(r.appointedOn) : storedDayIn(tz, m.startDate);
    const s = trainingStatus(
      { appointedOn, appointmentRecorded, completedOn: r?.completedOn ? day(r.completedOn) : null, exemption: r?.exemption ?? null, schemeLots, today },
      training,
    );
    return {
      profileId: m.profileId,
      name: `${p?.firstName ?? ""} ${p?.lastName ?? ""}`.trim() || String(p?.email ?? "Member"),
      email: p?.email ?? null,
      appointedOn,
      appointedOnRecorded: appointmentRecorded,
      completedOn: r?.completedOn ? day(r.completedOn) : null,
      exemption: r?.exemption ?? null,
      note: r?.note ?? null,
      ...s,
    };
  });
  rows.sort((a, b) => a.name.localeCompare(b.name, "en-AU"));
  return { scheme, today, timeZone: tz, rules: training, ownersCorporation: pack.TERMINOLOGY.ownersCorporation, rows };
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
    appointedRecordedBy: input.actorId,
    completedRecordedBy: input.completedOn ? input.actorId : null,
  });
}

/** A committee member records their own completion (the date on their certificate). */
export async function recordOwnCompletion(input: { schemeId: string; profileId: string; completedOn: string; today: string; defaultAppointedOn: string }) {
  if (!ISO.test(input.completedOn) || input.completedOn > input.today) throw new TrainingError("Enter the date on your certificate.", { completedOn: "Enter the date on your certificate (not in the future)." });
  if (!(await activeCommitteeMember(input.schemeId, input.profileId))) throw new TrainingError("You are not on the committee of this scheme.");
  const existing = await db.orm.public.CommitteeTraining.where((t) => and(t.schemeId.eq(input.schemeId), t.profileId.eq(input.profileId))).first();
  // Only the completion: the appointment date and who recorded it are left as they are.
  if (existing) {
    await db.orm.public.CommitteeTraining.where((t) => t.id.eq(existing.id)).update({ completedOn: input.completedOn, completedRecordedBy: input.profileId });
  } else {
    await db.orm.public.CommitteeTraining.create({ schemeId: input.schemeId, profileId: input.profileId, appointedOn: input.defaultAppointedOn, completedOn: input.completedOn, completedRecordedBy: input.profileId });
  }
}

async function upsert(
  schemeId: string,
  profileId: string,
  data: { appointedOn: string; completedOn: string | null; exemption: string | null; note: string | null; appointedRecordedBy: string; completedRecordedBy: string | null },
) {
  const existing = await db.orm.public.CommitteeTraining.where((t) => and(t.schemeId.eq(schemeId), t.profileId.eq(profileId))).first();
  if (existing) await db.orm.public.CommitteeTraining.where((t) => t.id.eq(existing.id)).update(data);
  else await db.orm.public.CommitteeTraining.create({ schemeId, profileId, ...data });
}

/**
 * Claim today's reminder for a member (true when this run should send it).
 * Reminders go only to members whose appointment date an adviser recorded,
 * so the record exists.
 */
export async function claimTrainingReminder(input: { schemeId: string; profileId: string; today: string }): Promise<boolean> {
  const n = await db.orm.public.CommitteeTraining.where((t) =>
    and(t.schemeId.eq(input.schemeId), t.profileId.eq(input.profileId), t.appointedRecordedBy.isNotNull(), or(t.lastReminderOn.isNull(), t.lastReminderOn.lt(input.today))),
  ).updateAndCount({ lastReminderOn: input.today });
  return n === 1;
}
