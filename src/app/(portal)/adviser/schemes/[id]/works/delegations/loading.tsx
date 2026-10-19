export default function DelegationsLoading() {
  return (
    <div className="max-w-3xl animate-pulse">
      <div className="mb-6">
        <div className="h-3 w-24 bg-muted rounded mb-2" />
        <div className="h-7 w-48 bg-muted rounded mb-1" />
        <div className="h-4 w-72 bg-muted rounded" />
      </div>
      <div className="rounded-[var(--radius-card)] border border-line bg-surface p-6">
        <div className="flex flex-col gap-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-10 bg-muted rounded-[var(--radius-card)]" />
          ))}
        </div>
      </div>
    </div>
  );
}
