import { notFound } from "next/navigation";
import { getCurrentProfile, hasCommitteeRole } from "@/lib/queries/profiles";
import { getSchemesForOwner, getSchemesForCommittee } from "@/lib/queries/schemes";
import { getDocumentsForSchemes } from "@/lib/queries/documents";
import { paginateArray, parsePage } from "@/lib/pagination";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { DocumentList } from "@/components/document-list";

export default async function OwnerDocumentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const [ownerSchemes, isCommittee] = await Promise.all([
    getSchemesForOwner(profile.id),
    hasCommitteeRole(profile.id),
  ]);

  // Build a deduplicated map of scheme id -> name from both sources
  const schemeMap = new Map(ownerSchemes.map((s) => [s.id, s.name]));
  if (isCommittee) {
    const committeeSchemes = await getSchemesForCommittee(profile.id);
    for (const cs of committeeSchemes) {
      if (!schemeMap.has(cs.id)) schemeMap.set(cs.id, cs.name);
    }
  }

  if (schemeMap.size === 0) notFound();

  const schemeIds = [...schemeMap.keys()];
  const documents = await getDocumentsForSchemes(schemeIds);

  const schemeNames = Object.fromEntries(schemeMap);

  const sp = await searchParams;
  const { page } = parsePage(sp);
  const { data: paginatedDocs, meta } = paginateArray(documents, page);

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Documents"
        description="Documents and records for your schemes."
        action={
          isCommittee ? (
            <Button href="/owner/documents/upload">Upload Document</Button>
          ) : undefined
        }
      />

      <DocumentList documents={paginatedDocs} schemeNames={schemeNames} />

      <Pagination
        page={meta.page}
        hasMore={meta.hasMore}
      />
    </div>
  );
}
