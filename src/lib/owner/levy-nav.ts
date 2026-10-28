/**
 * The owner portal's "Levies & Finance" entry in the words of the owner's
 * buildings (QLD finance wording go-live, 28 Oct 2026): "Contributions &
 * Finance" for an owner whose buildings are all in Queensland, the words for
 * both where they own in both states, and the default state's where they own
 * none yet.
 */
import { cache } from "react";
import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";
import { DEFAULT_SCHEME_STATE } from "@/config/jurisdictions";
import { rulesForListedStates, rulesForState } from "@/lib/jurisdiction/scheme-rules";
import { sharedLevyWords } from "@/lib/jurisdiction/screen-words";

/** "Levies", "Contributions", "Levies and Contributions". */
const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase()).replace(/ And /g, " and ");

/** The label for words already worked out: "Levies & Finance". */
export function levyNavLabel(levies: string): string {
  return `${titleCase(levies)} & Finance`;
}

/**
 * The owner portal's label for the person's buildings (they own or sit on the
 * committee of). Read once per request (React cache), however many times the
 * portal renders it.
 */
export const ownerLevyNavLabel = cache(async (profileId: string): Promise<string> => {
  const memberships = await db.orm.public.SchemeMembership
    .where((m) => and(m.profileId.eq(profileId), m.role.in(["OWNER", "COMMITTEE"]), m.isActive.eq(true)))
    .limit(200)
    .all();
  const ids = [...new Set(memberships.map((m) => m.schemeId))];
  const schemes = ids.length ? await db.orm.public.Scheme.where((s) => s.id.in(ids)).limit(200).all() : [];
  const words = sharedLevyWords(rulesForListedStates(schemes.map((s) => s.state)), rulesForState(DEFAULT_SCHEME_STATE).rules);
  return levyNavLabel(words.levies);
});
