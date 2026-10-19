export default function ApprovalsLoading() {
  return (
    <div className="max-w-4xl animate-pulse">
      {/* Header skeleton */}
      <div className="mb-6">
        <div className="h-3 w-24 bg-muted rounded mb-2" />
        <div className="h-7 w-64 bg-muted rounded mb-1" />
        <div className="h-4 w-96 bg-muted rounded" />
      </div>

      {/* Pending approvals card */}
      <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5 mb-6">
        <div className="h-5 w-40 bg-muted rounded mb-4" />
        <div className="flex flex-col gap-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="rounded-[var(--radius-card)] bg-surface-muted px-4 py-3">
              <div className="h-4 w-48 bg-muted rounded mb-2" />
              <div className="h-3 w-64 bg-muted rounded" />
            </div>
          ))}
        </div>
      </div>

      {/* Routes card */}
      <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5 mb-6">
        <div className="h-5 w-36 bg-muted rounded mb-4" />
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-[var(--radius-card)] bg-surface-muted px-4 py-3">
              <div className="h-4 w-40 bg-muted rounded mb-2" />
              <div className="h-3 w-56 bg-muted rounded" />
            </div>
          ))}
        </div>
      </div>

      {/* Delegations card */}
      <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
        <div className="h-5 w-44 bg-muted rounded mb-4" />
        <div className="flex flex-col gap-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="rounded-[var(--radius-card)] bg-surface-muted px-4 py-3">
              <div className="h-4 w-52 bg-muted rounded mb-2" />
              <div className="h-3 w-40 bg-muted rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
