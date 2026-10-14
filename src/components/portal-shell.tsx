"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

const portalConfig = {
  owner: {
    label: "Owner Portal",
    colour: "bg-owner",
    textColour: "text-owner",
    nav: [
      { label: "Overview", href: "/owner" },
      { label: "Levies", href: "/owner/levies" },
      { label: "Meetings", href: "/owner/meetings" },
      { label: "Documents", href: "/owner/documents" },
    ],
  },
  committee: {
    label: "Committee Portal",
    colour: "bg-committee",
    textColour: "text-committee",
    nav: [
      { label: "Overview", href: "/committee" },
      { label: "Finance", href: "/committee/finance" },
      { label: "Governance", href: "/committee/governance" },
      { label: "Maintenance", href: "/committee/maintenance" },
    ],
  },
  adviser: {
    label: "Adviser Portal",
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
  children,
}: {
  user: User;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  // Determine which portal we're in from the URL
  const segment = pathname.split("/")[1] as PortalKey;
  const portal = portalConfig[segment] ?? portalConfig.owner;

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

        {/* User info */}
        <div className="px-4 py-4 mt-auto border-t border-white/20">
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
        </nav>

        {/* Main content */}
        <main className="flex-1 p-6 bg-muted">{children}</main>
      </div>
    </div>
  );
}
