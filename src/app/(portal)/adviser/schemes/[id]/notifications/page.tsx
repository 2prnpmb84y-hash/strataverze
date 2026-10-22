import { connection } from "next/server";
import { Card, CardHeader } from "@/components/ui/card";
import { requireAdviserScheme } from "../_sections/require-adviser-scheme";

/** Notifications section. Placeholder until scheme notifications are built. */
export default async function NotificationsSectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;
  const scheme = await requireAdviserScheme(id);
  if (!scheme) return null;

  return (
    <Card className="mb-6">
      <CardHeader
        title="Notifications"
        description="This section is not built yet. Scheme notifications will appear here."
      />
    </Card>
  );
}
