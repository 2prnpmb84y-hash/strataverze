"use server";

import { revalidatePath } from "next/cache";
import { AuthorisationError } from "@/lib/auth/require-membership";
import { requireSchemeAccessOrAdmin } from "@/lib/auth/building-lock";
import { uploadErrorMessage } from "@/lib/storage/uploads";
import { setSchemePhoto } from "@/lib/schemes/photos";

/**
 * Make an uploaded photo the building's property photo (25 Oct 2026). The
 * building's Adviser, or StrataVerze staff (who onboard buildings). The
 * upload was staged with the scheme_photo purpose for this same building.
 */
export async function setSchemePhotoAction(schemeId: string, uploadId: string): Promise<{ ok?: boolean; error?: string }> {
  try {
    const { profile, isAdmin } = await requireSchemeAccessOrAdmin(String(schemeId ?? ""), "scheme.manage");
    await setSchemePhoto({ schemeId, uploadId: String(uploadId ?? ""), actorId: profile.id, actorRole: isAdmin ? "platform_admin" : "ADVISER" });
    revalidatePath(`/adviser/schemes/${schemeId}`, "layout");
    revalidatePath("/adviser");
    return { ok: true };
  } catch (err) {
    const message = uploadErrorMessage(err);
    if (message) return { error: message };
    if (err instanceof AuthorisationError) return { error: err.message };
    console.error("[scheme-photo] could not save:", err instanceof Error ? err.name : "error");
    return { error: "The photo could not be saved. Please try again." };
  }
}
