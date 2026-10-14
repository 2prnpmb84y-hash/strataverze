import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemesForCommittee } from "@/lib/queries/schemes";
import { getDocumentsForSchemes } from "@/lib/queries/documents";
import { paginateArray, parsePage } from "@/lib/pagination";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { DocumentList } from "@/components/document-list";

export default async function CommitteeDocumentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const schemes = await getSchemesForCommittee(profile.id);
  if (schemes.length === 0) notFound();

  const schemeIds = schemes.map((s) => s.id);
  const documents = await getDocumentsForSchemes(schemeIds);

  const schemeNames = Object.fromEntries(
    schemes.map((s) => [s.id, s.name]),
  );

  const sp = await searchParams;
  const { page } = parsePage(sp);
  const { data: paginatedDocs, meta } = paginateArray(documents, page);

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Documents"
        description="Scheme documents and records."
        action={
          <Button href="/committee/documents/upload">
            Upload Document
          </Button>
        }
      />

      <DocumentList documents={paginatedDocs} schemeNames={schemeNames} />

      <Pagination
        currentPage={meta.currentPage}
        totalPages={meta.totalPages}
        basePath="/committee/documents"
      />
    </div>
  );
}
