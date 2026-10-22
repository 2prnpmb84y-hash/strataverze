import { Suspense } from "react";
import { ComplianceFeeBanner } from "@/components/billing/compliance-fee-banner";

/** Supplier portal: asks contractors to confirm any new StrataVerze charge. */
export default function SupplierLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Suspense fallback={null}>
        <ComplianceFeeBanner />
      </Suspense>
      {children}
    </>
  );
}
