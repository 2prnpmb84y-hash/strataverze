"use client";

import { Plus } from "lucide-react";

type PillVariant = "nav" | "create";

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
    "inline-flex items-center gap-2 rounded-full h-9 px-6 text-sm font-medium transition-colors border-[1.5px] whitespace-nowrap cursor-pointer";

  const variants: Record<PillVariant, string> = {
    nav: selected
      ? "bg-peach border-gold-line text-ink"
      : "bg-white border-gold-line text-ink hover:bg-peach/30",
    create: selected
      ? "bg-mint-soft border-mint text-ink"
      : "bg-white border-mint text-ink hover:bg-mint-soft/30",
  };

  const cls = `${base} ${variants[variant]} ${className}`;

  if (href) {
    return (
      <a href={href} className={cls}>
        {variant === "create" && <Plus size={16} strokeWidth={2} />}
        {children}
      </a>
    );
  }

  return (
    <button type="button" onClick={onClick} className={cls}>
      {variant === "create" && <Plus size={16} strokeWidth={2} />}
      {children}
    </button>
  );
}
