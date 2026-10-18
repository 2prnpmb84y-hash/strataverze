import { redirect } from "next/navigation";

export default async function AccountantSchemeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/accountant/schemes/${id}/finance/reports`);
}
