/**
 * The works marketplace's daily job (works stage 3, 25 Oct 2026): close
 * deadlines that have passed and tell the committee and the Adviser once.
 * It runs from the daily cron at /api/cron/levy-notices (7 am Sydney), so
 * no extra cron job is needed; deadlines themselves take effect on time,
 * because every page and action compares them with the clock.
 */
import { logError } from "@/lib/log";
import { sweepDeadlines } from "./marketplace";
import { notifyInterestClosed, notifyQuotesIn } from "./notify";

export async function runWorksDay(now = new Date()) {
  const { interestClosed, quotesClosed } = await sweepDeadlines(now);
  for (const r of interestClosed) {
    try {
      await notifyInterestClosed(r);
    } catch (err) {
      logError("[works] interest closed email failed:", err);
    }
  }
  for (const r of quotesClosed) {
    try {
      await notifyQuotesIn({ ...r, allIn: false });
    } catch (err) {
      logError("[works] quotes closed email failed:", err);
    }
  }
  return { interestClosed: interestClosed.length, quotesClosed: quotesClosed.length };
}
