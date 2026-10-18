import { redirect } from "next/navigation";
import { connection } from "next/server";

export default async function AccountantSchemeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;
  redirect(`/accountant/schemes/${id}/finance/reports`);
}
