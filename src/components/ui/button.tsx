import Link from "next/link";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-primary-400 text-white hover:bg-primary-500 focus:ring-primary-400",
  secondary:
    "bg-background border border-border text-foreground hover:bg-muted focus:ring-primary-400",
  danger:
    "bg-red-500 text-white hover:bg-red-600 focus:ring-red-400",
  ghost:
    "text-muted-foreground hover:text-foreground hover:bg-muted focus:ring-primary-400",
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
  const base = `inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ${variantStyles[variant]} ${className}`;

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
