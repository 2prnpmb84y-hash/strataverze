"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { key: "overview", label: "Overview", href: "" },
  { key: "accounts", label: "Chart of Accounts", href: "/accounts" },
  { key: "bank-accounts", label: "Bank Accounts", href: "/bank-accounts" },
  { key: "levies", label: "Levies", href: "/levies" },
  { key: "invoices", label: "Invoices", href: "/invoices" },
  { key: "suppliers", label: "Suppliers", href: "/suppliers" },
  { key: "journal", label: "Journal", href: "/journal" },
  { key: "bank-import", label: "Bank Import", href: "/bank-import" },
  { key: "reconciliation", label: "Reconciliation", href: "/reconciliation" },
  { key: "reports", label: "Reports", href: "/reports" },
] as const;

export function FinanceTabs({ schemeId }: { schemeId: string }) {
  const pathname = usePathname();
  const basePath = `/adviser/schemes/${schemeId}/finance`;

  function isActive(tab: (typeof tabs)[number]) {
    if (tab.href === "") {
      return pathname === basePath || pathname === `${basePath}/`;
    }
    return pathname.startsWith(`${basePath}${tab.href}`);
  }

  return (
    <div className="flex gap-1 mb-6 border-b border-border overflow-x-auto">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={`${basePath}${tab.href}`}
          className={`px-4 py-2.5 text-sm font-medium transition-colors relative whitespace-nowrap ${
            isActive(tab)
              ? "text-primary-500"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {tab.label}
          {isActive(tab) && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-400 rounded-t" />
          )}
        </Link>
      ))}
    </div>
  );
}
