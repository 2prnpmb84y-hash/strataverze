export default function Loading() {
  return (
    <div className="max-w-3xl space-y-6">
      <div className="mb-8">
        <div className="h-4 w-32 bg-muted rounded animate-pulse mb-2" />
        <div className="h-8 w-48 bg-muted rounded animate-pulse mb-1" />
        <div className="h-4 w-64 bg-muted rounded animate-pulse" />
      </div>
      <div className="rounded-[var(--radius-card)] bg-white border border-line p-6">
        <div className="flex flex-col gap-4">
          <div className="h-10 bg-muted rounded animate-pulse" />
          <div className="h-10 bg-muted rounded animate-pulse" />
          <div className="h-10 bg-muted rounded animate-pulse" />
        </div>
      </div>
    </div>
  );
}

