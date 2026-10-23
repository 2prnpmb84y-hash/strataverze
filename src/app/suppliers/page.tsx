import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Suppliers",
  description:
    "Connect with NSW strata schemes looking for reliable tradespeople and contractors. Register as a supplier on StrataVerze.",
};

function BenefitCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8 transition-shadow hover:shadow-lg">
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-xl bg-brand-teal/10 text-brand-teal">
        {icon}
      </div>
      <h3 className="mb-3 text-xl font-semibold">{title}</h3>
      <p className="leading-relaxed text-[var(--muted)]">{description}</p>
    </div>
  );
}

function StepCard({
  step,
  title,
  description,
}: {
  step: number;
  title: string;
  description: string;
}) {
  return (
    <div className="relative flex flex-col items-center text-center">
      <div className="gradient-bg mb-5 flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold text-white">
        {step}
      </div>
      <h3 className="mb-2 text-lg font-semibold">{title}</h3>
      <p className="text-[var(--muted)]">{description}</p>
    </div>
  );
}

export default function SuppliersPage() {
  return (
    <main>
      {/* Hero */}
      <section className="relative overflow-hidden py-24 sm:py-32">
        <div className="absolute inset-0 -z-10 opacity-5">
          <div className="gradient-bg h-full w-full" />
        </div>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
              Work with strata schemes{" "}
              <span className="gradient-text">directly</span>
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-[var(--muted)] sm:text-xl">
              StrataVerze connects suppliers with the committees that hire them.
              Get discovered by owners corporations across NSW and manage your
              strata work in one place.
            </p>
            <div className="mt-10">
              <Link
                href="/contact?type=supplier"
                className="inline-flex items-center rounded-xl bg-brand-amber px-8 py-4 text-lg font-semibold text-slate-900 transition-colors hover:bg-brand-amber-dark"
              >
                Register as a supplier
                <svg
                  className="ml-2 h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13 7l5 5m0 0l-5 5m5-5H6"
                  />
                </svg>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Lifestyle image */}
      <section className="py-12 sm:py-16">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="relative aspect-[21/9] overflow-hidden rounded-2xl">
            <Image
              src="/images/residents-lobby-aurora.webp"
              alt="Residents meeting in the lobby of their modern apartment building"
              fill
              className="object-cover"
              sizes="(max-width: 1024px) 100vw, 960px"
            />
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto mb-16 max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Why suppliers choose StrataVerze
            </h2>
            <p className="mt-4 text-lg text-[var(--muted)]">
              Purpose-built tools to help tradespeople and contractors win and
              manage strata work.
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-3">
            <BenefitCard
              icon={
                <svg
                  className="h-7 w-7"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
                  />
                </svg>
              }
              title="Get found by committees"
              description="Schemes looking for your trade can find you through the supplier directory. Your business profile showcases your qualifications, insurance, and areas of service so committees can shortlist you with confidence."
            />
            <BenefitCard
              icon={
                <svg
                  className="h-7 w-7"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z"
                  />
                </svg>
              }
              title="Quotes and work orders in one flow"
              description="Receive quote requests, submit your price, and track jobs from approval through to payment. No chasing paperwork or wondering where things stand — everything is visible in your supplier dashboard."
            />
            <BenefitCard
              icon={
                <svg
                  className="h-7 w-7"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.562.562 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
                  />
                </svg>
              }
              title="Build your reputation"
              description="Completed work builds a track record that committees can review. Quality suppliers earn visibility across the platform, helping you win more work from schemes that value reliability."
            />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-[var(--border)] bg-[var(--surface-alt)] py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto mb-16 max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              How it works
            </h2>
            <p className="mt-4 text-lg text-[var(--muted)]">
              Three steps to start working with strata schemes on StrataVerze.
            </p>
          </div>

          <div className="grid gap-12 md:grid-cols-3">
            <StepCard
              step={1}
              title="Register your business"
              description="Create your supplier profile with your trade details, licences, insurance, and service areas."
            />
            <StepCard
              step={2}
              title="Get discovered by schemes"
              description="Committees searching for your trade will find your profile in the supplier directory and can invite you to quote."
            />
            <StepCard
              step={3}
              title="Manage jobs end to end"
              description="Handle quotes, approvals, scheduling, and invoicing through your supplier dashboard."
            />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="gradient-bg mx-auto max-w-4xl rounded-3xl p-12 text-center sm:p-16">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Ready to grow your strata work?
            </h2>
            <p className="mt-4 text-lg text-white/80">
              Join the StrataVerze supplier network and connect with owners
              corporations across NSW.
            </p>
            <div className="mt-8">
              <Link
                href="/contact?type=supplier"
                className="inline-flex items-center rounded-xl bg-white px-8 py-4 text-lg font-semibold text-brand-teal transition-colors hover:bg-white/90"
              >
                Register as a supplier
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
