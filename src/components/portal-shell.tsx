"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

const portalConfig = {
  owner: {
    label: "Owner Portal",
    shortLabel: "Owner",
    colour: "bg-owner",
    textColour: "text-owner",
    nav: [
      { label: "Overview", href: "/owner" },
      { label: "My Scheme", href: "/owner/scheme" },
      { label: "Levies", href: "/owner/levies" },
      { label: "Meetings", href: "/owner/meetings" },
      { label: "Maintenance", href: "/owner/maintenance" },
      { label: "Documents", href: "/owner/documents" },
    ],
  },
  committee: {
    label: "Committee Portal",
    shortLabel: "Committee",
    colour: "bg-committee",
    textColour: "text-committee",
    nav: [
      { label: "Overview", href: "/committee" },
      { label: "Finance", href: "/committee/finance" },
      { label: "Governance", href: "/committee/governance" },
      { label: "Maintenance", href: "/committee/maintenance" },
      { label: "Documents", href: "/committee/documents" },
      { label: "Compliance", href: "/committee/compliance" },
    ],
  },
  adviser: {
    label: "Adviser Portal",
    shortLabel: "Adviser",
    colour: "bg-adviser",
    textColour: "text-adviser",
    nav: [
      { label: "Overview", href: "/adviser" },
      { label: "Schemes", href: "/adviser/schemes" },
      { label: "Reporting", href: "/adviser/reporting" },
      { label: "Compliance", href: "/adviser/compliance" },
    ],
  },
} as const;

type PortalKey = keyof typeof portalConfig;

export function PortalShell({
  user,
  availablePortals = [],
  children,
}: {
  user: User;
  availablePortals?: string[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  // Determine which portal we're in from the URL
  const segment = pathname.split("/")[1] as PortalKey;
  const portal = portalConfig[segment] ?? portalConfig.owner;

  // Other portals this user can switch to
  const otherPortals = availablePortals.filter((p) => p !== segment);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <div className="flex min-h-full">
      {/* Sidebar */}
      <aside className="hidden md:flex w-64 flex-col sidebar-gradient">
        <div className="flex items-center gap-3 px-6 pt-8 pb-6">
          <div className="w-8 h-8 rounded-lg bg-white/30" />
          <span className="text-lg font-bold font-heading text-white tracking-tight">
            StrataVerze
          </span>
        </div>

        <div className="px-4 mb-4">
          <span className="inline-block rounded-full bg-white/20 px-3 py-1 text-xs font-medium text-white">
            {portal.label}
          </span>
        </div>

        <nav className="flex-1 px-3 flex flex-col gap-0.5">
          {portal.nav.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== `/${segment}` &&
                pathname.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-white/25 text-white"
                    : "text-white/80 hover:bg-white/15 hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Portal switcher */}
        {otherPortals.length > 0 && (
          <div className="px-3 pb-2">
            <p className="px-3 mb-1.5 text-[10px] uppercase tracking-widest text-white/50 font-medium">
              Switch portal
            </p>
            <div className="flex flex-col gap-0.5">
              {otherPortals.map((key) => {
                const config = portalConfig[key as PortalKey];
                if (!config) return null;
                return (
                  <Link
                    key={key}
                    href={`/${key}`}
                    className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-white/70 hover:bg-white/15 hover:text-white transition-colors"
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${config.colour}`}
                    />
                    {config.shortLabel}
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Settings & user info */}
        <div className="mt-auto">
          <div className="px-3 pb-2 border-t border-white/20 pt-3">
            <Link
              href="/settings"
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                pathname === "/settings"
                  ? "bg-white/25 text-white"
                  : "text-white/80 hover:bg-white/15 hover:text-white"
              }`}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                className="shrink-0"
              >
                <path
                  d="M6.86 2.572a1.25 1.25 0 0 1 2.28 0l.384.838a1.25 1.25 0 0 0 1.142.744l.921.017a1.25 1.25 0 0 1 1.14 1.971l-.538.75a1.25 1.25 0 0 0-.143 1.35l.43.816a1.25 1.25 0 0 1-.73 1.788l-.876.298a1.25 1.25 0 0 0-.847.984l-.143.912a1.25 1.25 0 0 1-2.121.678l-.658-.66a1.25 1.25 0 0 0-1.354-.276l-.84.387a1.25 1.25 0 0 1-1.788-.73l-.298-.876a1.25 1.25 0 0 0-.984-.847l-.912-.143A1.25 1.25 0 0 1 1.39 7.46l.66-.658a1.25 1.25 0 0 0 .276-1.354l-.387-.84a1.25 1.25 0 0 1 .73-1.788l.876-.298a1.25 1.25 0 0 0 .847-.984l.143-.912a.104.104 0 0 1 .004-.02L6.86 2.572Z"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.2" />
              </svg>
              Settings
            </Link>
          </div>
          <div className="px-4 py-4 border-t border-white/20">
            <p className="text-xs text-white/70 truncate mb-2">
              {user.email}
            </p>
            <button
              onClick={handleSignOut}
              className="text-xs text-white/60 hover:text-white transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="flex flex-col flex-1">
        <header className="md:hidden flex items-center justify-between sidebar-gradient px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-white/30" />
            <span className="text-base font-bold font-heading text-white">
              StrataVerze
            </span>
          </div>
          <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-medium text-white">
            {portal.label}
          </span>
        </header>

        {/* Mobile nav */}
        <nav className="md:hidden flex gap-1 overflow-x-auto px-4 py-2 border-b border-border bg-card">
          {portal.nav.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== `/${segment}` &&
                pathname.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  isActive
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground"
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
                className="shrink-0 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${config.colour}`}
                />
                {config.shortLabel}
              </Link>
            );
          })}
          <Link
            href="/settings"
            className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              pathname === "/settings"
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Settings
          </Link>
        </nav>

        {/* Main content */}
        <main className="flex-1 p-6 bg-muted">{children}</main>
      </div>
    </div>
  );
}
