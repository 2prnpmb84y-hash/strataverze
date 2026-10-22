import { redirect } from "next/navigation";

/**
 * The legacy levy screens are retired. Levies now live under
 * Financials → Levies (levy schedules, special levies and notices).
 */
export default async function LegacyLeviesRedirect({
  params,
}: {
  params: Promise<{ id: string; rest?: string[] }>;
}) {
  const { id } = await params;
  redirect(`/adviser/schemes/${id}/finance/levies`);
}
