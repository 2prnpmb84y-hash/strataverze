"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import type { ReactNode } from "react";

const tabs = [
  { key: "overview", label: "Overview" },
  { key: "lots", label: "Lots / Owners" },
  { key: "documents", label: "Documents" },
] as const;

type TabKey = (typeof tabs)[number]["key"];

export function SchemeTabs({
  children,
}: {
  children: Record<TabKey, ReactNode>;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const activeTab = (searchParams.get("tab") as TabKey) || "overview";
  const currentTab = tabs.some((t) => t.key === activeTab)
    ? activeTab
    : "overview";

  function switchTab(tab: TabKey) {
    const params = new URLSearchParams(searchParams.toString());
    if (tab === "overview") {
      params.delete("tab");
    } else {
      params.set("tab", tab);
    }
    const qs = params.toString();
    router.push(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
  }

  return (
    <div>
      {/* Tab navigation */}
      <div className="flex gap-1 mb-6 border-b border-border overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => switchTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors relative ${
              currentTab === tab.key
                ? "text-primary-500"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
            {currentTab === tab.key && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-400 rounded-t" />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {children[currentTab]}
    </div>
  );
}
