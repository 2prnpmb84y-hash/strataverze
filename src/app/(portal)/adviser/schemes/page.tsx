import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemesForAdviser } from "@/lib/queries/schemes";
import { paginateArray, parsePage } from "@/lib/pagination";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { SchemeList } from "@/components/scheme-list";

export default async function AdviserSchemesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const schemes = await getSchemesForAdviser(profile.id);

  const sp = await searchParams;
  const { page } = parsePage(sp);
  const { data: paginatedSchemes, meta } = paginateArray(schemes, page);

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Schemes"
        description="Manage the Owners Corporations you advise."
        action={<Button href="/adviser/schemes/new">Add Scheme</Button>}
      />

      {schemes.length === 0 ? (
        <EmptyState
          icon={
            <svg
              width="40"
              height="40"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          }
          title="No schemes yet"
          description="Create your first scheme to start managing an Owners Corporation."
          actionLabel="Add Scheme"
          actionHref="/adviser/schemes/new"
        />
      ) : (
        <>
          <SchemeList schemes={paginatedSchemes} />

          <Pagination
            page={meta.page}
            hasMore={meta.hasMore}
          />
        </>
      )}
    </div>
  );
}
