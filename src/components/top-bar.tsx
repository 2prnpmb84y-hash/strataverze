"use client";

import { signOutAction } from "@/lib/actions/sessions";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Search,
  Bell,
  Settings,
  LogOut,
  ChevronDown,
  User,
  Home,
  Briefcase,
  Shield,
  Calculator,
  Users,
  ArrowLeftRight,
  LayoutDashboard,
} from "lucide-react";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { SearchDialog } from "@/components/search-dialog";

/* ------------------------------------------------------------------ */
/*  Portal accent colours (top-edge line)                             */
/* ------------------------------------------------------------------ */

const accentByPortal: Record<string, string> = {
  owner: "var(--color-owner)",
  committee: "var(--color-committee)",
  adviser: "var(--color-adviser)",
  supplier: "var(--color-supplier)",
  accountant: "var(--color-turquoise)",
};

const portalLabel: Record<string, string> = {
  owner: "Owner",
  committee: "Committee",
  adviser: "Adviser",
  supplier: "Supplier",
  accountant: "Accountant",
  admin: "StrataVerze Admin",
};

const portalIcon: Record<string, LucideIcon> = {
  owner: Home,
  committee: Users,
  adviser: Briefcase,
  supplier: Shield,
  accountant: Calculator,
  admin: LayoutDashboard,
};

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export function TopBar({
  user,
  portal,
  pageTitle,
  pendingInvitationCount = 0,
  otherPortals = [],
}: {
  user: SupabaseUser;
  portal: string;
  /** The other portals this person can use, for "Switch portal". */
  otherPortals?: string[];
  pageTitle?: string;
  pendingInvitationCount?: number;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const accent = accentByPortal[portal] ?? accentByPortal.owner;

  // Cmd+K / Ctrl+K to open search
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Close menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [menuOpen]);

  async function handleSignOut() {
    // On the server, so the sign-out is recorded and the session ended in
    // the app's register as well as in Supabase Auth (security stage S6).
    await signOutAction();
  }

  // Derive a display name
  const displayName =
    user.user_metadata?.full_name ??
    user.email?.split("@")[0] ??
    "Account";

  return (
    <header
      className="sticky top-0 z-30 flex items-center justify-between h-[80px] bg-white border-b border-line px-8"
      style={{ borderTop: `3px solid ${accent}` }}
    >
      {/* Left: portal indicator + page title */}
      {(() => {
        const PortalIconComponent = portalIcon[portal] ?? Home;
        return (
          <div className="flex items-center gap-3 min-w-0">
            <span className="flex items-center gap-2 shrink-0 rounded-lg bg-muted px-2.5 py-1.5">
              <span
                className="flex items-center justify-center w-6 h-6 rounded-md"
                style={{ backgroundColor: accent }}
              >
                <PortalIconComponent size={14} strokeWidth={1.5} className="text-white" />
              </span>
              <span className="text-sm font-medium text-ink whitespace-nowrap">
                {portalLabel[portal] ?? "Owner"}
              </span>
            </span>
            <h1 className="text-xl font-bold font-heading text-ink truncate">
              {pageTitle ?? ""}
            </h1>
          </div>
        );
      })()}

      {/* Right: actions */}
      <div className="flex items-center gap-3">
        {/* Search */}
        <button
          onClick={() => setSearchOpen(true)}
          className="flex items-center gap-2 rounded-full px-3 py-1.5 text-ink-muted hover:text-ink hover:bg-muted transition-colors"
          aria-label="Search (⌘K)"
        >
          <Search size={18} strokeWidth={1.5} />
          <span className="hidden lg:inline text-xs text-ink-muted">Search</span>
          <kbd className="hidden lg:inline-flex items-center rounded border border-line bg-muted px-1.5 py-0.5 text-[10px] font-medium text-ink-muted">
            ⌘K
          </kbd>
        </button>
        <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />

        {/* Notifications */}
        <Link
          href="/notifications"
          className="relative flex items-center justify-center w-10 h-10 rounded-full text-ink-muted hover:text-ink hover:bg-muted transition-colors"
          aria-label="Notifications"
        >
          <Bell size={20} strokeWidth={1.5} />
          {pendingInvitationCount > 0 && (
            <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-danger border-2 border-white" />
          )}
        </Link>

        {/* Settings */}
        <Link
          href="/settings"
          className={`flex items-center justify-center w-10 h-10 rounded-full transition-colors ${
            pathname === "/settings"
              ? "text-ink bg-muted"
              : "text-ink-muted hover:text-ink hover:bg-muted"
          }`}
          aria-label="Settings"
        >
          <Settings size={20} strokeWidth={1.5} />
        </Link>

        {/* Account dropdown */}
        <div ref={menuRef} className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2 rounded-full px-3 py-1.5 hover:bg-muted transition-colors"
            aria-expanded={menuOpen}
            aria-haspopup="true"
          >
            <span className="flex items-center justify-center w-8 h-8 rounded-full bg-turquoise text-white text-sm font-semibold">
              {displayName.charAt(0).toUpperCase()}
            </span>
            <span className="hidden lg:inline text-sm font-medium text-ink truncate max-w-[120px]">
              {displayName}
            </span>
            <ChevronDown size={14} className="text-ink-muted" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full mt-2 w-56 rounded-[var(--radius-card)] bg-white shadow-lg ring-1 ring-black/5 py-1 z-50">
              <div className="px-4 py-3 border-b border-line">
                <p className="text-sm font-medium text-ink truncate">
                  {displayName}
                </p>
                <p className="text-xs text-ink-muted truncate">
                  {user.email}
                </p>
              </div>
              <Link
                href="/settings"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-3 px-4 py-2.5 text-sm text-ink hover:bg-muted transition-colors"
              >
                <User size={16} strokeWidth={1.5} />
                Profile
              </Link>
              {otherPortals.some((p) => portalLabel[p]) && (
                <div className="border-t border-line py-1" role="group" aria-label="Switch portal">
                  <p className="flex items-center gap-2 px-4 pt-2 pb-1 text-xs font-medium uppercase tracking-wide text-ink-muted">
                    <ArrowLeftRight size={12} strokeWidth={1.5} />
                    Switch portal
                  </p>
                  {otherPortals.map((key) => {
                    const label = portalLabel[key];
                    if (!label) return null;
                    const Icon = portalIcon[key] ?? Home;
                    return (
                      <Link
                        key={key}
                        href={`/${key}`}
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm text-ink hover:bg-muted transition-colors"
                      >
                        <span
                          className="flex items-center justify-center w-5 h-5 rounded"
                          style={{ backgroundColor: accentByPortal[key] ?? "var(--color-turquoise)" }}
                        >
                          <Icon size={12} strokeWidth={1.5} className="text-white" />
                        </span>
                        {label}
                      </Link>
                    );
                  })}
                </div>
              )}
              <button
                onClick={handleSignOut}
                className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-danger hover:bg-muted transition-colors"
              >
                <LogOut size={16} strokeWidth={1.5} />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
