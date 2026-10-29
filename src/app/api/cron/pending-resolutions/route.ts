import { NextResponse, type NextRequest } from "next/server";
import { NO_STORE } from "@/lib/http/no-store";
import { bearerMatches } from "@/lib/auth/secret-compare";
import { platformToday } from "@/lib/jurisdiction/time-zone";
import { settleDuePendingResolutions } from "@/lib/meetings/pending-repo";
import { logError } from "@/lib/log";

/**
 * Pending resolutions (VIC, ACT and WA stage 2, PR 8b-i, 29 Oct 2026;
 * Matthew Wrigley's decision D11), every day: decide each resolution whose
 * period and the grace after it have ended (Victoria's interim resolutions,
 * the ACT's reduced quorum decisions; the grace is his decision of
 * 29 Oct 2026, review M1), judged on today in its building's time zone, and
 * again once its row is locked. Called by Vercel
 * Cron (see vercel.json) at 16:30 UTC, after midnight in every Australian
 * time zone, with CRON_SECRET as a bearer token. A separate route, so the
 * levy notices run and its response are unchanged. A repeated call does no
 * harm: each resolution is decided once, under its row lock. A failure is
 * caught and reported, never thrown.
 */
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  if (!bearerMatches(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return new NextResponse("Unauthorized", { status: 401, headers: NO_STORE });
  }
  const now = new Date();
  const today = platformToday(now);
  try {
    const { settled, waiting, blocked, failed } = await settleDuePendingResolutions({}, now);
    return NextResponse.json({ today, settled, waiting, blocked: blocked.length, failed }, { headers: NO_STORE });
  } catch (err) {
    logError("[cron] pending resolutions failed:", err);
    return NextResponse.json({ today, error: "failed" }, { status: 500, headers: NO_STORE });
  }
}
