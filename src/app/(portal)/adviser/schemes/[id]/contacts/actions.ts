"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/queries/profiles";
import {
  createContact,
  updateContact,
  deleteContact,
} from "@/lib/queries/contacts";
import { logActivity } from "@/lib/queries/activity-log";

export type ContactFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

const CATEGORIES = [
  "PLUMBER",
  "ELECTRICIAN",
  "BUILDER",
  "GARDENER",
  "CLEANER",
  "LOCKSMITH",
  "PEST_CONTROL",
  "FIRE_SAFETY",
  "LIFT",
  "POOL",
  "BODY_CORPORATE",
  "LEGAL",
  "ACCOUNTING",
  "INSURANCE_BROKER",
  "OTHER",
];

export async function createContactAction(
  schemeId: string,
  _prev: ContactFormState,
  formData: FormData,
): Promise<ContactFormState> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "You must be signed in." };

  const name = (formData.get("name") as string)?.trim();
  const company = (formData.get("company") as string)?.trim() || undefined;
  const category = formData.get("category") as string;
  const phone = (formData.get("phone") as string)?.trim() || undefined;
  const email = (formData.get("email") as string)?.trim() || undefined;
  const address = (formData.get("address") as string)?.trim() || undefined;
  const notes = (formData.get("notes") as string)?.trim() || undefined;
  const isPreferred = formData.get("isPreferred") === "on";

  const errors: Record<string, string> = {};
  if (!name) errors.name = "Contact name is required.";
  if (!category || !CATEGORIES.includes(category))
    errors.category = "Select a valid category.";
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    errors.email = "Enter a valid email address.";

  if (Object.keys(errors).length > 0) return { fieldErrors: errors };

  try {
    const contact = await createContact({
      schemeId,
      name,
      company,
      category,
      phone,
      email,
      address,
      notes,
      isPreferred,
    });

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "CONTACT_CREATED",
      entityType: "Contact",
      entityId: contact.id,
      metadata: { name, category },
    });

    revalidatePath(`/adviser/schemes/${schemeId}`);
    redirect(`/adviser/schemes/${schemeId}/contacts/${contact.id}`);
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
    return { error: "Failed to create contact. Please try again." };
  }
}

export async function updateContactAction(
  schemeId: string,
  contactId: string,
  _prev: ContactFormState,
  formData: FormData,
): Promise<ContactFormState> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "You must be signed in." };

  const name = (formData.get("name") as string)?.trim();
  const company = (formData.get("company") as string)?.trim() || undefined;
  const category = formData.get("category") as string;
  const phone = (formData.get("phone") as string)?.trim() || undefined;
  const email = (formData.get("email") as string)?.trim() || undefined;
  const address = (formData.get("address") as string)?.trim() || undefined;
  const notes = (formData.get("notes") as string)?.trim() || undefined;
  const isPreferred = formData.get("isPreferred") === "on";

  const errors: Record<string, string> = {};
  if (!name) errors.name = "Contact name is required.";
  if (!category || !CATEGORIES.includes(category))
    errors.category = "Select a valid category.";
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    errors.email = "Enter a valid email address.";

  if (Object.keys(errors).length > 0) return { fieldErrors: errors };

  try {
    await updateContact(contactId, {
      name,
      company: company ?? null,
      category,
      phone: phone ?? null,
      email: email ?? null,
      address: address ?? null,
      notes: notes ?? null,
      isPreferred,
    });

    await logActivity({
      schemeId,
      actorId: profile.id,
      action: "CONTACT_UPDATED",
      entityType: "Contact",
      entityId: contactId,
      metadata: { name, category },
    });

    revalidatePath(`/adviser/schemes/${schemeId}/contacts/${contactId}`);
    return {};
  } catch {
    return { error: "Failed to update contact. Please try again." };
  }
}

export async function deleteContactAction(
  schemeId: string,
  contactId: string,
) {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "You must be signed in." };

  try {
    await deleteContact(contactId);
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
    return { error: "Failed to delete contact." };
  }
}
