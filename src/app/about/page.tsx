import Image from "next/image";

export const metadata = {
  title: "About",
  description:
    "Learn about StrataVerze — an owner-first strata management platform built for NSW Owners Corporations.",
};

const values = [
  {
    title: "Transparency",
    description:
      "Owners should be able to see their scheme's finances clearly — budgets, levies, and expenditure — without having to chase a manager for reports.",
    icon: (
      <svg
        className="h-8 w-8 text-brand-teal"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
        />
      </svg>
    ),
  },
  {
    title: "Security",
    description:
      "Scheme records belong to the Owners Corporation. They should be stored securely and remain accessible regardless of who manages the building.",
    icon: (
      <svg
        className="h-8 w-8 text-brand-teal"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z"
        />
      </svg>
    ),
  },
  {
    title: "Independence",
    description:
      "Committees should be able to run their scheme without depending on a manager for basic visibility. StrataVerze gives committees the tools to stay informed and in control.",
    icon: (
      <svg
        className="h-8 w-8 text-brand-teal"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15.59 14.37a6 6 0 0 1-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 0 0 6.16-12.12A14.98 14.98 0 0 0 9.631 8.41m5.96 5.96a14.926 14.926 0 0 1-5.841 2.58m-.119-8.54a6 6 0 0 0-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 0 0-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 0 1-2.448-2.448 14.9 14.9 0 0 1 .06-.312m-2.24 2.39a4.493 4.493 0 0 0-1.757 4.306 4.493 4.493 0 0 0 4.306-1.758M16.5 9a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z"
        />
      </svg>
    ),
  },
];

export default function Page() {
  return (
    <main>
      {/* Hero */}
      <section className="gradient-bg py-20 md:py-28">
        <div className="mx-auto max-w-4xl px-4 text-center">
          <h1 className="font-heading text-4xl font-bold tracking-tight text-white md:text-5xl">
            About StrataVerze
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-white/90 md:text-xl">
            We&rsquo;re building the platform NSW Owners Corporations have been
            waiting for — one that puts committees and owners at the centre of
            their own scheme.
          </p>
        </div>
      </section>

      {/* Founder */}
      <section className="py-16 md:py-24">
        <div className="mx-auto max-w-5xl px-4">
          <div className="flex flex-col items-center gap-10 md:flex-row md:items-start md:gap-16">
            <div className="shrink-0">
              <Image
                src="/images/emily-doan.jpg"
                alt="Emily Doan, Founder of StrataVerze"
                width={280}
                height={280}
                className="rounded-full object-cover"
                priority
              />
            </div>

            <div>
              <h2 className="font-heading text-3xl font-bold text-[var(--foreground)]">
                Emily Doan
              </h2>
              <p className="mt-1 text-lg font-medium text-brand-teal-dark">
                Founder
              </p>

              <div className="mt-6 space-y-4 text-[var(--foreground)]/80 leading-relaxed">
                <p>
                  Emily spent years working alongside strata committees and
                  owners across New South Wales — advising on governance,
                  finances, and the day-to-day challenges of running an Owners
                  Corporation. She saw first-hand how fragmented record-keeping
                  and opaque financial reporting left committees in the dark
                  about their own schemes.
                </p>
                <p>
                  Too often, critical documents lived on a manager&rsquo;s
                  server, financial reports arrived late (or not at all), and
                  when a management contract ended the committee was left
                  scrambling to piece together years of history. Owners deserved
                  better.
                </p>
                <p>
                  Emily built StrataVerze because she believes committees
                  shouldn&rsquo;t lose control of their records every time a
                  manager changes, and owners deserve a platform that belongs to
                  them — not the service provider. StrataVerze is designed from
                  the ground up to keep the Owners Corporation at the centre of
                  every decision.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Mission & Values */}
      <section className="bg-[var(--surface-alt)] py-16 md:py-24">
        <div className="mx-auto max-w-5xl px-4">
          <h2 className="font-heading text-center text-3xl font-bold text-[var(--foreground)] md:text-4xl">
            What we stand for
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-[var(--muted)]">
            Three principles guide everything we build.
          </p>

          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {values.map((value) => (
              <div
                key={value.title}
                className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8 transition-shadow hover:shadow-lg"
              >
                <div className="mb-4">{value.icon}</div>
                <h3 className="font-heading text-xl font-semibold text-[var(--foreground)]">
                  {value.title}
                </h3>
                <p className="mt-3 leading-relaxed text-[var(--muted)]">
                  {value.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Company Info */}
      <section className="py-16 md:py-24">
        <div className="mx-auto max-w-3xl px-4 text-center">
          <h2 className="font-heading text-3xl font-bold text-[var(--foreground)]">
            Company details
          </h2>
          <div className="mt-8 space-y-2 text-[var(--muted)]">
            <p className="text-lg font-medium text-[var(--foreground)]">
              StrataVerze Pty Ltd
            </p>
            <p>ABN 25 680 401 450</p>
            <p>ACN 680 401 450</p>
            <p>Sydney, Australia</p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="gradient-bg py-16 md:py-20">
        <div className="mx-auto max-w-3xl px-4 text-center">
          <h2 className="font-heading text-3xl font-bold text-white md:text-4xl">
            Ready to take control of your scheme?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-white/90">
            Join our Founding Schemes programme and be among the first NSW
            Owners Corporations on StrataVerze.
          </p>
          <a
            href="/pricing"
            className="mt-8 inline-block rounded-full bg-white px-8 py-3 text-lg font-semibold text-brand-teal-dark transition-transform hover:scale-105"
          >
            View Founding Schemes programme
          </a>
        </div>
      </section>
    </main>
  );
}
