import { Suspense } from "react";
import { SchemeDetailHeaderSkeleton } from "@/components/scheme-detail-header";
import { OwnerSchemeHeaderSection } from "./owner-scheme-header-section";

/**
 * Every owner page within a scheme shares this layout: the scheme header and
 * section navigation stay in place and only the content beneath changes.
 * The header streams inside its own Suspense boundary (Cache Components).
 */
export default function OwnerSchemeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-5xl">
      <Suspense fallback={<SchemeDetailHeaderSkeleton />}>
        <OwnerSchemeHeaderSection />
      </Suspense>
      {children}
    </div>
  );
}
