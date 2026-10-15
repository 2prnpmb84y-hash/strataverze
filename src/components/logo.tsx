interface LogoMarkProps {
  size?: number;
  variant?: 'gradient' | 'white' | 'dark';
  className?: string;
}

/**
 * StrataVerze gear mark — buildings in circular formation.
 * Variants: gradient (light bg), white (dark bg), dark (mono print).
 */
export function LogoMark({ size = 32, variant = 'gradient', className = '' }: LogoMarkProps) {
  const gradientId = `sv-grad-${size}`;

  const fill =
    variant === 'white'
      ? '#FFFFFF'
      : variant === 'dark'
        ? '#1A202C'
        : `url(#${gradientId})`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="StrataVerze logo"
    >
      {variant === 'gradient' && (
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
            <stop stopColor="#00D4BF" />
            <stop offset="1" stopColor="#A6B4FF" />
          </linearGradient>
        </defs>
      )}

      {/* Outer gear ring with building-shaped teeth */}
      <path
        d={[
          // Centre ring
          'M32 12a20 20 0 0 1 0 40a20 20 0 0 1 0-40Z',
          'M32 18a14 14 0 0 0 0 28a14 14 0 0 0 0-28Z',
          // Building teeth — 8 blocks at compass points, varying heights
          // Top
          'M29 4h6v10h-6z',
          // Top-right
          'M44.5 9.5l4.2 4.2l-7.1 7.1l-4.2-4.2z',
          // Right
          'M50 29h10v6H50z',
          // Bottom-right
          'M44.5 54.5l4.2-4.2l-7.1-7.1l-4.2 4.2z',
          // Bottom
          'M29 50h6v10h-6z',
          // Bottom-left
          'M9.3 50.3l4.2 4.2l7.1-7.1l-4.2-4.2z',
          // Left
          'M4 29h10v6H4z',
          // Top-left
          'M13.5 13.5l4.2-4.2l7.1 7.1l-4.2 4.2z',
        ].join(' ')}
        fill={fill}
        fillRule="evenodd"
      />

      {/* Inner building cluster — 3 buildings of different heights */}
      <rect x="25" y="26" width="4" height="12" rx="0.5" fill={fill} />
      <rect x="30" y="23" width="4" height="15" rx="0.5" fill={fill} />
      <rect x="35" y="28" width="4" height="10" rx="0.5" fill={fill} />
    </svg>
  );
}

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  variant?: 'gradient' | 'white' | 'dark';
  className?: string;
  showWordmark?: boolean;
}

const sizeMap = {
  sm: { mark: 24, text: 'text-sm', gap: 'gap-2' },
  md: { mark: 32, text: 'text-xl', gap: 'gap-2.5' },
  lg: { mark: 40, text: 'text-2xl', gap: 'gap-3' },
} as const;

/**
 * Full StrataVerze logo — gear mark + wordmark.
 */
export function Logo({
  size = 'md',
  variant = 'gradient',
  className = '',
  showWordmark = true,
}: LogoProps) {
  const s = sizeMap[size];
  const textColour =
    variant === 'white' ? 'text-white' : 'text-foreground';

  return (
    <div className={`flex items-center ${s.gap} ${className}`}>
      <LogoMark size={s.mark} variant={variant} />
      {showWordmark && (
        <span
          className={`${s.text} font-bold font-heading ${textColour} tracking-tight`}
        >
          StrataVerze
        </span>
      )}
    </div>
  );
}
