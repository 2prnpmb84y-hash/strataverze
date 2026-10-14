import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemesForCommittee } from "@/lib/queries/schemes";
import { getDocumentsForSchemes } from "@/lib/queries/documents";
import { PageHeader } from "@/components/ui/page-header";
import { DocumentList } from "@/components/document-list";

export default async function CommitteeDocumentsPage() {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const schemes = await getSchemesForCommittee(profile.id);
  if (schemes.length === 0) notFound();

  const schemeIds = schemes.map((s) => s.id);
  const documents = await getDocumentsForSchemes(schemeIds);

  const schemeNames = Object.fromEntries(
    schemes.map((s) => [s.id, s.name]),
  );

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Documents"
        description="Scheme documents and records."
      />

      <DocumentList documents={documents} schemeNames={schemeNames} />
    </div>
  );
}
