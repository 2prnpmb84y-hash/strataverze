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
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 text-center">
        <h2 className="text-lg font-semibold">Something went wrong</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {error.message || 'An unexpected error occurred.'}
        </p>
        <button
          onClick={() => retry()}
          className="mt-6 rounded-lg bg-primary-400 px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary-500"
        >
          Try again
        </button>
      </div>
    </div>
  )
}
