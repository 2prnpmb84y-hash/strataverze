import { NextResponse, type NextRequest } from "next/server";
import { NO_STORE } from "@/lib/http/no-store";
import { bearerMatches } from "@/lib/auth/secret-compare";
import { platformToday } from "@/lib/jurisdiction/time-zone";
import { runLevyNoticeDay } from "@/lib/levies/issue-notices";
import { runWorksDay } from "@/lib/works/daily";
import { runComplianceDay } from "@/lib/compliance/daily";
import { logError } from "@/lib/log";

/**
 * Levy notices (24 to 25 Oct 2026), every day: issue each planned notice
 * whose day has come (5 weeks before it falls due; the levy is posted dated
 * its due date), and resend any notice email that failed. Called by
 * Vercel Cron (see vercel.json), which sends CRON_SECRET as a bearer token.
 * A repeated call does no harm: each notice is claimed before it is issued.
 *
 * The same daily run closes works marketplace deadlines (works stage 3) and
 * tells the committee, and sends statutory deadline reminders (payment plan
 * replies); a failure there never stops the levy notices.
 */
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  if (!bearerMatches(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return new NextResponse("Unauthorized", { status: 401, headers: NO_STORE });
  }
  // Each building's day is worked out in its own time zone; this is StrataVerze's, for the report.
  const now = new Date();
  const today = platformToday(now);
  // First, and caught: the works run is quick, and neither run stops the other.
  let works: { interestClosed: number; quotesClosed: number } | { error: string };
  try {
    works = await runWorksDay();
  } catch (err) {
    logError("[cron] works marketplace day failed:", err);
    works = { error: "failed" };
  }
  const { recovered, issued, resent } = await runLevyNoticeDay(now);
  // After the levy notices, so reminders never hold them up.
  let compliance: { paymentPlanReminders: number } | { error: string };
  try {
    compliance = await runComplianceDay(now);
  } catch (err) {
    logError("[cron] compliance reminders failed:", err);
    compliance = { error: "failed" };
  }
  return NextResponse.json(
    {
      today,
      schedules: issued.length,
      issued: issued.reduce((s, r) => s + r.issued, 0),
      held: issued.filter((r) => r.held).map((r) => ({ scheduleId: r.scheduleId, missing: r.held })),
      awaitingConfirmation: issued.reduce((s, r) => s + r.awaitingConfirmation, 0),
      emailsResent: resent,
      leviesRecovered: recovered,
      works,
      compliance,
    },
    { headers: NO_STORE },
  );
}
