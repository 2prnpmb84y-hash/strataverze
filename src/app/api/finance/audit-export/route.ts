import { NextResponse, type NextRequest } from "next/server";
import { NO_STORE, noStore } from "@/lib/http/no-store";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { buildAuditExport } from "@/lib/finance/audit-export";
import { canReadSchemeFinance } from "@/lib/finance/finance-access";
import { logActivity } from "@/lib/queries/activity-log";
import { requireRecentMfa, StepUpRequiredError } from "@/lib/auth/mfa-enforcement";

/** The audit export zip for a scheme and financial year (?schemeId=&year=). */
export async function GET(request: NextRequest) {
  const profile = await getCurrentProfile();
  if (!profile) return new NextResponse("Sign in to download the audit export.", { status: 401, headers: NO_STORE });
  const schemeId = request.nextUrl.searchParams.get("schemeId") ?? "";
  const year = Number(request.nextUrl.searchParams.get("year"));
  if (!/^[0-9a-f-]{36}$/i.test(schemeId) || !Number.isInteger(year) || year < 2000 || year > 2100) {
    return new NextResponse("Choose a scheme and financial year.", { status: 400, headers: NO_STORE });
  }
  if (!(await canReadSchemeFinance(profile, schemeId))) return new NextResponse("Not found", { status: 404, headers: NO_STORE });
  // An export of the whole ledger: needs an authenticator check in the last
  // 15 minutes. Send the user to verify, then straight back to this download.
  try {
    await requireRecentMfa();
  } catch (err) {
    if (err instanceof StepUpRequiredError) {
      const back = `${request.nextUrl.pathname}${request.nextUrl.search}`;
      return noStore(NextResponse.redirect(new URL(`/mfa?next=${encodeURIComponent(back)}`, request.nextUrl), 303));
    }
    throw err;
  }
  const { fileName, zip } = await buildAuditExport(schemeId, year);
  await logActivity({ schemeId, actorId: profile.id, action: "AUDIT_EXPORT_DOWNLOADED", entityType: "Scheme", entityId: schemeId, metadata: { financialYear: year } });
  return new NextResponse(Buffer.from(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
