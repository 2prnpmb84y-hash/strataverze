import Link from "next/link";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          {/* A full page load, not a client navigation: the app root is a
              redirect (to the dashboard when signed in, otherwise to the
              public site), made in src/proxy.ts. */}
          <a
            href="/"
            className="text-xl font-bold tracking-tight text-[#0A0F1C]"
          >
            Strata<span className="text-[#00D4BF]">Verze</span>
          </a>
          <nav className="flex items-center gap-4 text-sm text-gray-600">
            <Link href="/privacy" className="hover:text-gray-900">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-gray-900">
              Terms
            </Link>
            <Link
              href="/login"
              className="rounded-[var(--radius-card)] bg-[#00D4BF] px-4 py-2 text-sm font-medium text-[#0A0F1C] hover:bg-[#00bfad]"
            >
              Sign in
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-6 py-12">{children}</main>
      <footer className="border-t border-gray-200 bg-gray-50">
        <div className="mx-auto max-w-4xl px-6 py-8 text-center text-sm text-gray-500">
          &copy; 2026 StrataVerze. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
