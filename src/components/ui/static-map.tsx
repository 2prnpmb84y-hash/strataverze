/**
 * Builds the map embed URL for an address.
 *
 * With NEXT_PUBLIC_GOOGLE_MAPS_EMBED_API_KEY set, this uses the official Google
 * Maps Embed API (place mode), which Google documents as free with unlimited
 * usage. Without a key it falls back to the keyless maps.google.com embed,
 * which works today but is not a documented Google API and could stop working.
 */
export function mapEmbedUrl(address: string, apiKey?: string): string {
  const q = encodeURIComponent(address);
  if (apiKey) {
    return `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(apiKey)}&q=${q}`;
  }
  return `https://maps.google.com/maps?q=${q}&z=16&output=embed`;
}

/**
 * StaticMap renders an embedded map for a given address, with a
 * "View on Maps" link that opens Google Maps in a new tab.
 */
export function StaticMap({
  address,
  className = "",
}: {
  address: string;
  className?: string;
}) {
  const encoded = encodeURIComponent(address);
  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encoded}`;
  const embedUrl = mapEmbedUrl(
    address,
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_API_KEY || undefined,
  );

  return (
    <div className={`relative overflow-hidden rounded-[var(--radius-card)] bg-muted ${className}`}>
      <iframe
        title={`Map of ${address}`}
        src={embedUrl}
        className="w-full h-full border-0"
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
      />
      <a
        href={googleMapsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="absolute bottom-2 right-2 inline-flex items-center gap-1.5 rounded-[var(--radius-card)] bg-white/90 backdrop-blur-sm border border-line px-3 py-1.5 text-xs font-medium text-ink hover:bg-white transition-colors shadow-sm"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          className="shrink-0"
        >
          <path
            d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <polyline
            points="15 3 21 3 21 9"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <line
            x1="10"
            y1="14"
            x2="21"
            y2="3"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        View on Maps
      </a>
    </div>
  );
}
