import { connection } from "next/server";
import { getAnnouncementsForScheme } from "@/lib/queries/announcements";
import { AnnouncementsCard } from "../_sections/announcements-card";
import { requireAdviserScheme } from "../_sections/require-adviser-scheme";

export default async function AnnouncementsSectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;
  const scheme = await requireAdviserScheme(id);
  if (!scheme) return null;

  const announcements = await getAnnouncementsForScheme(id, { includeExpired: true });

  return <AnnouncementsCard id={id} announcements={announcements} />;
}
