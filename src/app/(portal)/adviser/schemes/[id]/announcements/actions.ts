"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { createAnnouncement, updateAnnouncement, deleteAnnouncement } from "@/lib/queries/announcements";
import { getSchemeNameById, getMemberEmailsForScheme } from "@/lib/queries/schemes";
import { notifyAnnouncementPublished } from "@/lib/notifications";
import { logActivity } from "@/lib/queries/activity-log";

export type AnnouncementFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

const PRIORITIES = ["NORMAL", "IMPORTANT", "URGENT"];

export async function createAnnouncementAction(
  schemeId: string,
  _prev: AnnouncementFormState,
  formData: FormData,
): Promise<AnnouncementFormState> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "You must be signed in." };

  const title = (formData.get("title") as string)?.trim();
  const body = (formData.get("body") as string)?.trim();
  const priority = formData.get("priority") as string;
  const isPinned = formData.get("isPinned") === "on";
  const expiresAt = (formData.get("expiresAt") as string)?.trim() || undefined;

  const errors: Record<string, string> = {};
  if (!title) errors.title = "Title is required.";
  if (!body) errors.body = "Body is required.";
  if (!priority || !PRIORITIES.includes(priority))
    errors.priority = "Select a valid priority.";

  if (Object.keys(errors).length > 0) return { fieldErrors: errors };

  try {
    const announcement = await createAnnouncement({
      schemeId,
      authorId: profile.id,
      title,
      body,
      priority,
      isPinned,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
    });

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "ANNOUNCEMENT_PUBLISHED",
      entityType: "Announcement",
      entityId: announcement.id,
      metadata: { title, priority },
    });

    // Send email notification to all scheme members (non-blocking)
    const schemeName = await getSchemeNameById(schemeId);
    const memberEmails = await getMemberEmailsForScheme(schemeId);
    const authorName = [profile.firstName, profile.lastName]
      .filter(Boolean)
      .join(" ") || "A scheme member";

    if (memberEmails.length > 0) {
      notifyAnnouncementPublished({
        recipientEmails: memberEmails,
        schemeName,
        title,
        body,
        priority,
        authorName,
        portalPath: `/adviser/schemes/${schemeId}/announcements`,
        announcementId: announcement.id,
      }).catch(() => {});
    }

    revalidatePath(`/adviser/schemes/${schemeId}`);
    redirect(`/adviser/schemes/${schemeId}/announcements/${announcement.id}`);
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      "digest" in err &&
      typeof (err as { digest: unknown }).digest === "string" &&
      (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
    ) {
      throw err;
    }
    return { error: "Failed to create announcement. Please try again." };
  }
}

export async function updateAnnouncementAction(
  schemeId: string,
  announcementId: string,
  _prev: AnnouncementFormState,
  formData: FormData,
): Promise<AnnouncementFormState> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "You must be signed in." };

  const title = (formData.get("title") as string)?.trim();
  const body = (formData.get("body") as string)?.trim();
  const priority = formData.get("priority") as string;
  const isPinned = formData.get("isPinned") === "on";
  const expiresAt = (formData.get("expiresAt") as string)?.trim() || undefined;

  const errors: Record<string, string> = {};
  if (!title) errors.title = "Title is required.";
  if (!body) errors.body = "Body is required.";
  if (!priority || !PRIORITIES.includes(priority))
    errors.priority = "Select a valid priority.";

  if (Object.keys(errors).length > 0) return { fieldErrors: errors };

  try {
    await updateAnnouncement(announcementId, {
      title,
      body,
      priority,
      isPinned,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
    });
    revalidatePath(`/adviser/schemes/${schemeId}/announcements/${announcementId}`);
    return {};
  } catch {
    return { error: "Failed to update announcement. Please try again." };
  }
}

export async function deleteAnnouncementAction(
  schemeId: string,
  announcementId: string,
) {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "You must be signed in." };

  try {
    await deleteAnnouncement(announcementId);
    revalidatePath(`/adviser/schemes/${schemeId}`);
    redirect(`/adviser/schemes/${schemeId}`);
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      "digest" in err &&
      typeof (err as { digest: unknown }).digest === "string" &&
      (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
    ) {
      throw err;
    }
    return { error: "Failed to delete announcement." };
  }
}
