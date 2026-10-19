export default function VariationsLoading() {
  return (
    <div className="max-w-4xl animate-pulse">
      <div className="mb-6">
        <div className="h-3 w-24 bg-muted rounded mb-2" />
        <div className="h-7 w-48 bg-muted rounded mb-1" />
        <div className="h-4 w-72 bg-muted rounded" />
      </div>
      <div className="flex gap-2 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-7 w-20 bg-muted rounded-full" />
        ))}
      </div>
      <div className="rounded-[var(--radius-card)] border border-line bg-surface">
        <div className="flex flex-col divide-y divide-line">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between px-5 py-4">
              <div>
                <div className="h-4 w-48 bg-muted rounded mb-2" />
                <div className="h-3 w-32 bg-muted rounded" />
              </div>
              <div className="flex items-center gap-3">
                <div className="h-4 w-20 bg-muted rounded" />
                <div className="h-6 w-16 bg-muted rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
