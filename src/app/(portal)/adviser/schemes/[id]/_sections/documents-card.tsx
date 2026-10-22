import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import type { getDocumentsForScheme } from "@/lib/queries/documents";

/** Moved unchanged from the scheme main page so it can also back its section page. */
export function DocumentsCard({
  id, documents,
}: {
  id: string;
  documents: Awaited<ReturnType<typeof getDocumentsForScheme>>;
}) {
  return (
    <Card className="mb-6">
      <CardHeader
        title="Documents"
        description={
          documents.length === 0
            ? "No documents uploaded yet."
            : `${documents.length} document${documents.length === 1 ? "" : "s"} uploaded.`
        }
        action={
          <Button href={`/adviser/schemes/${id}/documents/new`} variant="secondary">
            Upload Document
          </Button>
        }
      />
      {documents.length > 0 ? (
        <div className="flex flex-col gap-2">
          {documents.map((doc) => {
            const uploadDate = new Date(String(doc.createdAt));

            const categoryLabels: Record<string, string> = {
              MINUTES: "Minutes",
              INSURANCE: "Insurance",
              BYLAW: "By-laws",
              FINANCIAL: "Financial",
              COMPLIANCE: "Compliance",
              OTHER: "Other",
            };

            return (
              <Link
                key={doc.id}
                href={`/adviser/schemes/${id}/documents/${doc.id}`}
                className="flex items-center justify-between rounded-[var(--radius-card)] bg-muted px-4 py-3 hover:bg-muted/70 transition-colors"
              >
                <div>
                  <p className="text-sm font-medium text-ink">
                    {doc.title}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {categoryLabels[doc.category] ?? doc.category}
                    {" · "}
                    {uploadDate.toLocaleDateString("en-AU", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                </div>
                <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                  {doc.fileName.split(".").pop()?.toUpperCase() ?? "FILE"}
                </span>
              </Link>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-ink-muted">
          Upload documents to keep records for this scheme.
        </p>
      )}
    </Card>
  );
}
