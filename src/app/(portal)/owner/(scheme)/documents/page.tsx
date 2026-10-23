import { getSelectedSchemeId } from "@/lib/actions/scheme-selection";
import { scopeSchemeIds } from "@/lib/owner/scheme-scope";
import { notFound } from "next/navigation";
import { getCurrentProfile, hasCommitteeRole } from "@/lib/queries/profiles";
import { getSchemesForOwner, getSchemesForCommittee } from "@/lib/queries/schemes";
import { getDocumentsForSchemes } from "@/lib/queries/documents";
import { resolveDocumentUrl } from "@/lib/queries/document-url";
import { paginateArray, parsePage } from "@/lib/pagination";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { DocumentList } from "@/components/document-list";
import { connection } from "next/server";

export default async function OwnerDocumentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
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

  const schemeIds = scopeSchemeIds([...schemeMap.keys()], await getSelectedSchemeId());
  const documents = await getDocumentsForSchemes(schemeIds);

  const schemeNames = Object.fromEntries(schemeMap);

  const sp = await searchParams;
  const { page } = parsePage(sp);
  const { data: pageDocs, meta } = paginateArray(documents, page);
  // The documents bucket is private: each download is a short-lived signed
  // link, made with the viewer's own session so storage checks they belong
  // to the scheme. A file that cannot be signed shows as unavailable.
  const paginatedDocs = await Promise.all(
    pageDocs.map(async (d) => ({
      ...d,
      fileUrl: await resolveDocumentUrl(String(d.fileUrl), 600).catch(() => ""),
    })),
  );

  return (
    <div className="max-w-3xl">
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
