/**
 * StaticMap — renders an OpenStreetMap embed for a given address.
 * Falls back to a "View on Google Maps" link when JavaScript is disabled.
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
  const osmEmbedUrl = `https://www.openstreetmap.org/export/embed.html?bbox=&layer=mapnik&marker=&query=${encoded}`;

  return (
    <div className={`relative overflow-hidden rounded-[var(--radius-card)] bg-muted ${className}`}>
      <iframe
        title={`Map of ${address}`}
        src={osmEmbedUrl}
        className="w-full h-full border-0"
        loading="lazy"
        referrerPolicy="no-referrer"
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
