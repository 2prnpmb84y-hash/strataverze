import Link from 'next/link'

export default function PortalNotFound() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-ink">Page not found</h2>
        <p className="mt-2 text-sm text-ink-muted">
          The page you&apos;re looking for doesn&apos;t exist.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-block rounded-full bg-turquoise px-6 py-2.5 text-sm font-semibold text-white uppercase tracking-[0.04em] hover:bg-turquoise/90 transition-colors"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  )
}
