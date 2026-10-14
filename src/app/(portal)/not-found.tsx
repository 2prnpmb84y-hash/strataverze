import Link from 'next/link'

export default function PortalNotFound() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6">
      <div className="text-center">
        <h2 className="text-lg font-semibold">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-block rounded-lg bg-primary-400 px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary-500"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  )
}
