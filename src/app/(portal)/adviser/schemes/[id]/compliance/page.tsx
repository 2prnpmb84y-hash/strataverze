import { connection } from "next/server";
import { getComplianceForScheme } from "@/lib/queries/compliance";
import { ComplianceCard } from "../_sections/compliance-card";
import { requireAdviserScheme } from "../_sections/require-adviser-scheme";

export default async function ComplianceSectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;
  const scheme = await requireAdviserScheme(id);
  if (!scheme) return null;

  const complianceItems = await getComplianceForScheme(id);

  return <ComplianceCard id={id} complianceItems={complianceItems} />;
}
