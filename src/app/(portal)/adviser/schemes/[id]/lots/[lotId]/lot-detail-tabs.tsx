"use client";

import { Suspense } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import type { ReactNode } from "react";

const tabs = [
  { key: "details", label: "Details" },
  { key: "financials", label: "Financials" },
  { key: "tenancy", label: "Tenancy" },
  { key: "documents", label: "Documents" },
  { key: "settings", label: "Settings" },
] as const;

type TabKey = (typeof tabs)[number]["key"];

export function LotDetailTabs({
  children,
}: {
  children: Record<TabKey, ReactNode>;
}) {
  return (
    <Suspense fallback={<LotDetailTabsFallback>{children}</LotDetailTabsFallback>}>
      <LotDetailTabsInner>{children}</LotDetailTabsInner>
    </Suspense>
  );
}

function LotDetailTabsFallback({ children }: { children: Record<TabKey, ReactNode> }) {
  return (
    <div>
      <div className="flex gap-1 mb-6 border-b border-line overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`px-4 py-2.5 text-sm font-medium transition-colors relative whitespace-nowrap ${
              tab.key === "details"
                ? "text-turquoise"
                : "text-ink-muted hover:text-ink"
            }`}
          >
            {tab.label}
            {tab.key === "details" && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-turquoise rounded-t" />
            )}
          </button>
        ))}
      </div>
      {children["details"]}
    </div>
  );
}

function LotDetailTabsInner({
  children,
}: {
  children: Record<TabKey, ReactNode>;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const activeTab = (searchParams.get("tab") as TabKey) || "details";
  const currentTab = tabs.some((t) => t.key === activeTab)
    ? activeTab
    : "details";

  function switchTab(tab: TabKey) {
    const params = new URLSearchParams(searchParams.toString());
    if (tab === "details") {
      params.delete("tab");
    } else {
      params.set("tab", tab);
    }
    const qs = params.toString();
    router.push(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
  }

  return (
    <div>
      <div className="flex gap-1 mb-6 border-b border-line overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => switchTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors relative whitespace-nowrap ${
              currentTab === tab.key
                ? "text-turquoise"
                : "text-ink-muted hover:text-ink"
            }`}
          >
            {tab.label}
            {currentTab === tab.key && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-turquoise rounded-t" />
            )}
          </button>
        ))}
      </div>

      {children[currentTab]}
    </div>
  );
}
