import { connection } from "next/server";
import { getBylawsForScheme } from "@/lib/queries/bylaws";
import { BylawsCard } from "../_sections/bylaws-card";
import { requireAdviserScheme } from "../_sections/require-adviser-scheme";

export default async function BylawsSectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;
  const scheme = await requireAdviserScheme(id);
  if (!scheme) return null;

  const bylaws = await getBylawsForScheme(id);

  return <BylawsCard id={id} bylaws={bylaws} />;
}
