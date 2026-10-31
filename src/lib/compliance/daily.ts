/**
 * Statutory deadline reminders, run once a day from the daily cron, after
 * the levy notices. Each reminder is claimed for the day before it is sent,
 * so a repeated run sends it once. Each
 * building's day is its own (its time zone). A failure for one building or
 * one kind of reminder never stops the rest (it is logged).
 *
 * - Payment plan requests: the written reply is due within the rule pack's
 *   reply period of a complete request. The advisers and the committee are
 *   reminded until a decision and reply date are recorded.
 * - Committee training: each committee member is reminded before their
 *   date; when it passes, the member and the advisers are told.
 * - Strata Hub annual report: the advisers and the committee are reminded
 *   before it is due after each AGM, and after, until it is recorded.
 * - The deadline to start proceedings for a long outstanding debt (the
 *   Queensland 2 year rule): the advisers and the committee are reminded when
 *   a lot is flagged, before the deadline and once after, until proceedings
 *   are recorded (src/lib/debt-recovery/proceedings-reminder-run.ts).
 *
 * Each kind runs only for buildings whose rule pack has the workflow (FEATURES)
 * or, for the proceedings deadline, the rule (DEBT_RECOVERY.mustStartProceedings),
 * and never for a switched off scheme (schemes.is_active = false).
 */
import { and, or } from "@prisma/orm-postgres/orm-client";
import { db } from "@/prisma/db";
import { rulesForState } from "@/lib/jurisdiction/scheme-rules";
import { schemeTimeZones } from "@/lib/jurisdiction/scheme-time";
import { todayIn } from "@/lib/jurisdiction/time-zone";
import { logError } from "@/lib/log";
import { daysToReply } from "@/lib/debt-recovery/payment-plans";
import { notifyPaymentPlanReplyDue } from "@/lib/debt-recovery/payment-plan-notify";
import { reminderDue } from "./reminder-days";
import { claimTrainingReminder, committeeTrainingRows } from "@/lib/governance/committee-training-store";
import { notifyTrainingDue, notifyTrainingOverdue } from "@/lib/governance/training-notify";
import { annualReportOverview, claimReportReminder } from "./annual-report-store";
import { notifyAnnualReportDue } from "./report-notify";
import { runProceedingsDeadlineReminders } from "@/lib/debt-recovery/proceedings-reminder-run";
import { activeSchemesOnly, inactiveSchemeIds } from "@/lib/schemes/inactive";

const day = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v ?? "")).slice(0, 10);

export async function runComplianceDay(now: Date = new Date()) {
  let paymentPlanReminders = 0;
  try {
    // Requests not yet decided, and decided ones with no reply date recorded.
    const inactive = await inactiveSchemeIds();
    const open = await db.orm.public.PaymentPlanRequest.where((r) => and(r.repliedOn.isNull(), ...activeSchemesOnly(r.schemeId, inactive))).orderBy((r) => r.createdAt.asc()).limit(5000).all();
    const waiting = open.filter((r) => r.status === "RECEIVED" || r.status === "APPROVED" || r.status === "REFUSED");
    const ids = [...new Set(waiting.map((r) => r.schemeId))];
    const zones = await schemeTimeZones(ids);
    const states = new Map((ids.length ? await db.orm.public.Scheme.where((s) => s.id.in(ids)).limit(ids.length).all() : []).map((s) => [s.id, s.state]));
    for (const r of waiting) {
      const tz = zones.get(r.schemeId);
      if (!tz) continue;
      const today = todayIn(tz, now);
      const kind = reminderDue(daysToReply(day(r.replyDueOn), today));
      if (!kind) continue;
      try {
        // Only buildings whose pack has the payment plan workflow.
        if (!rulesForState(states.get(r.schemeId)).rules.FEATURES.statutoryPaymentPlans) continue;
        // Claim today's reminder, so a repeated run (a retried cron) sends none.
        const claimed = await db.orm.public.PaymentPlanRequest.where((x) => and(x.id.eq(r.id), or(x.lastReminderOn.isNull(), x.lastReminderOn.lt(today)))).updateAndCount({ lastReminderOn: today });
        if (claimed !== 1) continue;
        await notifyPaymentPlanReplyDue({ schemeId: r.schemeId, requestId: r.id, lotId: r.lotId, replyDueOn: day(r.replyDueOn), overdue: kind === "OVERDUE", decided: r.status !== "RECEIVED" });
        paymentPlanReminders++;
      } catch (err) {
        logError("[compliance] payment plan reminder failed:", err);
      }
    }
  } catch (err) {
    logError("[compliance] payment plan reminders failed:", err);
  }
  const trainingReminders = await committeeTrainingReminders(now);
  const annualReportReminders = await annualReportReminders_(now);
  // Catches its own failures, so it never stops the others.
  const proceedingsReminders = await runProceedingsDeadlineReminders(now);
  return { paymentPlanReminders, trainingReminders, annualReportReminders, proceedingsReminders };
}

async function annualReportReminders_(now: Date) {
  let sent = 0;
  try {
    // Only buildings with an AGM in StrataVerze or a report row: the others have nothing due yet.
    const [agmMeetings, reportRows] = await Promise.all([
      db.orm.public.Meeting.where((m) => and(m.meetingType.in(["AGM", "FIRST_AGM"]), m.status.in(["IN_PROGRESS", "MINUTES_DRAFT", "PUBLISHED"]), m.deletedAt.isNull())).limit(20000).all(),
      db.orm.public.AnnualReport.where((r) => r.reportedOn.isNull()).limit(20000).all(),
    ]);
    const ids = [...new Set([...agmMeetings.map((m) => m.schemeId), ...reportRows.map((r) => r.schemeId)])];
    const schemes = ids.length ? await db.orm.public.Scheme.where((s) => and(s.id.in(ids), s.isActive.eq(true))).limit(ids.length).all() : [];
    for (const scheme of schemes) {
      try {
        const o = await annualReportOverview(scheme.id, now, { info: false });
        if (!o || !o.lastAgmOn || !o.dueOn || o.daysLeft == null || (o.status !== "DUE" && o.status !== "OVERDUE")) continue;
        const kind = reminderDue(o.daysLeft);
        if (!kind) continue;
        if (!(await claimReportReminder({ schemeId: scheme.id, agmOn: o.lastAgmOn, today: o.today }))) continue;
        await notifyAnnualReportDue({ schemeId: scheme.id, schemeName: String(scheme.name), agmOn: o.lastAgmOn, dueOn: o.dueOn, overdue: kind === "OVERDUE", portal: o.rules.portal, penalty: o.rules.penalty });
        sent++;
      } catch (err) {
        logError("[compliance] annual report reminder failed for a scheme:", err);
      }
    }
  } catch (err) {
    logError("[compliance] annual report reminders failed:", err);
  }
  return sent;
}

async function committeeTrainingReminders(now: Date) {
  let sent = 0;
  try {
    const inactive = await inactiveSchemeIds();
    const members = await db.orm.public.SchemeMembership.where((m) => and(m.role.eq("COMMITTEE"), m.isActive.eq(true), ...activeSchemesOnly(m.schemeId, inactive))).limit(10000).all();
    for (const schemeId of new Set(members.map((m) => m.schemeId))) {
      try {
        const data = await committeeTrainingRows(schemeId, now);
        if (!data) continue;
        for (const row of data.rows) {
          if (row.daysLeft == null) continue;
          const kind = reminderDue(row.daysLeft);
          const wanted = (row.status === "DUE" && kind === "UPCOMING") || (row.status === "OVERDUE" && kind === "OVERDUE");
          if (!wanted) continue;
          try {
            // Claim today's reminder, so a repeated run (a retried cron) sends none.
            if (!(await claimTrainingReminder({ schemeId, profileId: row.profileId, today: data.today }))) continue;
            if (row.status === "DUE") await notifyTrainingDue({ schemeName: String(data.scheme.name), row, course: data.rules.course, consequence: data.rules.consequence, helpUrl: data.rules.helpUrl });
            else await notifyTrainingOverdue({ schemeId, schemeName: String(data.scheme.name), row, consequence: data.rules.consequence });
            sent++;
          } catch (err) {
            logError("[compliance] committee training reminder failed:", err);
          }
        }
      } catch (err) {
        logError("[compliance] committee training reminders failed for a scheme:", err);
      }
    }
  } catch (err) {
    logError("[compliance] committee training reminders failed:", err);
  }
  return sent;
}
