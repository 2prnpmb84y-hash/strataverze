import { connection } from "next/server";
import { getMeetingsForScheme } from "@/lib/queries/meetings";
import { MeetingsCard } from "../_sections/meetings-card";
import { requireAdviserScheme } from "../_sections/require-adviser-scheme";

export default async function MeetingsSectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;
  const scheme = await requireAdviserScheme(id);
  if (!scheme) return null;

  const meetings = await getMeetingsForScheme(id);

  return <MeetingsCard id={id} meetings={meetings} />;
}
