import { NextResponse, type NextRequest } from "next/server";
import { NO_STORE } from "@/lib/http/no-store";
import { bearerMatches } from "@/lib/auth/secret-compare";
import { sydneyToday } from "@/lib/finance/interest-setting";
import { runLevyNoticeDay } from "@/lib/levies/issue-notices";

/**
 * Levy notices (24 to 25 Oct 2026), every day: issue each planned notice
 * whose day has come (5 weeks before it falls due; the levy is posted dated
 * its due date), and resend any notice email that failed. Called by
 * Vercel Cron (see vercel.json), which sends CRON_SECRET as a bearer token.
 * A repeated call does no harm: each notice is claimed before it is issued.
 */
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  if (!bearerMatches(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return new NextResponse("Unauthorized", { status: 401, headers: NO_STORE });
  }
  const today = sydneyToday();
  const { recovered, issued, resent } = await runLevyNoticeDay(today);
  return NextResponse.json(
    {
      today,
      schedules: issued.length,
      issued: issued.reduce((s, r) => s + r.issued, 0),
      held: issued.filter((r) => r.held).map((r) => ({ scheduleId: r.scheduleId, missing: r.held })),
      awaitingConfirmation: issued.reduce((s, r) => s + r.awaitingConfirmation, 0),
      emailsResent: resent,
      leviesRecovered: recovered,
    },
    { headers: NO_STORE },
  );
}
