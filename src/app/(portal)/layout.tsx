import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PortalShell } from "@/components/portal-shell";

// Auth-protected layout reads cookies at request time, so it cannot be
// prerendered into the static shell. Opt out of instant validation.
// See: https://nextjs.org/docs/app/guides/authentication-with-cache-components
export const instant = false;

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return <PortalShell user={user}>{children}</PortalShell>;
}
