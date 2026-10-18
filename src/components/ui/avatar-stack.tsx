"use client";

type AvatarStackProps = {
  /** Array of people to display */
  people: { name: string; imageUrl?: string }[];
  /** Maximum avatars to show before the "+N" bubble. Defaults to 3. */
  max?: number;
  /** Avatar size in pixels. Defaults to 32. */
  size?: number;
};

/**
 * Overlapping circular avatars with a 2px white ring.
 * Shows initials on a mint background when no image is provided.
 * Excess avatars show a "+N" bubble.
 */
export function AvatarStack({ people, max = 3, size = 32 }: AvatarStackProps) {
  const visible = people.slice(0, max);
  const overflow = people.length - max;

  function getInitials(name: string): string {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return (parts[0]?.[0] ?? "?").toUpperCase();
  }

  const overlap = size * 0.3; // 30% overlap

  return (
    <div className="flex items-center" style={{ direction: "ltr" }}>
      {visible.map((person, i) => (
        <div
          key={`${person.name}-${i}`}
          className="relative rounded-full border-2 border-white bg-white"
          style={{
            width: size,
            height: size,
            marginLeft: i > 0 ? -overlap : 0,
            zIndex: visible.length - i,
          }}
          title={person.name}
        >
          {person.imageUrl ? (
            <img
              src={person.imageUrl}
              alt={person.name}
              className="w-full h-full rounded-full object-cover"
            />
          ) : (
            <div
              className="w-full h-full rounded-full bg-mint flex items-center justify-center"
              style={{ fontSize: size * 0.38 }}
            >
              <span className="font-medium text-white leading-none select-none">
                {getInitials(person.name)}
              </span>
            </div>
          )}
        </div>
      ))}

      {overflow > 0 && (
        <div
          className="relative rounded-full border-2 border-white bg-ink-muted/15 flex items-center justify-center"
          style={{
            width: size,
            height: size,
            marginLeft: -overlap,
            zIndex: 0,
          }}
        >
          <span
            className="font-medium text-ink-muted leading-none select-none"
            style={{ fontSize: size * 0.34 }}
          >
            +{overflow}
          </span>
        </div>
      )}
    </div>
  );
}
