export default function WorksLoading() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="mb-8">
        <div className="h-4 w-32 bg-muted rounded animate-pulse mb-2" />
        <div className="h-8 w-48 bg-muted rounded animate-pulse mb-1" />
        <div className="h-4 w-64 bg-muted rounded animate-pulse" />
      </div>

      {/* Stat cards skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-[var(--radius-card)] bg-white border border-line p-5"
          >
            <div className="w-2.5 h-2.5 rounded-full bg-muted mb-3 animate-pulse" />
            <div className="h-3 w-20 bg-muted rounded animate-pulse mb-2" />
            <div className="h-7 w-12 bg-muted rounded animate-pulse" />
          </div>
        ))}
      </div>

      {/* List skeleton */}
      <div className="flex flex-col gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="rounded-[var(--radius-card)] bg-white border border-line px-5 py-4"
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="h-3 w-16 bg-muted rounded animate-pulse" />
              <div className="h-5 w-20 bg-muted rounded-full animate-pulse" />
            </div>
            <div className="h-4 w-64 bg-muted rounded animate-pulse mb-1" />
            <div className="h-3 w-40 bg-muted rounded animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
