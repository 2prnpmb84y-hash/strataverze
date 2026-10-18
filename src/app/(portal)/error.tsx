'use client'

import { useEffect } from 'react'

export default function PortalError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6">
      <div className="w-full max-w-md rounded-[var(--radius-card)] border border-line bg-white p-6 text-center">
        <h2 className="text-lg font-semibold text-ink">Something went wrong</h2>
        <p className="mt-2 text-sm text-ink-muted">
          An unexpected error occurred. Please try again or contact support if the
          problem persists.
        </p>
        <button
          onClick={() => retry()}
          className="mt-6 rounded-full bg-turquoise px-6 py-2.5 text-sm font-semibold text-white uppercase tracking-[0.04em] hover:bg-turquoise/90 transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  )
}
