import Image from "next/image";

interface LogoMarkProps {
  size?: number;
  variant?: "gradient" | "white" | "dark";
  className?: string;
}

/**
 * StrataVerze mark (ring of building silhouettes).
 * Uses the real brand asset PNGs from /brand/.
 */
export function LogoMark({
  size = 32,
  variant = "gradient",
  className = "",
}: LogoMarkProps) {
  const src =
    variant === "white"
      ? "/brand/logo-mark-white.png"
      : variant === "dark"
        ? "/brand/logo-mark-black.png"
        : "/brand/logo-mark-gradient.png";

  return (
    <Image
      src={src}
      alt="StrataVerze"
      width={size}
      height={size}
      className={className}
      priority
    />
  );
}

interface LogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  variant?: "gradient" | "white" | "dark";
  className?: string;
  showWordmark?: boolean;
}

const sizeMap = {
  sm: { mark: 28, imgHeight: "h-7", gap: "gap-2" },
  md: { mark: 36, imgHeight: "h-9", gap: "gap-2.5" },
  lg: { mark: 48, imgHeight: "h-12", gap: "gap-3" },
  xl: { mark: 64, imgHeight: "h-16", gap: "gap-4" },
} as const;

/**
 * Full StrataVerze logo with horizontal lockup.
 * Uses the real brand asset PNGs from /brand/.
 */
export function Logo({
  size = "md",
  variant = "gradient",
  className = "",
  showWordmark = true,
}: LogoProps) {
  const s = sizeMap[size];

  if (showWordmark) {
    // Use the horizontal lockup PNG (includes both mark + wordmark)
    const src =
      variant === "white"
        ? "/brand/logo-horizontal-white.png"
        : variant === "dark"
          ? "/brand/logo-horizontal-black.png"
          : "/brand/logo-horizontal-gradient.png";

    return (
      <Image
        src={src}
        alt="StrataVerze"
        width={s.mark * 5}
        height={s.mark}
        className={`${s.imgHeight} w-auto ${className}`}
        priority
      />
    );
  }

  return <LogoMark size={s.mark} variant={variant} className={className} />;
}
