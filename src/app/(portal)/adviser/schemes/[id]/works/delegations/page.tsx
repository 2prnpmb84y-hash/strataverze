import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemeById } from "@/lib/queries/schemes";

/**
 * /works/delegations redirects to the approvals page which shows delegations
 */
export default async function DelegationsRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;

  const profile = await getCurrentProfile();
  if (!profile) return null;

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();

  redirect(`/adviser/schemes/${id}/works/approvals`);
}
