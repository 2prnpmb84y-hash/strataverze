"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { PackWords } from "@/lib/jurisdiction/screen-words";

/** The tabs, the levy and late charge ones named in the building's words. */
const tabsFor = (w: Pick<PackWords, "Levies" | "LateCharge">) => [
  { key: "overview", label: "Overview", href: "" },
  { key: "accounts", label: "Chart of Accounts", href: "/accounts" },
  { key: "bank-accounts", label: "Bank Accounts", href: "/bank-accounts" },
  { key: "levies", label: w.Levies, href: "/levies" },
  { key: "invoices", label: "Invoices", href: "/invoices" },
  { key: "suppliers", label: "Suppliers", href: "/suppliers" },
  { key: "journal", label: "Journal", href: "/journal" },
  { key: "bank-import", label: "Bank Import", href: "/bank-import" },
  { key: "reconciliation", label: "Reconciliation", href: "/reconciliation" },
  { key: "matching-rules", label: "Matching Rules", href: "/matching-rules" },
  { key: "budget", label: "Budget", href: "/budget" },
  { key: "capital-works", label: "Capital Works Plan", href: "/capital-works" },
  { key: "interest", label: w.LateCharge, href: "/interest" },
  { key: "owner-credits", label: "Owner Credits", href: "/owner-credits" },
  { key: "periods", label: "Periods", href: "/periods" },
  { key: "reports", label: "Reports", href: "/reports" },
  { key: "documents", label: "Documents", href: "/documents" },
  { key: "migration", label: "Migration", href: "/migration" },
  { key: "platform-fees", label: "StrataVerze Fees", href: "/platform-fees" },
];

type Tab = ReturnType<typeof tabsFor>[number];

/** `capitalWorksPlan`: the building's rule pack has the capital works fund plan, so its tab shows. `words` are the building's (packWordsFor). */
export function FinanceTabs({ schemeId, capitalWorksPlan, words }: { schemeId: string; capitalWorksPlan: boolean; words: Pick<PackWords, "Levies" | "LateCharge"> }) {
  const pathname = usePathname();
  const basePath = `/adviser/schemes/${schemeId}/finance`;
  const tabs = tabsFor(words);

  function isActive(tab: Tab) {
    if (tab.href === "") {
      return pathname === basePath || pathname === `${basePath}/`;
    }
    return pathname.startsWith(`${basePath}${tab.href}`);
  }

  return (
    <div className="flex gap-1 mb-6 border-b border-line overflow-x-auto">
      {tabs.filter((tab) => tab.key !== "capital-works" || capitalWorksPlan).map((tab) => (
        <Link
          key={tab.key}
          href={`${basePath}${tab.href}`}
          className={`px-4 py-2.5 text-sm font-medium transition-colors relative whitespace-nowrap ${
            isActive(tab)
              ? "text-turquoise"
              : "text-ink-muted hover:text-ink"
          }`}
        >
          {tab.label}
          {isActive(tab) && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-turquoise rounded-t" />
          )}
        </Link>
      ))}
    </div>
  );
}
