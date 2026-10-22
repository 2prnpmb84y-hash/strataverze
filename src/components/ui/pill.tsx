"use client";

import Link from "next/link";
import { CirclePlus } from "lucide-react";

type PillVariant = "section" | "action";

/**
 * Rounded pill used for the scheme section navigation, styled to the design:
 *  - "section": peach outline. Selected is filled peach.
 *  - "action": mint outline with a circled plus icon. Selected is filled mint.
 * All pills share one width so the rows line up as in the design.
 * Links use next/link so section changes are in-app navigations, not reloads.
 */
export function Pill({
  children,
  variant = "section",
  selected = false,
  onClick,
  href,
  className = "",
}: {
  children: React.ReactNode;
  variant?: PillVariant;
  selected?: boolean;
  onClick?: () => void;
  href?: string;
  className?: string;
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-full h-10 min-w-[150px] px-5 border-2 text-sm text-ink whitespace-nowrap transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40 focus-visible:ring-offset-2";

  const variants: Record<PillVariant, string> = {
    section: selected
      ? "bg-pill-peach border-pill-peach font-medium"
      : "bg-white border-pill-peach-line hover:bg-pill-peach-soft",
    action: selected
      ? "bg-pill-mint-line border-pill-mint-line font-medium"
      : "bg-white border-pill-mint-line hover:bg-pill-mint-soft",
  };

  const cls = `${base} ${variants[variant]} ${className}`;
  const icon =
    variant === "action" ? (
      <CirclePlus size={16} strokeWidth={1.75} aria-hidden="true" className="shrink-0" />
    ) : null;

  if (href) {
    return (
      <Link href={href} className={cls} aria-current={selected ? "page" : undefined}>
        {icon}
        {children}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={cls} aria-pressed={selected}>
      {icon}
      {children}
    </button>
  );
}
