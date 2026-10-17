import { notFound } from "next/navigation";
import { getSchemeById } from "@/lib/queries/schemes";
import { getDocumentById } from "@/lib/queries/documents";
import { resolveDocumentUrl } from "@/lib/queries/document-url";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { DocumentEditForm } from "../document-form";
import { DeleteDocumentButton } from "./delete-document-button";

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

export default async function DocumentDetailPage({
  params,
}: {
  params: Promise<{ id: string; docId: string }>;
}) {
  const { id, docId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();

  const isAdviser = scheme.memberships.some(
    (m) => m.profileId === profile.id && m.role === "ADVISER",
  );
  if (!isAdviser) notFound();

  const document = await getDocumentById(docId);
  if (!document || document.schemeId !== id) notFound();

  const downloadUrl = await resolveDocumentUrl(document.fileUrl);
  const uploadDate = new Date(String(document.createdAt));

  return (
    <div className="max-w-2xl">
      <PageHeader
        title={document.title}
        description={`${categoryLabels[document.category] ?? document.category} · Uploaded ${uploadDate.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}`}
        backHref={`/adviser/schemes/${id}`}
        backLabel="Scheme"
      />

      {/* File details */}
      <Card className="mb-6">
        <CardHeader title="File Details" />
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between rounded-lg bg-muted px-4 py-3">
            <div>
              <p className="text-sm font-medium text-foreground">
                {document.fileName}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatFileSize(document.fileSize)}
                {document.mimeType && ` · ${document.mimeType}`}
              </p>
            </div>
            <a
              href={downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium text-primary-500 hover:text-primary-600 transition-colors"
            >
              Download
            </a>
          </div>
          {document.description && (
            <p className="text-sm text-muted-foreground px-1">
              {document.description}
            </p>
          )}
        </div>
      </Card>

      {/* Edit metadata */}
      <div className="mb-6">
        <h2 className="font-heading font-semibold text-foreground mb-4">
          Edit Document Details
        </h2>
        <DocumentEditForm
          schemeId={id}
          documentId={docId}
          defaults={{
            title: document.title,
            description: document.description,
            category: document.category,
          }}
        />
      </div>

      {/* Danger zone */}
      <Card className="border-red-200">
        <CardHeader
          title="Danger Zone"
          description="Irreversible actions for this document."
        />
        <DeleteDocumentButton
          schemeId={id}
          documentId={docId}
          documentTitle={document.title}
        />
      </Card>
    </div>
  );
}
