"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { LucideIcon } from "lucide-react";
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
  Home,
  Calculator,
  Wrench,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Portal identity                                                   */
/* ------------------------------------------------------------------ */

const portalAccent: Record<string, string> = {
  owner: "var(--color-owner)",
  adviser: "var(--color-adviser)",
  supplier: "var(--color-supplier)",
  accountant: "var(--color-turquoise)",
  admin: "var(--color-turquoise)",
};

const portalLabel: Record<string, string> = {
  owner: "Owner Portal",
  adviser: "Adviser Portal",
  supplier: "Supplier Portal",
  accountant: "Accountant Portal",
  admin: "StrataVerze Admin",
};

const portalIcon: Record<string, LucideIcon> = {
  owner: Home,
  adviser: Briefcase,
  supplier: Shield,
  accountant: Calculator,
  admin: Settings,
};

/* ------------------------------------------------------------------ */
/*  Navigation configuration per portal                               */
/* ------------------------------------------------------------------ */

type NavItem = { label: string; href: string; icon: LucideIcon; match?: string[] };

const ownerNav: NavItem[] = [
  { label: "Properties", href: "/owner/properties", icon: LayoutGrid },
  { label: "My Property", href: "/owner/scheme", icon: Building2 },
  { label: "Compliance", href: "/owner/compliance", icon: CheckSquare },
  { label: "Community", href: "/owner/contacts", icon: Users },
  // One entry for works: new requests, with earlier maintenance work orders linked from that page.
  { label: "Work Orders", href: "/owner/works", icon: Wrench, match: ["/owner/maintenance"] },
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

const adminNav = [
  { label: "Revenue", href: "/admin/revenue", icon: BarChart3 },
  { label: "Referral income", href: "/admin/referral-income", icon: CreditCard },
  { label: "Contractors", href: "/adviser/contractors", icon: UserPlus },
  { label: "Security", href: "/admin/security", icon: Shield },
  { label: "Audit log", href: "/admin/audit", icon: FileText },
];

const navByPortal: Record<string, NavItem[]> = {
  admin: adminNav,
  owner: ownerNav,
  adviser: adviserNav,
  supplier: supplierNav,
  accountant: accountantNav,
};

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export function SideRail({ portal, isPlatformAdmin = false }: { portal: string; isPlatformAdmin?: boolean }) {
  const pathname = usePathname();
  // Contractor review is StrataVerze staff work.
  const nav = (navByPortal[portal] ?? ownerNav).filter(
    (item) => isPlatformAdmin || item.href !== "/adviser/contractors",
  );

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
      <div className={`flex items-center justify-center px-3 pb-3 ${expanded ? "pt-1" : "pt-2"}`}>
        {expanded ? (
          <Image
            src="/brand/logo-horizontal-white.png"
            alt="StrataVerze"
            width={240}
            height={48}
            className="h-12 w-auto"
            priority
          />
        ) : (
          <Image
            src="/brand/logo-mark-white.png"
            alt="StrataVerze"
            width={36}
            height={36}
            className="h-9 w-9"
            priority
          />
        )}
      </div>

      {/* Portal identity badge */}
      {(() => {
        const PortalIconComponent = portalIcon[portal] ?? Home;
        const accent = portalAccent[portal] ?? portalAccent.owner;
        const label = portalLabel[portal] ?? "Owner Portal";
        return (
          <div className="flex items-center justify-center px-3 pb-4">
            {expanded ? (
              <span className="flex items-center gap-2.5 rounded-lg bg-white/15 px-3 py-1.5 w-full">
                <span
                  className="flex items-center justify-center w-7 h-7 rounded-md shrink-0"
                  style={{ backgroundColor: accent }}
                >
                  <PortalIconComponent size={16} strokeWidth={1.5} className="text-white" />
                </span>
                <span className="text-sm font-medium text-white whitespace-nowrap">
                  {label}
                </span>
              </span>
            ) : (
              <span
                className="flex items-center justify-center w-9 h-9 rounded-lg"
                style={{ backgroundColor: accent }}
                title={label}
              >
                <PortalIconComponent size={18} strokeWidth={1.5} className="text-white" />
              </span>
            )}
          </div>
        );
      })()}

      {/* Navigation items */}
      <nav className="flex-1 flex flex-col gap-1 px-2 overflow-y-auto">
        {nav.map((item) => {
          const Icon = item.icon;
          const under = (href: string) => pathname === href || pathname.startsWith(href + '/');
          const isActive =
            pathname === item.href ||
            (item.href !== `/${portal}` && pathname.startsWith(item.href + '/')) ||
            (item.match ?? []).some(under);

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
