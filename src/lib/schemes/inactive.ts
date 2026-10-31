import { db } from "@/prisma/db";

/**
 * The schemes switched off (schemes.is_active = false), which the scheduled
 * jobs leave exactly as they are (31 Oct 2026: a frozen scheme, such as the
 * test scheme kept as the record of the 26 Oct finance review, must not be
 * changed by a nightly run). Read once per run; each job's query then
 * excludes them with `schemeId.notIn(ids)`, which matches every row when the
 * list is empty (Prisma 8 renders an empty NOT IN as TRUE).
 */
export async function inactiveSchemeIds(): Promise<string[]> {
  const rows = await db.orm.public.Scheme.where((s) => s.isActive.eq(false)).select("id").limit(10000).all();
  return rows.map((s) => s.id);
}
