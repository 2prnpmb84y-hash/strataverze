"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { SideRail } from "@/components/side-rail";
import { TopBar } from "@/components/top-bar";

/* ------------------------------------------------------------------ */
/*  Portal metadata                                                   */
/* ------------------------------------------------------------------ */

const portalConfig = {
  owner: {
    label: "Owner Portal",
    shortLabel: "Owner",
    colour: "bg-owner",
  },
  adviser: {
    label: "Adviser Portal",
    shortLabel: "Adviser",
    colour: "bg-adviser",
  },
  supplier: {
    label: "Supplier Portal",
    shortLabel: "Supplier",
    colour: "bg-supplier",
  },
  accountant: {
    label: "Accountant Portal",
    shortLabel: "Accountant",
    colour: "bg-turquoise",
  },
} as const;

type PortalKey = keyof typeof portalConfig;

/* ------------------------------------------------------------------ */
/*  Page title map — derives a display title from the current route    */
/* ------------------------------------------------------------------ */

const pageTitles: Record<string, string> = {
  "": "Dashboard",
  dashboard: "Dashboard",
  scheme: "My Property",
  compliance: "Compliance",
  contacts: "Community",
  maintenance: "Work Orders",
  levies: "Levies & Finance",
  documents: "Documents",
  meetings: "Meetings",
  bylaws: "By-laws",
  insurance: "Insurance",
  announcements: "Announcements",
  notifications: "Notifications",
  finance: "Finance",
  governance: "Governance",
  schemes: "Schemes",
  reporting: "Reporting",
  quotes: "Quote Requests",
  "my-quotes": "My Quotes",
  "work-orders": "Work Orders",
  invoices: "Invoices",
  settings: "Settings",
  invitations: "Invitations",
};

function derivePageTitle(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean);
  // Try the second segment first (e.g. /owner/levies -> "levies")
  if (parts.length >= 2) {
    const key = parts[1];
    if (pageTitles[key]) return pageTitles[key];
  }
  // Fall back to portal root title
  return pageTitles[""] ?? "Dashboard";
}

/* ------------------------------------------------------------------ */
/*  Mobile nav items (kept for the mobile horizontal scroll nav)       */
/* ------------------------------------------------------------------ */

const ownerBaseNav = [
  { label: "Dashboard", href: "/owner" },
  { label: "My Property", href: "/owner/scheme" },
  { label: "Compliance", href: "/owner/compliance" },
  { label: "Community", href: "/owner/contacts" },
  { label: "Work Orders", href: "/owner/maintenance" },
  { label: "Levies & Finance", href: "/owner/levies" },
  { label: "Documents", href: "/owner/documents" },
  { label: "Meetings", href: "/owner/meetings" },
  { label: "By-laws", href: "/owner/bylaws" },
  { label: "Insurance", href: "/owner/insurance" },
  { label: "Contacts", href: "/owner/contacts" },
  { label: "Announcements", href: "/owner/announcements" },
];

const committeeExtraNav = [
  { label: "Finance", href: "/owner/finance" },
  { label: "Governance", href: "/owner/governance" },
  { label: "Compliance", href: "/owner/compliance" },
];

function buildOwnerNav(isCommitteeMember: boolean) {
  if (!isCommitteeMember) return ownerBaseNav;
  const nav = [...ownerBaseNav];
  nav.splice(3, 0, ...committeeExtraNav);
  return nav;
}

const adviserNav = [
  { label: "Dashboard", href: "/adviser" },
  { label: "Schemes", href: "/adviser/schemes" },
  { label: "Compliance", href: "/adviser/compliance" },
  { label: "Reporting", href: "/adviser/reporting" },
];

const supplierNav = [
  { label: "Dashboard", href: "/supplier" },
  { label: "Quote Requests", href: "/supplier/quotes" },
  { label: "My Quotes", href: "/supplier/my-quotes" },
  { label: "Work Orders", href: "/supplier/work-orders" },
  { label: "Invoices", href: "/supplier/invoices" },
];

const accountantNav = [
  { label: "Dashboard", href: "/accountant" },
  { label: "Schemes", href: "/accountant/schemes" },
];

const mobileNavByPortal: Record<string, typeof ownerBaseNav> = {
  adviser: adviserNav,
  supplier: supplierNav,
  accountant: accountantNav,
};

/* ------------------------------------------------------------------ */
/*  Shell component                                                   */
/* ------------------------------------------------------------------ */

export function PortalShell({
  user,
  availablePortals = [],
  isCommitteeMember = false,
  pendingInvitationCount = 0,
  children,
}: {
  user: User;
  availablePortals?: string[];
  isCommitteeMember?: boolean;
  pendingInvitationCount?: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const segment = pathname.split("/")[1] as PortalKey;
  const portal = segment in portalConfig ? segment : "owner";
  const portalMeta = portalConfig[portal as PortalKey] ?? portalConfig.owner;

  // Mobile nav
  const mobileNav =
    portal === "owner"
      ? buildOwnerNav(isCommitteeMember)
      : mobileNavByPortal[portal] ?? ownerBaseNav;

  const otherPortals = availablePortals.filter((p) => p !== portal);
  const pageTitle = derivePageTitle(pathname);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <div className="flex min-h-screen">
      {/* Skip to content */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-[var(--radius-card)] focus:bg-turquoise focus:px-4 focus:py-2 focus:text-white focus:text-sm focus:font-medium focus:shadow-lg"
      >
        Skip to main content
      </a>

      {/* Desktop side rail */}
      <SideRail portal={portal} />

      {/* Main column */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Mobile header */}
        <header className="md:hidden flex items-center justify-between rail-gradient px-4 py-3">
          <Image
            src="/brand/logo-horizontal-white.png"
            alt="StrataVerze"
            width={120}
            height={24}
            className="h-6 w-auto"
            priority
          />
          <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-medium text-white">
            {portalMeta.label}
          </span>
        </header>

        {/* Mobile nav */}
        <nav
          className="md:hidden flex gap-1 overflow-x-auto px-4 py-2 border-b border-line bg-white"
          aria-label="Main navigation"
        >
          {mobileNav.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== `/${portal}` && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={`shrink-0 rounded-[var(--radius-card)] px-3 py-1.5 text-xs font-medium transition-colors ${
                  isActive
                    ? "bg-muted text-ink"
                    : "text-ink-muted hover:text-ink"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
          {otherPortals.map((key) => {
            const config = portalConfig[key as PortalKey];
            if (!config) return null;
            return (
              <Link
                key={key}
                href={`/${key}`}
                className="shrink-0 flex items-center gap-1.5 rounded-[var(--radius-card)] px-3 py-1.5 text-xs font-medium text-ink-muted hover:text-ink transition-colors"
              >
                <span className={`w-1.5 h-1.5 rounded-full ${config.colour}`} />
                {config.shortLabel}
              </Link>
            );
          })}
          {pendingInvitationCount > 0 && (
            <Link
              href="/invitations"
              className={`shrink-0 flex items-center gap-1.5 rounded-[var(--radius-card)] px-3 py-1.5 text-xs font-medium transition-colors ${
                pathname === "/invitations"
                  ? "bg-muted text-ink"
                  : "text-ink-muted hover:text-ink"
              }`}
            >
              Invitations
              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-turquoise text-[9px] font-bold text-white">
                {pendingInvitationCount}
              </span>
            </Link>
          )}
          <Link
            href="/settings"
            className={`shrink-0 rounded-[var(--radius-card)] px-3 py-1.5 text-xs font-medium transition-colors ${
              pathname === "/settings"
                ? "bg-muted text-ink"
                : "text-ink-muted hover:text-ink"
            }`}
          >
            Settings
          </Link>
        </nav>

        {/* Desktop top bar */}
        <div className="hidden md:block">
          <TopBar
            user={user}
            portal={portal}
            pageTitle={pageTitle}
            pendingInvitationCount={pendingInvitationCount}
          />
        </div>

        {/* Main content */}
        <main
          id="main-content"
          className="flex-1 p-6 md:px-8 md:py-8 bg-muted"
        >
          <div className="max-w-[1200px] mx-auto">{children}</div>
        </main>
      </div>
    </div>
  );
}
