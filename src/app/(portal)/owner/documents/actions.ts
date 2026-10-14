"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { createDocument } from "@/lib/queries/documents";
import { createClient } from "@/lib/supabase/server";

export type DocumentFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

const CATEGORIES = [
  "MINUTES",
  "INSURANCE",
  "BYLAW",
  "FINANCIAL",
  "COMPLIANCE",
  "OTHER",
];

export async function uploadDocumentAction(
  schemeId: string,
  _prev: DocumentFormState,
  formData: FormData,
): Promise<DocumentFormState> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "You must be signed in." };

  const title = (formData.get("title") as string)?.trim();
  const description = (formData.get("description") as string)?.trim();
  const category = formData.get("category") as string;
  const file = formData.get("file") as File | null;

  const errors: Record<string, string> = {};
  if (!title) errors.title = "Title is required.";
  if (!category || !CATEGORIES.includes(category))
    errors.category = "Select a valid category.";
  if (!file || file.size === 0) errors.file = "Please select a file to upload.";
  if (file && file.size > 10 * 1024 * 1024)
    errors.file = "File must be smaller than 10 MB.";

  if (Object.keys(errors).length > 0) return { fieldErrors: errors };

  try {
    const supabase = await createClient();
    const ext = file!.name.split(".").pop() ?? "bin";
    const storagePath = `schemes/${schemeId}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("documents")
      .upload(storagePath, file!, {
        contentType: file!.type,
        upsert: false,
      });

    if (uploadError) {
      return { error: `Upload failed: ${uploadError.message}` };
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("documents").getPublicUrl(storagePath);

    await createDocument({
      schemeId,
      title,
      description: description || undefined,
      category,
      fileUrl: publicUrl,
      fileName: file!.name,
      fileSize: file!.size,
      mimeType: file!.type || undefined,
      uploadedBy: profile.id,
    });

    revalidatePath("/owner/documents");
    redirect("/owner/documents");
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
    return { error: "Failed to upload document. Please try again." };
  }
}
