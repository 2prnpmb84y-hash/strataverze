import Link from "next/link";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemesForAdviser } from "@/lib/queries/schemes";
import { getDocumentsForSchemes } from "@/lib/queries/documents";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { connection } from "next/server";

const categoryLabels: Record<string, string> = {
  MINUTES: "Minutes",
  INSURANCE: "Insurance",
  BYLAW: "By-laws",
  FINANCIAL: "Financial",
  COMPLIANCE: "Compliance",
  OTHER: "Other",
};

export default async function AdviserDocumentsPage() {
  await connection();
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const schemes = await getSchemesForAdviser(profile.id);
  const schemeIds = schemes.map((s) => s.id);
  const schemeNames = new Map(schemes.map((s) => [s.id, s.name]));

  const documents = schemeIds.length > 0
    ? await getDocumentsForSchemes(schemeIds)
    : [];

  // Count by category
  const categoryCounts = new Map<string, number>();
  for (const doc of documents) {
    categoryCounts.set(doc.category, (categoryCounts.get(doc.category) ?? 0) + 1);
  }

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Documents"
        description="All documents across managed schemes."
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <StatCard
          label="Total Documents"
          value={documents.length}
          accent="bg-adviser"
        />
        <StatCard
          label="Schemes"
          value={schemes.length}
          accent="bg-turquoise"
        />
        <StatCard
          label="Minutes"
          value={categoryCounts.get("MINUTES") ?? 0}
          accent="bg-blue-500"
        />
        <StatCard
          label="Financial"
          value={categoryCounts.get("FINANCIAL") ?? 0}
          accent="bg-green-500"
        />
      </div>

      {documents.length === 0 ? (
        <Card>
          <div className="p-6 text-center">
            <p className="text-sm text-ink-muted">
              No documents uploaded yet across your managed schemes.
            </p>
          </div>
        </Card>
      ) : (
        <Card>
          <CardHeader
            title="All Documents"
            description={`${documents.length} document${documents.length === 1 ? "" : "s"} across ${schemes.length} scheme${schemes.length === 1 ? "" : "s"}.`}
          />
          <div className="flex flex-col gap-2">
            {documents.map((doc) => {
              const uploadDate = new Date(String(doc.createdAt));
              return (
                <Link
                  key={doc.id}
                  href={`/adviser/schemes/${doc.schemeId}/documents/${doc.id}`}
                  className="flex items-center justify-between rounded-[var(--radius-card)] bg-muted px-4 py-3 hover:bg-muted/70 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink truncate">
                      {doc.title}
                    </p>
                    <p className="text-xs text-ink-muted">
                      {schemeNames.get(doc.schemeId) ?? ""}
                      {" · "}
                      {categoryLabels[doc.category] ?? doc.category}
                      {" · "}
                      {uploadDate.toLocaleDateString("en-AU", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                  <span className="shrink-0 ml-3 inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                    {doc.fileName.split(".").pop()?.toUpperCase() ?? "FILE"}
                  </span>
                </Link>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
