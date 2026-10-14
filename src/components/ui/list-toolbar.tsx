"use client";

/**
 * A horizontal toolbar wrapper for search input and filter selects.
 * Stacks on mobile, flows horizontally on desktop.
 */
export function ListToolbar({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row gap-2 mb-6">{children}</div>
  );
}
