import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemesForCommittee } from "@/lib/queries/schemes";
import { getDocumentsForSchemes } from "@/lib/queries/documents";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";

const categoryLabels: Record<string, string> = {
  MINUTES: "Meeting Minutes",
  INSURANCE: "Insurance",
  BYLAW: "By-laws / Rules",
  FINANCIAL: "Financial Reports",
  COMPLIANCE: "Compliance",
  OTHER: "Other",
};

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "Unknown size";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function CommitteeDocumentsPage() {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const schemes = await getSchemesForCommittee(profile.id);
  if (schemes.length === 0) notFound();

  const schemeIds = schemes.map((s) => s.id);
  const documents = await getDocumentsForSchemes(schemeIds);

  // Build a scheme name lookup
  const schemeNames = new Map(schemes.map((s) => [s.id, s.name]));

  // Group by category
  const byCategory = new Map<string, typeof documents>();
  for (const doc of documents) {
    const existing = byCategory.get(doc.category) ?? [];
    existing.push(doc);
    byCategory.set(doc.category, existing);
  }

  // Sort categories in a logical order
  const categoryOrder = [
    "INSURANCE",
    "BYLAW",
    "FINANCIAL",
    "MINUTES",
    "COMPLIANCE",
    "OTHER",
  ];
  const sortedCategories = categoryOrder.filter((c) => byCategory.has(c));

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Documents"
        description="Scheme documents and records."
      />

      {documents.length === 0 ? (
        <Card>
          <div className="p-6 text-center">
            <p className="text-sm text-muted-foreground">
              No documents have been uploaded for your schemes yet.
            </p>
          </div>
        </Card>
      ) : (
        <>
          {sortedCategories.map((category) => {
            const docs = byCategory.get(category) ?? [];
            return (
              <Card key={category} className="mb-6">
                <CardHeader
                  title={categoryLabels[category] ?? category}
                  description={`${docs.length} document${docs.length === 1 ? "" : "s"}`}
                />
                <div className="flex flex-col gap-2">
                  {docs.map((doc) => {
                    const uploadDate = new Date(String(doc.createdAt));
                    return (
                      <div
                        key={doc.id}
                        className="flex items-center justify-between rounded-lg bg-muted px-4 py-3"
                      >
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {doc.title}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {schemeNames.get(doc.schemeId) ?? ""}
                            {" · "}
                            {uploadDate.toLocaleDateString("en-AU", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })}
                            {" · "}
                            {formatFileSize(doc.fileSize)}
                          </p>
                        </div>
                        <a
                          href={doc.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-medium text-committee hover:opacity-80 transition-colors"
                        >
                          Download
                        </a>
                      </div>
                    );
                  })}
                </div>
              </Card>
            );
          })}
        </>
      )}
    </div>
  );
}
