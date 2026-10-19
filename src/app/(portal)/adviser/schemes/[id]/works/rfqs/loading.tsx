export default function Loading() {
  return (
    <div className="max-w-4xl space-y-6">
      {/* Header skeleton */}
      <div className="mb-8">
        <div className="h-4 w-32 bg-muted rounded animate-pulse mb-2" />
        <div className="h-8 w-48 bg-muted rounded animate-pulse mb-1" />
        <div className="h-4 w-64 bg-muted rounded animate-pulse" />
      </div>

      {/* Content skeleton */}
      <div className="flex flex-col gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-[var(--radius-card)] bg-white border border-line px-5 py-4"
          >
            <div className="h-4 w-48 bg-muted rounded animate-pulse mb-2" />
            <div className="h-3 w-32 bg-muted rounded animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
