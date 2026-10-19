import Link from "next/link";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-turquoise text-white hover:bg-turquoise/90 focus:ring-turquoise",
  secondary:
    "bg-white border-[1.5px] border-turquoise text-turquoise hover:bg-turquoise/5 focus:ring-turquoise",
  danger:
    "bg-white border-[1.5px] border-[#E88A7A] text-[#D4604E] hover:bg-[#FFF0ED] focus:ring-[#E88A7A]",
  ghost:
    "text-ink-muted hover:text-ink hover:bg-muted focus:ring-turquoise",
};

export function Button({
  children,
  variant = "primary",
  href,
  className = "",
  disabled,
  ...props
}: {
  children: React.ReactNode;
  variant?: ButtonVariant;
  href?: string;
  className?: string;
  disabled?: boolean;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "className">) {
  const base = `inline-flex items-center justify-center gap-2 rounded-full px-6 h-10 text-[13px] font-semibold uppercase tracking-[0.04em] transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ${variantStyles[variant]} ${className}`;

  if (href && !disabled) {
    return (
      <Link href={href} className={base}>
        {children}
      </Link>
    );
  }

  return (
    <button className={base} disabled={disabled} {...props}>
      {children}
    </button>
  );
}
