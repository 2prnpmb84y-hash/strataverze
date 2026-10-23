import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "StrataVerze — Owner-first strata management",
};

/* ------------------------------------------------------------------ */
/*  Inline SVG icons for feature cards                                 */
/* ------------------------------------------------------------------ */

function DollarIcon() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}

function VaultIcon() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

function ComplianceIcon() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
      <path d="M9 14l2 2 4-4" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Feature card data                                                  */
/* ------------------------------------------------------------------ */

const features = [
  {
    title: "Financial Management",
    description:
      "Track levies, generate invoices, and see where every dollar goes. Committee treasurers get reports that actually make sense.",
    icon: DollarIcon,
  },
  {
    title: "Records Vault",
    description:
      "Store meeting minutes, contracts, insurance certificates, and compliance documents in one secure location that belongs to the scheme.",
    icon: VaultIcon,
  },
  {
    title: "Compliance Tracking",
    description:
      "Stay ahead of fire safety inspections, insurance renewals, and AGM deadlines with automated reminders and audit trails.",
    icon: ComplianceIcon,
  },
];

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function Page() {
  return (
    <>
      {/* ============================================================ */}
      {/* 1. HERO                                                      */}
      {/* ============================================================ */}
      <section className="relative overflow-hidden">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20 lg:py-28">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Left column — copy */}
            <div className="max-w-xl">
              <p className="text-sm font-semibold tracking-wide uppercase text-brand-teal">
                Owner-first strata management
              </p>

              <h1 className="mt-4 font-heading text-4xl sm:text-5xl font-bold leading-tight tracking-tight">
                Your scheme&rsquo;s finances, records and compliance&nbsp;&mdash;{" "}
                <span className="gradient-text">in one place</span>
              </h1>

              <p className="mt-6 text-lg text-[var(--muted)] leading-relaxed">
                StrataVerze gives NSW Owners Corporations the tools to manage
                levies, store records securely, and stay compliant&nbsp;&mdash;
                without depending on a strata manager for visibility.
              </p>

              <div className="mt-8 flex flex-wrap gap-4">
                <Link
                  href="/pricing"
                  className="inline-flex items-center rounded-full bg-brand-amber px-6 py-3 text-sm font-semibold text-slate-900 shadow-sm hover:bg-brand-amber-dark transition-colors"
                >
                  Apply for Founding Schemes
                </Link>
                <Link
                  href="/features"
                  className="inline-flex items-center rounded-full border border-[var(--border)] px-6 py-3 text-sm font-semibold text-[var(--foreground)] hover:bg-[var(--surface)] transition-colors"
                >
                  See how it works
                </Link>
              </div>
            </div>

            {/* Right column — hero image */}
            <div className="relative aspect-[4/3] w-full rounded-2xl overflow-hidden gradient-bg">
              <Image
                src="/images/hero-lobby-residents.webp"
                alt="Diverse group of apartment residents chatting in a modern strata building lobby"
                fill
                className="object-cover"
                priority
                sizes="(max-width: 1024px) 100vw, 50vw"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 2. SOCIAL PROOF BAR                                          */}
      {/* ============================================================ */}
      <section className="bg-[var(--surface)]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6 sm:gap-12 text-center">
            <div className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-brand-teal" />
              <span className="text-sm font-medium text-[var(--foreground)]">
                Designed for NSW
              </span>
            </div>
            <div className="hidden sm:block h-4 w-px bg-[var(--border)]" />
            <div className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-brand-lavender" />
              <span className="text-sm font-medium text-[var(--foreground)]">
                Founding Schemes open
              </span>
            </div>
            <div className="hidden sm:block h-4 w-px bg-[var(--border)]" />
            <div className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-brand-amber" />
              <span className="text-sm font-medium text-[var(--foreground)]">
                Free until 30&nbsp;June&nbsp;2027
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 3. FEATURES OVERVIEW                                         */}
      {/* ============================================================ */}
      <section className="py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="font-heading text-3xl sm:text-4xl font-bold tracking-tight">
              Everything your scheme needs
            </h2>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8 flex flex-col gap-4"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full gradient-bg text-white">
                  <feature.icon />
                </div>
                <h3 className="font-heading text-xl font-semibold">
                  {feature.title}
                </h3>
                <p className="text-[var(--muted)] leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 4. RECORDS SECTION                                           */}
      {/* ============================================================ */}
      <section className="py-20 lg:py-28 bg-[var(--surface)]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Image */}
            <div className="relative aspect-[4/3] w-full rounded-2xl overflow-hidden gradient-bg order-2 lg:order-1">
              <Image
                src="/images/community-courtyard.webp"
                alt="Strata scheme residents chatting in a landscaped courtyard outside their apartment building"
                fill
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 50vw"
              />
            </div>

            {/* Copy */}
            <div className="max-w-lg order-1 lg:order-2">
              <h2 className="font-heading text-3xl sm:text-4xl font-bold tracking-tight">
                A records vault that belongs to the scheme
              </h2>
              <p className="mt-6 text-[var(--muted)] leading-relaxed">
                When a committee changes strata managers, critical documents
                often get lost in the handover. StrataVerze keeps your
                scheme&rsquo;s records in a central, secure vault that the
                Owners Corporation controls&nbsp;&mdash; regardless of which
                manager is appointed.
              </p>
              <p className="mt-4 text-[var(--muted)] leading-relaxed">
                Meeting minutes, contracts, insurance certificates, and
                compliance records are organised, searchable, and accessible to
                the people who own them.
              </p>
              <Link
                href="/features"
                className="mt-8 inline-flex items-center gap-1 text-sm font-semibold text-brand-teal hover:text-brand-teal-dark transition-colors"
              >
                Explore all features
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M3 8h10M9 4l4 4-4 4" />
                </svg>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 5. SUPPLIERS TEASER                                          */}
      {/* ============================================================ */}
      <section className="py-20 lg:py-28 bg-[var(--surface-alt)]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="font-heading text-3xl sm:text-4xl font-bold tracking-tight">
              Suppliers: work with schemes directly
            </h2>
            <p className="mt-6 text-[var(--muted)] leading-relaxed">
              StrataVerze connects suppliers&nbsp;&mdash; from plumbers and
              electricians to fire safety contractors&nbsp;&mdash; with
              committees who need the work done. Submit quotes, share
              compliance documents, and communicate with decision-makers in one
              place.
            </p>

            <div className="mt-10 flex flex-wrap justify-center gap-x-8 gap-y-4">
              <div className="flex items-center gap-2 text-sm text-[var(--foreground)]">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 20 20"
                  fill="none"
                  aria-hidden="true"
                >
                  <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.5" />
                  <path
                    d="M6 10l3 3 5-5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Direct committee access
              </div>
              <div className="flex items-center gap-2 text-sm text-[var(--foreground)]">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 20 20"
                  fill="none"
                  aria-hidden="true"
                >
                  <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.5" />
                  <path
                    d="M6 10l3 3 5-5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Streamlined quoting
              </div>
              <div className="flex items-center gap-2 text-sm text-[var(--foreground)]">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 20 20"
                  fill="none"
                  aria-hidden="true"
                >
                  <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.5" />
                  <path
                    d="M6 10l3 3 5-5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Compliance document sharing
              </div>
            </div>

            <div className="mt-10">
              <Link
                href="/suppliers"
                className="inline-flex items-center rounded-full bg-brand-amber px-6 py-3 text-sm font-semibold text-slate-900 shadow-sm hover:bg-brand-amber-dark transition-colors"
              >
                Register as a supplier
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 6. ABOUT / FOUNDER TEASER                                    */}
      {/* ============================================================ */}
      <section className="py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-center gap-10 max-w-3xl mx-auto">
            {/* Photo */}
            <div className="shrink-0">
              <Image
                src="/images/emily-doan.jpg"
                alt="Emily Doan, Founder of StrataVerze"
                width={200}
                height={200}
                className="rounded-full object-cover"
              />
            </div>

            {/* Bio */}
            <div>
              <h2 className="font-heading text-2xl font-bold">Emily Doan</h2>
              <p className="text-sm font-medium text-brand-teal mt-1">
                Founder
              </p>
              <p className="mt-4 text-[var(--muted)] leading-relaxed">
                Emily Doan built StrataVerze because too many committees lose
                control of their own records when they change managers, and
                because owners deserve a platform that belongs to them.
              </p>
              <Link
                href="/about"
                className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-teal hover:text-brand-teal-dark transition-colors"
              >
                About StrataVerze
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M3 8h10M9 4l4 4-4 4" />
                </svg>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 7. CTA SECTION                                               */}
      {/* ============================================================ */}
      <section className="gradient-bg">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20 lg:py-24 text-center">
          <h2 className="font-heading text-3xl sm:text-4xl font-bold tracking-tight text-white">
            Join the Founding Schemes programme
          </h2>
          <p className="mt-4 text-lg text-white/80 max-w-xl mx-auto">
            Be one of 25 NSW schemes to get free access to StrataVerze until
            30&nbsp;June&nbsp;2027.
          </p>
          <div className="mt-8">
            <Link
              href="/pricing"
              className="inline-flex items-center rounded-full bg-white px-8 py-3 text-sm font-semibold text-slate-900 shadow-sm hover:bg-white/90 transition-colors"
            >
              Apply now
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
