import { NextResponse, type NextRequest } from "next/server";
import { NO_STORE } from "@/lib/http/no-store";
import { bearerMatches } from "@/lib/auth/secret-compare";
import { sydneyToday } from "@/lib/finance/interest-setting";
import { issueDueNotices } from "@/lib/levies/issue-notices";

/**
 * Levy notices (24 Oct 2026): every day, issue each planned notice whose day
 * has come, 5 weeks before it falls due. Called by Vercel Cron (see
 * vercel.json), which sends CRON_SECRET as a bearer token. A repeated call
 * does no harm: only notices still planned (DRAFT) are issued.
 */
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  if (!bearerMatches(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return new NextResponse("Unauthorized", { status: 401, headers: NO_STORE });
  }
  const today = sydneyToday();
  const results = await issueDueNotices(today);
  return NextResponse.json(
    {
      today,
      schedules: results.length,
      issued: results.reduce((s, r) => s + r.issued, 0),
      held: results.filter((r) => r.held).map((r) => ({ scheduleId: r.scheduleId, missing: r.held })),
      dueDatesMoved: results.reduce((s, r) => s + r.moved, 0),
    },
    { headers: NO_STORE },
  );
}
