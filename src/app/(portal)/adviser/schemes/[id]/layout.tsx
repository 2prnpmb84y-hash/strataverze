import { Suspense } from "react";
import { SchemeDetailHeaderSkeleton } from "@/components/scheme-detail-header";
import { SchemeHeaderSection } from "./scheme-header-section";

/**
 * Every page within a scheme shares this layout: the scheme header and section
 * navigation stay in place and only the content beneath changes. The header's
 * data loading streams inside its own Suspense boundary (Cache Components).
 */
export default function SchemeLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  return (
    <div className="max-w-5xl">
      <Suspense fallback={<SchemeDetailHeaderSkeleton />}>
        <SchemeHeaderSection params={params} />
      </Suspense>
      {children}
    </div>
  );
}
