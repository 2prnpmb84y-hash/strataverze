import { redirect } from "next/navigation";
import { connection } from "next/server";
import { requirePlatformAdminPage } from "@/lib/auth/require-access";

export default async function AdminHome() {
  await connection();
  // Checked on every admin page, not only in the layout (finding F5).
  await requirePlatformAdminPage();
  redirect("/admin/revenue");
}
