import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getCurrentProfile } from "@/lib/queries/profiles";

async function AdminGate({ children }: { children: React.ReactNode }) {
  await connection();
  const profile = await getCurrentProfile();
  // StrataVerze staff only. Everyone else gets a plain 404.
  if (!profile?.isPlatformAdmin) notFound();
  return <>{children}</>;
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <AdminGate>{children}</AdminGate>
    </Suspense>
  );
}
