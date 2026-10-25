/**
 * A building's small photo for lists (25 Oct 2026), or a neutral building
 * placeholder when it has none. `url` is a signed link made on the server.
 */
export function SchemeThumb({ url, name, size = 40 }: { url: string | null; name: string; size?: number }) {
  const box = { width: size, height: size };
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt={`${name} property photo`} style={box} className="shrink-0 rounded-lg object-cover bg-muted" />
    );
  }
  return (
    <span
      style={box}
      className="shrink-0 inline-flex items-center justify-center rounded-lg bg-white border border-line text-ink-muted/60"
      role="img"
      aria-label={`${name}, no photo yet`}
      data-placeholder="true"
    >
      <svg width={Math.round(size * 0.5)} height={Math.round(size * 0.5)} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16M14 9h5a1 1 0 0 1 1 1v11M2 21h20M8 8h2M8 12h2M8 16h2M17 13h0M17 17h0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
