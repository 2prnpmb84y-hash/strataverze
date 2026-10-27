import { NextResponse, type NextRequest } from "next/server";
import { NO_STORE } from "@/lib/http/no-store";
import { recordSecurityEventLater } from "@/lib/audit/security-audit";
import { db } from "@/prisma/db";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { canReadSchemeFinance } from "@/lib/finance/finance-access";
import { rulesForScheme } from "@/lib/jurisdiction/scheme-rules";

/** The locked statutory statements pack adopted at an AGM, exactly as stored. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ snapshotId: string }> }) {
  const profile = await getCurrentProfile();
  if (!profile) return new NextResponse("Sign in to view this document.", { status: 401, headers: NO_STORE });
  const { snapshotId } = await params;
  const snapshot = await db.orm.public.StatutoryPackSnapshot.where((s) => s.id.eq(snapshotId)).first();
  if (!snapshot) return new NextResponse("Not found", { status: 404, headers: NO_STORE });
  if (!(await canReadSchemeFinance(profile, snapshot.schemeId))) {
    await recordSecurityEventLater({
      action: "access.denied",
      outcome: "denied",
      actorProfileId: profile.id,
      schemeId: snapshot.schemeId,
      resourceType: "StatutoryPackSnapshot",
      resourceId: snapshot.id,
      reason: "no finance access on this building",
    });
    return new NextResponse("Not found", { status: 404, headers: NO_STORE });
  }
  if (!(await rulesForScheme(snapshot.schemeId)).rules.FEATURES.keyFinancialInformation) return new NextResponse("Not found", { status: 404, headers: NO_STORE });
  await recordSecurityEventLater({
    action: "export.statutory_snapshot",
    outcome: "allowed",
    actorProfileId: profile.id,
    schemeId: snapshot.schemeId,
    resourceType: "StatutoryPackSnapshot",
    resourceId: snapshot.id,
  });
  return new NextResponse(snapshot.content, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="statutory-statements-FY${snapshot.financialYear}.json"`,
      "X-Content-SHA256": snapshot.contentHash,
      "Cache-Control": "private, no-store",
    },
  });
}
