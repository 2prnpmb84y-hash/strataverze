"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSchemeMembership, AuthorisationError } from "@/lib/auth/require-membership";
import {
  createLevy,
  updateLevy,
  deleteLevy,
  issueLevy,
  markLevyItemPaid,
  getLevyById,
} from "@/lib/queries/levies";
import { logActivity } from "@/lib/queries/activity-log";
import { getSchemeNameById } from "@/lib/queries/schemes";
import { and, or } from "@prisma/orm-postgres/orm-client";
import { notifyLevyIssued } from "@/lib/notifications";

export type LevyFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

const LEVY_TYPES = ["ORDINARY", "SPECIAL"];

function validateLevyForm(formData: FormData) {
  const errors: Record<string, string> = {};

  const title = formData.get("title") as string | null;
  const totalAmount = formData.get("totalAmount") as string | null;
  const dueDate = formData.get("dueDate") as string | null;
  const levyType = formData.get("levyType") as string | null;

  if (!title?.trim()) errors.title = "Title is required.";
  if (!totalAmount || Number(totalAmount) <= 0)
    errors.totalAmount = "Total amount must be greater than zero.";
  if (!dueDate) errors.dueDate = "Due date is required.";
  if (levyType && !LEVY_TYPES.includes(levyType))
    errors.levyType = "Select a valid levy type.";

  return {
    errors,
    isValid: Object.keys(errors).length === 0,
    data: {
      title: title?.trim() ?? "",
      description: (formData.get("description") as string)?.trim() || undefined,
      totalAmount: Number(totalAmount),
      dueDate: new Date(dueDate ?? "").toISOString(),
      levyType: levyType ?? "ORDINARY",
    },
  };
}

export async function createLevyAction(
  schemeId: string,
  _prev: LevyFormState,
  formData: FormData,
): Promise<LevyFormState> {
  const { errors, isValid, data } = validateLevyForm(formData);
  if (!isValid) return { fieldErrors: errors };

  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);

    const levy = await createLevy({ ...data, schemeId });
    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "LEVY_CREATED",
      entityType: "Levy",
      entityId: levy.id,
      metadata: { title: data.title, totalAmount: data.totalAmount },
    });
    revalidatePath(`/adviser/schemes/${schemeId}`);
    redirect(`/adviser/schemes/${schemeId}/levies/${levy.id}`);
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
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to create levy. Please try again." };
  }
}

export async function updateLevyAction(
  schemeId: string,
  levyId: string,
  _prev: LevyFormState,
  formData: FormData,
): Promise<LevyFormState> {
  const { errors, isValid, data } = validateLevyForm(formData);
  if (!isValid) return { fieldErrors: errors };

  try {
    await requireSchemeMembership(schemeId, ["ADVISER"]);

    await updateLevy(levyId, data);
    revalidatePath(`/adviser/schemes/${schemeId}/levies/${levyId}`);
    return {};
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to update levy. Please try again." };
  }
}

export async function deleteLevyAction(schemeId: string, levyId: string) {
  try {
    await requireSchemeMembership(schemeId, ["ADVISER"]);

    await deleteLevy(levyId);
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
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to delete levy." };
  }
}

export async function issueLevyAction(schemeId: string, levyId: string) {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);

    await issueLevy(levyId);
    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "LEVY_ISSUED",
      entityType: "Levy",
      entityId: levyId,
    });

    // Send email notifications to lot owners (non-blocking)
    const levy = await getLevyById(levyId);
    if (levy) {
      const schemeName = await getSchemeNameById(schemeId);

      // Batch-fetch lot owners for all levy items in a single query
      const { db } = await import("@/prisma/db");
      const lotIds = levy.items.map((item) => item.lotId);
      const allMemberships = lotIds.length > 0
        ? await db.orm.public.SchemeMembership
            .where((m) =>
              and(
                or(...lotIds.map((lid) => m.lotId.eq(lid))),
                m.role.eq("OWNER"),
                m.isActive.eq(true),
              ),
            )
            .include("profile")
            .all()
        : [];

      // Group memberships by lotId for amount lookup
      const membershipsByLot = new Map<string, typeof allMemberships>();
      for (const ms of allMemberships) {
        const lid = ms.lotId as string;
        if (!membershipsByLot.has(lid)) membershipsByLot.set(lid, []);
        membershipsByLot.get(lid)!.push(ms);
      }

      for (const item of levy.items) {
        const lotMembers = membershipsByLot.get(item.lotId) ?? [];
        for (const membership of lotMembers) {
          if (membership.profile.email) {
            const ownerName = [membership.profile.firstName, membership.profile.lastName]
              .filter(Boolean)
              .join(" ") || "Owner";

            notifyLevyIssued({
              recipientEmail: membership.profile.email,
              ownerName,
              schemeName,
              levyTitle: levy.title,
              amount: String(item.amount),
              dueDate: new Date(String(levy.dueDate)),
              levyId,
            }).catch(() => {});
          }
        }
      }
    }

    revalidatePath(`/adviser/schemes/${schemeId}/levies/${levyId}`);
    return {};
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to issue levy." };
  }
}

export async function markItemPaidAction(
  schemeId: string,
  levyId: string,
  itemId: string,
  amount: number,
) {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);

    await markLevyItemPaid(itemId, amount);
    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "LEVY_PAYMENT_RECORDED",
      entityType: "LevyItem",
      entityId: itemId,
      metadata: { levyId, amount },
    });
    revalidatePath(`/adviser/schemes/${schemeId}/levies/${levyId}`);
    return {};
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to record payment." };
  }
}
