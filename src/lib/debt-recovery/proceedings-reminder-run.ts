/**
 * The daily reminder for the deadline to start proceedings (QLD go-live gap,
 * stage 2, step 8, 27 Oct 2026), run from the daily compliance run
 * (src/lib/compliance/daily.ts). See proceedings-reminder.ts for when it is
 * sent and what it says.
 *
 * Only active buildings in a state whose live pack has the rule
 * (DEBT_RECOVERY.mustStartProceedings) are read. No live pack has it yet
 * (Queensland is pending), so the run returns before any query, and an NSW
 * building is never read or emailed. The state is matched as the packs match
 * it (trimmed, any letter case). Each building's day is its own time zone.
 *
 * Each stage of each lot is claimed in proceedings_deadline_reminders before
 * it is sent, so a repeated run (a retried cron) sends it once. If no email
 * goes out (every send failed, or there was no one to send to), the claim is
 * given back, so the next run tries again. A failure for one building or lot
 * is logged and never stops the rest.
 */
import { and, or } from "@prisma/orm-postgres/orm-client";
import { db } from "@/prisma/db";
import { liveSchemeRules, rulesForState } from "@/lib/jurisdiction/scheme-rules";
import { timeZoneOf } from "@/lib/jurisdiction/scheme-time";
import { todayIn } from "@/lib/jurisdiction/time-zone";
import { sendEmail } from "@/lib/email";
import { siteUrl } from "@/lib/site-url";
import { logError } from "@/lib/log";
import { complianceEmail } from "@/lib/email-templates/compliance";
import { auDate } from "@/lib/onboarding/property-onboarding";
import type { StatutoryRules } from "@/config/statutory";
import { proceedingsDeadlineRule, type ProceedingsDeadlineFlag, type ProceedingsDeadlineRule } from "./proceedings-deadline";
import { proceedingsDeadlineFlagsFor } from "./proceedings-deadline-repo";
import { lotOwnerIds } from "./lot-owners";
import {
  proceedingsReminderContent,
  proceedingsReminderStage,
  remindable,
  stagesBefore,
  type ProceedingsReminderStage,
  type ProceedingsReminderWords,
} from "./proceedings-reminder";

const day = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v ?? "")).slice(0, 10);
/** A building's state as the packs read it ("Qld " is QLD). */
const normalState = (state: unknown) => String(state ?? "").trim().toUpperCase();

/** The states whose live pack has the rule and the reminder words (none while Queensland is pending; never NSW). */
export function statesWithProceedingsRule(): string[] {
  return liveSchemeRules()
    .filter((r) => proceedingsDeadlineRule(r.rules) != null && r.rules.DEBT_RECOVERY?.proceedingsReminder != null)
    .map((r) => normalState(r.pack.state));
}

/** A claimed stage, and what the row held before, to give the claim back if nothing was sent. */
export interface ProceedingsReminderClaim {
  id: string;
  stage: ProceedingsReminderStage;
  today: string;
  /** The stage and day held before, or null when the claim created the row. */
  previous: { stage: string; sentOn: string } | null;
}

/**
 * Claim a lot's reminder at `stage` (null when this run must not send it).
 * One row per lot and oldest unpaid due date: the first claim creates it, and
 * a later one moves it on only from an earlier stage, so a stage already sent
 * is never sent again.
 */
export async function claimProceedingsReminder(input: { schemeId: string; flag: ProceedingsDeadlineFlag; stage: ProceedingsReminderStage; today: string }): Promise<ProceedingsReminderClaim | null> {
  const { flag, stage, today } = input;
  const table = db.orm.public.ProceedingsDeadlineReminder;
  const existing = await table.where((r) => and(r.lotId.eq(flag.lotId), r.oldestDueOn.eq(flag.oldestUnpaidDueDate))).first();
  if (!existing) {
    try {
      const row = await table.create({ schemeId: input.schemeId, lotId: flag.lotId, oldestDueOn: flag.oldestUnpaidDueDate, deadlineOn: flag.deadline, lastStage: stage, lastSentOn: today });
      return { id: String(row.id), stage, today, previous: null };
    } catch (err) {
      const text = err instanceof Error ? `${err.message} ${JSON.stringify((err as { cause?: unknown; code?: unknown }).cause ?? (err as { code?: unknown }).code ?? "")}` : String(err);
      if (/23505|unique|duplicate key/i.test(text)) return null; // another run created it first
      throw err;
    }
  }
  const earlier = stagesBefore(stage);
  if (!earlier.length) return null;
  const n = await table.where((r) => and(r.id.eq(existing.id), r.lastStage.in(earlier))).updateAndCount({ lastStage: stage, lastSentOn: today, deadlineOn: flag.deadline });
  return n === 1 ? { id: String(existing.id), stage, today, previous: { stage: String(existing.lastStage), sentOn: day(existing.lastSentOn) } } : null;
}

/** Give a claim back when nothing was sent: the row goes back to its earlier stage, or is removed if the claim made it. */
export async function releaseProceedingsReminder(claim: ProceedingsReminderClaim): Promise<void> {
  const table = db.orm.public.ProceedingsDeadlineReminder;
  // Only while the row still holds this claim.
  if (claim.previous) {
    await table.where((r) => and(r.id.eq(claim.id), r.lastStage.eq(claim.stage), r.lastSentOn.eq(claim.today))).updateAndCount({ lastStage: claim.previous.stage, lastSentOn: claim.previous.sentOn });
  } else {
    await table.where((r) => and(r.id.eq(claim.id), r.lastStage.eq(claim.stage), r.lastSentOn.eq(claim.today))).deleteAndCount();
  }
}

/**
 * The email for one lot: to the building's advisers and committee, one
 * message each. Never to an owner of the lot (lotOwnerIds: an OWNER
 * membership of the lot, active or ended in the last 30 days). Returns the
 * number of emails the provider accepted; a failed email is logged.
 */
export async function notifyProceedingsDeadline(input: {
  schemeId: string;
  schemeName: string;
  flag: ProceedingsDeadlineFlag;
  rule: ProceedingsDeadlineRule;
  words: ProceedingsReminderWords;
  terms: Pick<StatutoryRules["TERMINOLOGY"], "levy" | "ownersCorporation">;
  now?: Date;
}): Promise<number> {
  const [members, owners] = await Promise.all([
    db.orm.public.SchemeMembership.where((m) => and(m.schemeId.eq(input.schemeId), m.role.in(["ADVISER", "COMMITTEE"]), m.isActive.eq(true))).limit(500).all(),
    lotOwnerIds(input.schemeId, input.flag.lotId, input.now),
  ]);
  const lotOwners = new Set(owners);
  const recipients = new Map<string, boolean>(); // profile id: adviser?
  for (const m of members) {
    if (lotOwners.has(m.profileId)) continue;
    recipients.set(m.profileId, recipients.get(m.profileId) === true || m.role === "ADVISER");
  }
  if (!recipients.size) return 0;
  const profiles = await db.orm.public.Profile.where((p) => p.id.in([...recipients.keys()])).limit(500).all();
  let sent = 0;
  for (const p of profiles) {
    if (!p.email) continue;
    const adviser = recipients.get(p.id) === true;
    const content = proceedingsReminderContent({ flag: input.flag, rule: input.rule, words: input.words, terms: input.terms, schemeName: input.schemeName, adviser, formatDate: auDate });
    try {
      const accepted = await sendEmail(
        complianceEmail({
          to: String(p.email),
          ...content,
          url: adviser ? `${siteUrl()}/adviser/schemes/${input.schemeId}/finance/debt-recovery` : `${siteUrl()}/owner`,
        }),
      );
      if (accepted) sent++;
    } catch (err) {
      logError("[proceedings deadline] email failed:", err);
    }
  }
  return sent;
}

/** Send today's reminders. Returns the number of lot reminders that reached at least one person. */
export async function runProceedingsDeadlineReminders(now: Date = new Date()): Promise<number> {
  let sent = 0;
  try {
    const states = new Set(statesWithProceedingsRule());
    // No live pack has the rule: nothing is read.
    if (!states.size) return 0;
    // Any letter case and spacing in the query, then the exact state as the packs read it.
    const found = await db.orm.public.Scheme.where((s) => and(s.isActive.eq(true), or(...[...states].map((st) => s.state.ilike(`%${st}%`))))).limit(20000).all();
    const schemes = found.filter((s) => states.has(normalState(s.state)));
    for (const scheme of schemes) {
      try {
        const { rules } = rulesForState(normalState(scheme.state));
        const rule = proceedingsDeadlineRule(rules);
        const words = rules.DEBT_RECOVERY?.proceedingsReminder;
        if (!rule || !words) continue;
        const today = todayIn(timeZoneOf(scheme), now);
        for (const flag of await proceedingsDeadlineFlagsFor(scheme.id, rule, today)) {
          try {
            // A deadline long passed (a building's first run at go-live) is left to the adviser page.
            if (!remindable(flag, today)) continue;
            const claim = await claimProceedingsReminder({ schemeId: scheme.id, flag, stage: proceedingsReminderStage(flag, today), today });
            if (!claim) continue;
            let delivered = 0;
            try {
              delivered = await notifyProceedingsDeadline({ schemeId: scheme.id, schemeName: String(scheme.name), flag, rule, words, terms: rules.TERMINOLOGY, now });
            } finally {
              // Nothing went out: give the stage back so the next run tries again.
              if (delivered === 0) await releaseProceedingsReminder(claim);
            }
            if (delivered > 0) sent++;
          } catch (err) {
            logError("[proceedings deadline] reminder failed for a lot:", err);
          }
        }
      } catch (err) {
        logError("[proceedings deadline] reminders failed for a building:", err);
      }
    }
  } catch (err) {
    logError("[proceedings deadline] reminders failed:", err);
  }
  return sent;
}
