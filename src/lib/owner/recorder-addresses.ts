import { db } from "@/prisma/db";
import { createAdminClient } from "@/lib/supabase/admin";
import { accountAddresses } from "./own-address";

/**
 * A person's addresses as they are now, from their profile and their Auth user
 * (Supabase admin API), for someone who is not the signed-in user: the
 * recorder of a held change of owner, re-checked when it is confirmed (H-1,
 * review L1, L4). Called by confirmOwnerChangeAction, after
 * requireRolesOrAdmin(["ADVISER"]) and the step-up check, and for the card
 * the Adviser and StrataVerze review it on (the Adviser's lot page and
 * /admin/owner-changes, both checked first); never for the committee's view.
 * Only the normalised addresses leave it. Throws if the Auth user cannot be
 * read, so a caller fails closed.
 */
export async function currentAddressesOf(profileId: string): Promise<Set<string>> {
  const profile = await db.orm.public.Profile.where((p) => p.id.eq(profileId)).first();
  if (!profile) throw new Error("profile not found");
  const { data, error } = await createAdminClient().auth.admin.getUserById(String(profile.authId));
  if (error || !data?.user) throw new Error("auth user could not be read");
  return accountAddresses(profile.email, data.user);
}
