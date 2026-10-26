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
 */
import { and, or } from "@prisma/orm-postgres/orm-client";
import { db } from "@/prisma/db";
import { schemeTimeZones } from "@/lib/jurisdiction/scheme-time";
import { todayIn } from "@/lib/jurisdiction/time-zone";
import { logError } from "@/lib/log";
import { daysToReply } from "@/lib/debt-recovery/payment-plans";
import { notifyPaymentPlanReplyDue } from "@/lib/debt-recovery/payment-plan-notify";
import { reminderDue } from "./reminder-days";

const day = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v ?? "")).slice(0, 10);

export async function runComplianceDay(now: Date = new Date()) {
  let paymentPlanReminders = 0;
  try {
    // Requests not yet decided, and decided ones with no reply date recorded.
    const open = await db.orm.public.PaymentPlanRequest.where((r) => r.repliedOn.isNull()).orderBy((r) => r.createdAt.asc()).limit(5000).all();
    const waiting = open.filter((r) => r.status === "RECEIVED" || r.status === "APPROVED" || r.status === "REFUSED");
    const zones = await schemeTimeZones([...new Set(waiting.map((r) => r.schemeId))]);
    for (const r of waiting) {
      const tz = zones.get(r.schemeId);
      if (!tz) continue;
      const today = todayIn(tz, now);
      const kind = reminderDue(daysToReply(day(r.replyDueOn), today));
      if (!kind) continue;
      try {
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
  return { paymentPlanReminders };
}
