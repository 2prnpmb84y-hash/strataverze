import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-muted">
      <main className="flex flex-col items-center gap-8 px-6 py-16 text-center max-w-2xl">
        {/* Logo area */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg sidebar-gradient" />
          <h1 className="text-3xl font-bold font-heading text-foreground tracking-tight">
            StrataVerze
          </h1>
        </div>

        <p className="text-lg text-muted-foreground max-w-md leading-relaxed">
          Owner-first strata management for Australian Owners Corporations.
          Transparent, collaborative, and built for the people who live there.
        </p>

        {/* Portal cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full mt-4">
          <PortalCard
            title="Owner Portal"
            description="View levies, vote on motions, and track maintenance"
            colour="bg-owner"
            href="/login"
          />
          <PortalCard
            title="Committee"
            description="Manage finances, compliance, and governance"
            colour="bg-committee"
            href="/login"
          />
          <PortalCard
            title="Adviser"
            description="Oversee schemes, reporting, and operations"
            colour="bg-adviser"
            href="/login"
          />
        </div>

        <Link
          href="/login"
          className="mt-4 inline-flex h-12 items-center justify-center rounded-lg bg-primary-400 px-8 text-white font-semibold text-base transition-colors hover:bg-primary-500"
        >
          Sign in
        </Link>
      </main>
    </div>
  );
}

function PortalCard({
  title,
  description,
  colour,
  href,
}: {
  title: string;
  description: string;
  colour: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col items-start gap-3 rounded-xl bg-card border border-border p-5 text-left transition-shadow hover:shadow-md"
    >
      <div className={`w-3 h-3 rounded-full ${colour}`} />
      <h2 className="font-heading font-semibold text-card-foreground">
        {title}
      </h2>
      <p className="text-sm text-muted-foreground leading-relaxed">
        {description}
      </p>
    </Link>
  );
}
