"use server";

import { requireSchemeMembership, AuthorisationError } from "@/lib/auth/require-membership";
import { resolveDocumentUrl } from "@/lib/queries/document-url";

/** Short-lived signed URL for an owner to download a policy document. */
export async function getOwnerInsuranceDocumentUrlAction(
  schemeId: string,
  fileUrl: string,
): Promise<{ url?: string; error?: string }> {
  try {
    await requireSchemeMembership(schemeId, ["OWNER", "COMMITTEE", "ADVISER"]);
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    throw err;
  }
  try {
    return { url: await resolveDocumentUrl(fileUrl, 600) };
  } catch {
    return { error: "Failed to generate document URL." };
  }
}
