import { logError } from "@/lib/log";
/**
 * Refused requests for finance documents (TC-011): answer 403 Forbidden and
 * record the attempt in the scheme's activity log. A document that does not
 * exist is still 404, so only a real document's refusal is logged.
 */
import { NextResponse } from "next/server";
import { NO_STORE } from "@/lib/http/no-store";
import { logActivity, type ActivityEntityType } from "@/lib/queries/activity-log";

export async function forbidden(input: {
  schemeId: string;
  actorId: string;
  entityType: ActivityEntityType;
  entityId: string | null;
  what: string;
}): Promise<NextResponse> {
  try {
    await logActivity({
      schemeId: input.schemeId,
      actorId: input.actorId,
      action: "FINANCIAL_DOCUMENT_ACCESS_DENIED",
      entityType: input.entityType,
      entityId: input.entityId ?? undefined,
      metadata: { what: input.what },
    });
  } catch (err) {
    // The refusal stands even if it cannot be logged (for example, an unknown scheme id).
    logError("Could not log a refused document request:", err);
  }
  return new NextResponse("You do not have access to this document.", { status: 403, headers: NO_STORE });
}
