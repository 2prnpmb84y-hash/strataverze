import { redirect } from "next/navigation";
import { connection } from "next/server";

/**
 * Catch-all redirect from the old /committee/* routes to /owner/*.
 * Committee features are now part of the owner portal.
 */
export default async function CommitteeRedirect({
  params,
}: {
  params: Promise<{ path?: string[] }>;
}) {
  await connection();
  const { path } = await params;
  const suffix = path ? `/${path.join("/")}` : "";
  redirect(`/owner${suffix}`);
}
