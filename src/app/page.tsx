import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "StrataVerze — Owner-first strata management",
};

/* ------------------------------------------------------------------ */
/*  Platform capability card data                                      */
/* ------------------------------------------------------------------ */

const platformCapabilities = [
  {
    title: "Levies and owner accounts",
    description:
      "Issue levy notices with the right split between funds, track what each lot owes, and let owners see their own statement.",
    iconColor: "text-brand-teal",
    iconBg: "bg-brand-teal/10",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
      </svg>
    ),
  },
  {
    title: "A ledger that balances",
    description:
      "Double-entry accounts by fund, monthly periods you can close and lock, budgets against actuals, trial balance and the reports an accountant expects.",
    iconColor: "text-brand-teal-dark",
    iconBg: "bg-brand-teal/10",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 6h16M4 10h16M4 14h10M4 18h7" />
      </svg>
    ),
  },
  {
    title: "Bank reconciliation in minutes",
    description:
      "Import your bank statement (CSV or OFX), match receipts and payments with rules, and see what is outstanding. Live bank feeds are on the roadmap.",
    iconColor: "text-brand-amber",
    iconBg: "bg-brand-amber/10",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 10h18M8 4v2M16 4v2" />
      </svg>
    ),
  },
  {
    title: "Meetings from notice to minutes",
    description:
      "A wizard that sets the agenda, issues notices, records attendance and votes including electronic voting before the meeting, and produces the minutes.",
    iconColor: "text-slate-700 dark:text-slate-300",
    iconBg: "bg-slate-100 dark:bg-slate-800",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 10h18M8 4v2M16 4v2M7 14h4M7 17h2" />
      </svg>
    ),
  },
  {
    title: "Arrears handled properly",
    description:
      "Reminders, interest, payment plans and the NSW recovery steps in order, with every letter kept.",
    iconColor: "text-brand-lavender",
    iconBg: "bg-brand-lavender/10",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 3" />
      </svg>
    ),
  },
  {
    title: "Maintenance and contractors",
    description:
      "Quotes, approvals, work orders and invoices, with contractor ABN and insurance details checked.",
    iconColor: "text-brand-amber",
    iconBg: "bg-brand-amber/10",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
      </svg>
    ),
  },
  {
    title: "Insurance",
    description:
      "Policies, documents, claims and renewal dates in one place.",
    iconColor: "text-brand-teal",
    iconBg: "bg-brand-teal/10",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    ),
  },
  {
    title: "Documents and the strata roll",
    description:
      "Every record where the Act says it should be kept, with an audit trail of who did what.",
    iconColor: "text-slate-700 dark:text-slate-300",
    iconBg: "bg-slate-100 dark:bg-slate-800",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="8" y1="13" x2="16" y2="13" />
        <line x1="8" y1="17" x2="12" y2="17" />
      </svg>
    ),
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
          <div className="max-w-3xl">
            <p className="text-sm font-semibold tracking-widest uppercase text-brand-teal">
              Owner-first strata management, New South Wales
            </p>

            <h1 className="mt-4 font-heading text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight tracking-tight">
              Your scheme.
              <br />
              Your records.
              <br />
              <span className="gradient-text">Your call.</span>
            </h1>

            <p className="mt-6 text-lg text-[var(--muted)] leading-relaxed max-w-2xl">
              StrataVerze is the owners corporation&rsquo;s own management
              platform. Finances, documents, meetings and compliance in one
              place that the committee controls, with a strata manager,
              accountant or other adviser invited in on your terms.
            </p>

            <div className="mt-8 flex flex-wrap gap-4">
              <Link
                href="/pricing"
                className="inline-flex items-center rounded-full bg-brand-amber px-6 py-3 text-sm font-semibold text-slate-900 shadow-sm hover:bg-brand-amber-dark transition-colors"
              >
                Apply for the Founding Schemes programme
              </Link>
              <Link
                href="/features"
                className="inline-flex items-center rounded-full border border-[var(--border)] px-6 py-3 text-sm font-semibold text-[var(--foreground)] hover:bg-[var(--surface)] transition-colors"
              >
                See how it works
              </Link>
            </div>

            <p className="mt-6 text-sm text-[var(--muted)]">
              Free for founding schemes until 30&nbsp;June&nbsp;2027. Assisted
              migration included. No lock-in.
            </p>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 2. SOCIAL PROOF BAR                                          */}
      {/* ============================================================ */}
      <section className="border-t border-[var(--border)] bg-[var(--surface)]">
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
      {/* 3. THE PLATFORM — What the committee can do                   */}
      {/* ============================================================ */}
      <section className="border-t border-[var(--border)] py-20 lg:py-28 bg-[var(--surface-alt)]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <p className="text-sm font-semibold tracking-widest uppercase text-[var(--muted)] mb-3">
              The Platform
            </p>
            <h2 className="font-heading text-3xl sm:text-4xl font-bold tracking-tight">
              What the committee can do
            </h2>
            <p className="mt-4 text-lg text-[var(--muted)]">
              Finances, meetings, documents and compliance managed by the people
              who run the scheme.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {platformCapabilities.map((cap) => (
              <div
                key={cap.title}
                className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-7 flex flex-col gap-4"
              >
                <div
                  className={`flex h-11 w-11 items-center justify-center rounded-xl ${cap.iconBg} ${cap.iconColor}`}
                >
                  {cap.icon}
                </div>
                <h3 className="font-heading text-lg font-bold leading-snug">
                  {cap.title}
                </h3>
                <p className="text-sm text-[var(--muted)] leading-relaxed">
                  {cap.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 4. FIND YOUR STARTING POINT                                  */}
      {/* ============================================================ */}
      <section className="border-t border-[var(--border)] py-20 lg:py-28 bg-[#EEF3F7] dark:bg-slate-800/40">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <p className="text-sm font-semibold tracking-widest uppercase text-[var(--muted)] mb-3">
              Find your starting point
            </p>
            <h2 className="font-heading text-3xl sm:text-4xl font-bold tracking-tight">
              Which situation sounds like yours?
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {/* Card 1 — Self-managed */}
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8 flex flex-col">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-teal/10 text-brand-teal mb-5">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <h3 className="font-heading text-xl font-bold mb-3">
                We manage our own scheme
              </h3>
              <p className="text-sm text-[var(--muted)] leading-relaxed mb-6 flex-1">
                Levies, ledger, bank reconciliation, meetings and records built
                for volunteer committees.
              </p>
              <Link
                href="/features"
                className="inline-flex items-center gap-1 text-sm font-semibold text-brand-teal hover:text-brand-teal-dark transition-colors"
              >
                Self-managed schemes
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 8h10M9 4l4 4-4 4" />
                </svg>
              </Link>
            </div>

            {/* Card 2 — With a manager */}
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8 flex flex-col">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-teal/10 text-brand-teal mb-5">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </div>
              <h3 className="font-heading text-xl font-bold mb-3">
                We have a manager and want visibility
              </h3>
              <p className="text-sm text-[var(--muted)] leading-relaxed mb-6 flex-1">
                Hold your own record of the scheme while your manager does the
                work, or through a change of manager.
              </p>
              <Link
                href="/features"
                className="inline-flex items-center gap-1 text-sm font-semibold text-brand-teal hover:text-brand-teal-dark transition-colors"
              >
                Committees with a manager
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 8h10M9 4l4 4-4 4" />
                </svg>
              </Link>
            </div>

            {/* Card 3 — Owner */}
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8 flex flex-col">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-amber/10 text-brand-amber mb-5">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </div>
              <h3 className="font-heading text-xl font-bold mb-3">
                I am an owner, not on the committee
              </h3>
              <p className="text-sm text-[var(--muted)] leading-relaxed mb-6 flex-1">
                See where levies go and what was decided. Ask your committee
                about StrataVerze, or read the owner guide.
              </p>
              <Link
                href="/about"
                className="inline-flex items-center gap-1 text-sm font-semibold text-brand-teal hover:text-brand-teal-dark transition-colors"
              >
                Owner guide
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 8h10M9 4l4 4-4 4" />
                </svg>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 5. RECORDS SECTION                                           */}
      {/* ============================================================ */}
      <section className="border-t border-[var(--border)] py-20 lg:py-28 bg-[var(--surface)]">
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
      {/* 6. SUPPLIERS TEASER                                          */}
      {/* ============================================================ */}
      <section className="border-t border-[var(--border)] py-20 lg:py-28 bg-[var(--surface-alt)]">
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
      {/* 7. ABOUT / FOUNDER TEASER                                    */}
      {/* ============================================================ */}
      <section className="border-t border-[var(--border)] py-20 lg:py-28 bg-[var(--surface)]">
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
      {/* 8. CTA SECTION                                               */}
      {/* ============================================================ */}
      <section className="border-t border-[var(--border)] gradient-bg">
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
