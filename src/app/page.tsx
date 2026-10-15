import Link from "next/link";
import { Logo } from "@/components/logo";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 max-w-6xl mx-auto">
        <Logo size="md" variant="gradient" />
        <Link
          href="/login"
          className="inline-flex h-10 items-center justify-center rounded-lg bg-primary-400 px-6 text-sm text-white font-semibold transition-colors hover:bg-primary-500"
        >
          Sign in
        </Link>
      </nav>

      {/* Hero */}
      <section className="px-6 pt-16 pb-20 max-w-6xl mx-auto text-center">
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold font-heading text-foreground tracking-tight leading-tight max-w-3xl mx-auto">
          Strata management built for the people who{" "}
          <span className="bg-gradient-to-r from-primary-300 to-purple-400 bg-clip-text text-transparent">
            live there
          </span>
        </h1>
        <p className="mt-6 text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed">
          Transparent levy tracking, streamlined governance, and real-time
          maintenance updates. One platform for owners, committees, and
          strata managers across Australia.
        </p>
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/login"
            className="inline-flex h-12 items-center justify-center rounded-lg bg-primary-400 px-8 text-white font-semibold text-base transition-colors hover:bg-primary-500"
          >
            Get started
          </Link>
          <a
            href="#features"
            className="inline-flex h-12 items-center justify-center rounded-lg border border-border px-8 text-foreground font-semibold text-base transition-colors hover:bg-muted"
          >
            See how it works
          </a>
        </div>
      </section>

      {/* Three portals */}
      <section className="px-6 py-16 bg-muted" id="portals">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold font-heading text-foreground text-center mb-3">
            Three portals, one platform
          </h2>
          <p className="text-muted-foreground text-center max-w-lg mx-auto mb-12">
            Everyone in the scheme sees exactly what they need. No clutter,
            no confusion.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <PortalCard
              title="Owner Portal"
              accent="bg-owner"
              items={[
                "View and pay levy statements",
                "Vote on motions online",
                "Track maintenance requests",
                "Access scheme documents",
              ]}
            />
            <PortalCard
              title="Committee Portal"
              accent="bg-committee"
              items={[
                "Oversee fund balances",
                "Manage meeting governance",
                "Review work orders",
                "Monitor levy collection",
              ]}
            />
            <PortalCard
              title="Adviser Portal"
              accent="bg-adviser"
              items={[
                "Manage multiple schemes",
                "Portfolio-wide reporting",
                "Track compliance obligations",
                "Schedule meetings and AGMs",
              ]}
            />
          </div>
        </div>
      </section>

      {/* Features grid */}
      <section className="px-6 py-16" id="features">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold font-heading text-foreground text-center mb-3">
            Everything your scheme needs
          </h2>
          <p className="text-muted-foreground text-center max-w-lg mx-auto mb-12">
            Purpose-built for Australian owners corporations, covering every
            aspect of strata administration.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <FeatureCard
              icon={
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
              }
              title="Levy Management"
              description="Issue ordinary and special levies, track payments per lot, and see collection rates at a glance."
            />
            <FeatureCard
              icon={
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" />
                </svg>
              }
              title="Meeting Governance"
              description="Schedule AGMs, SGMs, and committee meetings. Raise motions, collect votes, and record outcomes."
            />
            <FeatureCard
              icon={
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.336l-3.276 3.277a3.004 3.004 0 0 1-2.25-2.25l3.276-3.276a4.5 4.5 0 0 0-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437 1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008Z" />
                </svg>
              }
              title="Work Orders"
              description="Raise, assign, and track maintenance work orders with priority levels, comments, and cost tracking."
            />
            <FeatureCard
              icon={
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
                </svg>
              }
              title="Compliance Tracking"
              description="Monitor insurance, fire safety, OH&S, and building compliance. Get alerts before items expire."
            />
            <FeatureCard
              icon={
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                </svg>
              }
              title="Document Vault"
              description="Store minutes, insurance certificates, by-laws, and financial reports. Organised by category and scheme."
            />
            <FeatureCard
              icon={
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
                </svg>
              }
              title="Portfolio Reporting"
              description="Cross-scheme dashboards showing collection rates, outstanding balances, work orders, and compliance status."
            />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 py-20 bg-muted">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl font-bold font-heading text-foreground mb-4">
            Ready to modernise your strata?
          </h2>
          <p className="text-muted-foreground mb-8 leading-relaxed">
            Join the growing number of Australian owners corporations switching
            to transparent, collaborative strata management.
          </p>
          <Link
            href="/login"
            className="inline-flex h-12 items-center justify-center rounded-lg bg-primary-400 px-8 text-white font-semibold text-base transition-colors hover:bg-primary-500"
          >
            Get started for free
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 py-8 border-t border-border">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <Logo size="sm" variant="gradient" />
          <p className="text-xs text-muted-foreground">
            &copy; 2026 StrataVerze. Built in Australia
            for Australian strata.
          </p>
        </div>
      </footer>
    </div>
  );
}

function PortalCard({
  title,
  accent,
  items,
}: {
  title: string;
  accent: string;
  items: string[];
}) {
  return (
    <div className="flex flex-col rounded-xl bg-card border border-border p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className={`w-3 h-3 rounded-full ${accent}`} />
        <h3 className="font-heading font-semibold text-card-foreground">
          {title}
        </h3>
      </div>
      <ul className="flex flex-col gap-2.5">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
            <svg
              className={`w-4 h-4 mt-0.5 shrink-0 ${accent.replace("bg-", "text-")}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-card border border-border p-6">
      <div className="w-10 h-10 rounded-lg bg-primary-50 text-primary-400 flex items-center justify-center">
        {icon}
      </div>
      <h3 className="font-heading font-semibold text-card-foreground">
        {title}
      </h3>
      <p className="text-sm text-muted-foreground leading-relaxed">
        {description}
      </p>
    </div>
  );
}
