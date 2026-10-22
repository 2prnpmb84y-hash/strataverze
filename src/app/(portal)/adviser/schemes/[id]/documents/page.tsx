import { connection } from "next/server";
import { getDocumentsForScheme } from "@/lib/queries/documents";
import { DocumentsTabContent } from "@/components/documents/documents-tab-content";
import { requireAdviserScheme } from "../_sections/require-adviser-scheme";

/** Documents section (moved from the former Documents tab). */
export default async function DocumentsSectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;
  const scheme = await requireAdviserScheme(id);
  if (!scheme) return null;

  const documents = await getDocumentsForScheme(id);

  return (
    <DocumentsTabContent
      schemeId={id}
      schemePlanNumber={scheme.planNumber}
      documents={documents.map((d) => ({
        id: d.id,
        title: d.title,
        fileName: d.fileName,
        fileUrl: d.fileUrl,
        fileSize: d.fileSize,
        mimeType: d.mimeType,
        category: d.category,
        documentType: d.documentType ?? null,
        documentDate: d.documentDate ? String(d.documentDate) : null,
        strataPlan: d.strataPlan ?? null,
        schedule: d.schedule ?? null,
        lotNumber: d.lotNumber ?? null,
        supplier: d.supplier ?? null,
        comments: d.comments ?? null,
        description: d.description ?? null,
        createdAt: String(d.createdAt),
      }))}
    />
  );
}
