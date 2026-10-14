import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemesForOwner } from "@/lib/queries/schemes";
import { getDocumentsForSchemes } from "@/lib/queries/documents";
import { paginateArray, parsePage } from "@/lib/pagination";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { DocumentList } from "@/components/document-list";

export default async function OwnerDocumentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const schemes = await getSchemesForOwner(profile.id);
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
        description="Documents and records for your schemes."
      />

      <DocumentList documents={paginatedDocs} schemeNames={schemeNames} />

      <Pagination
        currentPage={meta.currentPage}
        totalPages={meta.totalPages}
        basePath="/owner/documents"
      />
    </div>
  );
}
