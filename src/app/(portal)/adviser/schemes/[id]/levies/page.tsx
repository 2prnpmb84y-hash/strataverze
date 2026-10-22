import { connection } from "next/server";
import { getLeviesForScheme } from "@/lib/queries/levies";
import { LeviesCard } from "../_sections/levies-card";
import { requireAdviserScheme } from "../_sections/require-adviser-scheme";

export default async function LeviesSectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;
  const scheme = await requireAdviserScheme(id);
  if (!scheme) return null;

  const levies = await getLeviesForScheme(id);

  return <LeviesCard id={id} levies={levies} />;
}
