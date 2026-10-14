import { db } from "@/prisma/db";
import { createClient } from "@/lib/supabase/server";

/**
 * Get the currently authenticated user's profile.
 * Creates a profile record if one doesn't exist yet (first login).
 */
export async function getCurrentProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  // Try to find existing profile
  const existing = await db.orm.public.Profile
    .where((p) => p.authId.eq(user.id))
    .first();

  if (existing) return existing;

  // Auto-create on first login
  const profile = await db.orm.public.Profile.create({
    authId: user.id,
    email: user.email ?? "",
    firstName: "",
    lastName: "",
  });

  return profile;
}

/**
 * Get a profile by its primary key.
 */
export async function getProfileById(profileId: string) {
  return db.orm.public.Profile.first({ id: profileId });
}

/**
 * Update a profile.
 */
export async function updateProfile(
  profileId: string,
  data: Partial<{
    firstName: string;
    lastName: string;
    phone: string | null;
    avatarUrl: string | null;
  }>,
) {
  return db.orm.public.Profile.where({ id: profileId }).update(data);
}
