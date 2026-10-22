"use client";

import Link from "next/link";
import { Plus } from "lucide-react";

type PillVariant = "nav" | "create";

/**
 * Rounded pill used for scheme section navigation.
 *  - "nav": outlined turquoise, uppercase (the scheme navigation). Selected is filled.
 *  - "create": mint outline with a plus icon.
 * Links use next/link so section changes are in-app navigations, not reloads.
 */
export function Pill({
  children,
  variant = "nav",
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
    "inline-flex items-center justify-center gap-2 rounded-full h-10 px-6 transition-colors border-[1.5px] whitespace-nowrap cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-turquoise focus-visible:ring-offset-2";

  const variants: Record<PillVariant, string> = {
    nav: selected
      ? "bg-turquoise border-turquoise text-white text-[13px] font-medium uppercase tracking-[0.06em]"
      : "bg-white border-turquoise text-turquoise text-[13px] font-medium uppercase tracking-[0.06em] hover:bg-turquoise/10",
    create: selected
      ? "bg-mint-soft border-mint text-ink text-sm font-medium"
      : "bg-white border-mint text-ink text-sm font-medium hover:bg-mint-soft/30",
  };

  const cls = `${base} ${variants[variant]} ${className}`;

  if (href) {
    return (
      <Link
        href={href}
        className={cls}
        aria-current={selected ? "page" : undefined}
      >
        {variant === "create" && <Plus size={16} strokeWidth={2} />}
        {children}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cls}
      aria-pressed={selected}
    >
      {variant === "create" && <Plus size={16} strokeWidth={2} />}
      {children}
    </button>
  );
}
