import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { requirePageAccess } from "@/lib/auth/require-access";
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

  // Role check on this scheme (SEC-004 / H5): a page is a privileged read.
  const access = await requirePageAccess(id, "works.read");
  if (!access) return null;

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();

  redirect(`/adviser/schemes/${id}/works/approvals`);
}
