"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutGrid,
  Building2,
  CheckSquare,
  Users,
  Briefcase,
  ClipboardList,
  FileText,
  ChevronsRight,
  ChevronsLeft,
  Truck,
  BarChart3,
  UserPlus,
  Shield,
  CreditCard,
  Settings,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Navigation configuration per portal                               */
/* ------------------------------------------------------------------ */

const ownerNav = [
  { label: "Properties", href: "/owner/properties", icon: LayoutGrid },
  { label: "My Property", href: "/owner/scheme", icon: Building2 },
  { label: "Compliance", href: "/owner/compliance", icon: CheckSquare },
  { label: "Community", href: "/owner/contacts", icon: Users },
  { label: "Work Orders", href: "/owner/maintenance", icon: Briefcase },
  { label: "Works Overview", href: "/owner/works", icon: BarChart3 },
  { label: "Levies & Finance", href: "/owner/levies", icon: ClipboardList },
  { label: "Documents", href: "/owner/documents", icon: FileText },
];

const adviserNav = [
  { label: "Dashboard", href: "/adviser", icon: LayoutGrid },
  { label: "Schemes", href: "/adviser/schemes", icon: Building2 },
  { label: "Compliance", href: "/adviser/compliance", icon: CheckSquare },
  { label: "Suppliers", href: "/adviser/suppliers", icon: Truck },
  { label: "Contractors", href: "/adviser/contractors", icon: UserPlus },
  { label: "Work Orders", href: "/adviser/work-orders", icon: Briefcase },
  { label: "Reporting", href: "/adviser/reporting", icon: BarChart3 },
  { label: "Documents", href: "/adviser/documents", icon: FileText },
];

const supplierNav = [
  { label: "Dashboard", href: "/supplier", icon: LayoutGrid },
  { label: "Onboarding", href: "/supplier/onboarding", icon: UserPlus },
  { label: "Quote Requests", href: "/supplier/quotes", icon: ClipboardList },
  { label: "My Quotes", href: "/supplier/my-quotes", icon: FileText },
  { label: "Work Orders", href: "/supplier/work-orders", icon: Briefcase },
  { label: "Invoices", href: "/supplier/invoices", icon: ClipboardList },
  { label: "Compliance", href: "/supplier/compliance", icon: Shield },
  { label: "Membership", href: "/supplier/membership", icon: CreditCard },
  { label: "Settings", href: "/supplier/settings", icon: Settings },
];

const accountantNav = [
  { label: "Dashboard", href: "/accountant", icon: LayoutGrid },
  { label: "Schemes", href: "/accountant/schemes", icon: Building2 },
];

const navByPortal: Record<string, typeof ownerNav> = {
  owner: ownerNav,
  adviser: adviserNav,
  supplier: supplierNav,
  accountant: accountantNav,
};

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export function SideRail({ portal }: { portal: string }) {
  const pathname = usePathname();
  const nav = navByPortal[portal] ?? ownerNav;

  const [expanded, setExpanded] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem("sv-rail-expanded") === "true";
    } catch {
      return false;
    }
  });

  function toggle() {
    const next = !expanded;
    setExpanded(next);
    try {
      localStorage.setItem("sv-rail-expanded", String(next));
    } catch {
      /* noop */
    }
  }

  return (
    <aside
      className={`hidden md:flex flex-col rail-gradient sticky top-0 h-dvh transition-[width] duration-200 ${
        expanded ? "w-[220px]" : "w-[60px]"
      }`}
      aria-label="Main navigation"
    >
      {/* Expand / collapse toggle */}
      <button
        onClick={toggle}
        className="flex items-center justify-center w-full h-12 text-white/80 hover:text-white transition-colors"
        aria-label={expanded ? "Collapse navigation" : "Expand navigation"}
      >
        {expanded ? (
          <ChevronsLeft size={20} strokeWidth={1.5} />
        ) : (
          <ChevronsRight size={20} strokeWidth={1.5} />
        )}
      </button>

      {/* Logo */}
      <div className={`flex items-center justify-center px-3 pb-4 ${expanded ? "pt-1" : "pt-2"}`}>
        {expanded ? (
          <Image
            src="/brand/logo-horizontal-white.png"
            alt="StrataVerze"
            width={160}
            height={32}
            className="h-8 w-auto"
            priority
          />
        ) : (
          <Image
            src="/brand/logo-mark-white.png"
            alt="StrataVerze"
            width={32}
            height={32}
            className="h-8 w-8"
            priority
          />
        )}
      </div>

      {/* Navigation items */}
      <nav className="flex-1 flex flex-col gap-1 px-2 overflow-y-auto">
        {nav.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href ||
            (item.href !== `/${portal}` && pathname.startsWith(item.href + '/'));

          return (
            <Link
              key={item.label}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={`group relative flex items-center gap-3 transition-colors ${
                expanded ? "px-3 py-2.5" : "justify-center py-2.5"
              } ${
                isActive
                  ? "bg-white text-ink rounded-l-none rounded-r-lg"
                  : "text-white hover:bg-white/15 rounded-[var(--radius-card)]"
              }`}
              title={!expanded ? item.label : undefined}
            >
              <Icon
                size={20}
                strokeWidth={1.5}
                className={`shrink-0 ${isActive ? "text-ink" : ""}`}
              />
              {expanded && (
                <span className="text-sm font-medium whitespace-nowrap">
                  {item.label}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
