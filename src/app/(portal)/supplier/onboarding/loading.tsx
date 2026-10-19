export default function OnboardingLoading() {
  return (
    <div className="space-y-6">
      {/* Progress bar skeleton */}
      <div className="flex items-center justify-between gap-2 py-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2 flex-1">
            <div className="h-8 w-8 animate-pulse rounded-full bg-muted shrink-0" />
            {i < 7 && <div className="h-0.5 flex-1 animate-pulse bg-muted" />}
          </div>
        ))}
      </div>

      {/* Card skeleton */}
      <div className="rounded-[var(--radius-card)] bg-white border border-line p-6 space-y-4">
        <div className="h-6 w-48 animate-pulse rounded bg-muted" />
        <div className="h-4 w-72 animate-pulse rounded bg-muted" />
        <div className="space-y-3 mt-6">
          <div className="h-10 animate-pulse rounded-[var(--radius-card)] bg-muted" />
          <div className="h-10 animate-pulse rounded-[var(--radius-card)] bg-muted" />
          <div className="h-10 animate-pulse rounded-[var(--radius-card)] bg-muted" />
        </div>
      </div>
    </div>
  );
}
