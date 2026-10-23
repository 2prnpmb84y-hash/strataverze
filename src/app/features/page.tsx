import Image from "next/image";

export const metadata = {
  title: "Features",
  description:
    "Explore the tools StrataVerze offers NSW Owners Corporations — financial management, records vault, meeting management, compliance tracking, and adviser tools.",
};

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

interface BulletItem {
  label: string;
}

interface FeatureSection {
  title: string;
  description: string;
  image?: string;
  imageAlt?: string;
  bullets: BulletItem[];
  iconGrid?: boolean;
}

const features: FeatureSection[] = [
  {
    title: "Financial Management",
    description:
      "Levy invoicing, payment tracking, budget reports, and treasurer dashboards. Every committee member can see how the scheme’s funds are being managed.",
    image: "/images/owner-tablet-home.webp",
    imageAlt: "Strata scheme owner reviewing finances on a tablet at home",
    bullets: [
      { label: "Levy invoicing and tracking" },
      { label: "Budget vs actuals reporting" },
      { label: "Treasurer dashboard" },
      { label: "Payment reconciliation" },
    ],
  },
  {
    title: "Records Vault",
    description:
      "A secure, searchable repository for every document your scheme needs — meeting minutes, contracts, insurance certificates, compliance reports. Documents stay with the scheme, not the manager.",
    image: "/images/community-courtyard.webp",
    imageAlt: "Residents chatting outside their strata apartment building courtyard",
    bullets: [
      { label: "Organised document categories" },
      { label: "Full-text search" },
      { label: "Version history" },
      { label: "Secure access controls" },
    ],
  },
  {
    title: "Meeting Management",
    description:
      "Schedule AGMs and committee meetings, distribute agendas, collect proxy votes, and store minutes — all in one flow.",
    iconGrid: true,
    bullets: [
      { label: "Agenda builder" },
      { label: "Proxy vote collection" },
      { label: "Minutes templates" },
      { label: "Automated notifications" },
    ],
  },
  {
    title: "Compliance Tracking",
    description:
      "Stay ahead of fire safety inspections, insurance renewals, annual returns, and AGM deadlines. Automated reminders mean nothing falls through the cracks.",
    image: "/images/neighbours-garden-chat.webp",
    imageAlt: "Neighbours chatting in a landscaped strata building garden",
    bullets: [
      { label: "Fire safety compliance" },
      { label: "Insurance renewal tracking" },
      { label: "AGM deadline reminders" },
      { label: "Audit trail" },
    ],
  },
  {
    title: "Strata Adviser Tools",
    description:
      "For strata managers and advisers who work with owner-run schemes. Access the tools you need to support committees without taking over their records.",
    image: "/images/adviser-tablet-coworking.webp",
    imageAlt: "Strata adviser reviewing scheme data on a tablet in a co-working space",
    bullets: [
      { label: "Multi-scheme dashboard" },
      { label: "Committee collaboration" },
      { label: "Document sharing" },
      { label: "Advisory reporting" },
    ],
  },
];

/* ------------------------------------------------------------------ */
/*  Meeting‑management icon grid (no screenshot needed)                */
/* ------------------------------------------------------------------ */

const meetingIcons = [
  {
    label: "Agenda builder",
    path: "M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z",
  },
  {
    label: "Proxy vote collection",
    path: "M9 12.75 11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 0 1-1.043 3.296 3.745 3.745 0 0 1-3.296 1.043A3.745 3.745 0 0 1 12 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 0 1-3.296-1.043 3.745 3.745 0 0 1-1.043-3.296A3.745 3.745 0 0 1 3 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 0 1 1.043-3.296 3.746 3.746 0 0 1 3.296-1.043A3.746 3.746 0 0 1 12 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 0 1 3.296 1.043 3.745 3.745 0 0 1 1.043 3.296A3.745 3.745 0 0 1 21 12Z",
  },
  {
    label: "Minutes templates",
    path: "M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z",
  },
  {
    label: "Automated notifications",
    path: "M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0",
  },
];

/* ------------------------------------------------------------------ */
/*  Check‑mark icon for bullet lists                                   */
/* ------------------------------------------------------------------ */

function CheckIcon() {
  return (
    <svg
      className="mt-0.5 h-5 w-5 shrink-0 text-brand-teal"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m4.5 12.75 6 6 9-13.5"
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function Page() {
  return (
    <main>
      {/* Hero */}
      <section className="gradient-bg py-20 md:py-28">
        <div className="mx-auto max-w-4xl px-4 text-center">
          <h1 className="font-heading text-4xl font-bold tracking-tight text-white md:text-5xl">
            Everything your scheme needs
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-white/90 md:text-xl">
            Comprehensive tools for financial management, document storage,
            meetings, compliance, and more — designed for NSW Owners
            Corporations.
          </p>
        </div>
      </section>

      {/* Feature sections */}
      {features.map((feature, index) => {
        const reversed = index % 2 === 1;

        return (
          <section
            key={feature.title}
            className={`py-16 md:py-24 ${
              index % 2 === 1 ? "bg-[var(--surface-alt)]" : ""
            }`}
          >
            <div className="mx-auto max-w-6xl px-4">
              <div
                className={`flex flex-col items-center gap-10 md:gap-16 ${
                  feature.iconGrid
                    ? ""
                    : reversed
                      ? "md:flex-row-reverse"
                      : "md:flex-row"
                }`}
              >
                {/* Visual — screenshot or icon grid */}
                {feature.iconGrid ? (
                  /* Full-width layout for Meeting Management */
                  <div className="w-full text-center">
                    <h2 className="font-heading text-3xl font-bold text-[var(--foreground)] md:text-4xl">
                      {feature.title}
                    </h2>
                    <p className="mx-auto mt-4 max-w-2xl text-lg leading-relaxed text-[var(--muted)]">
                      {feature.description}
                    </p>

                    <div className="mx-auto mt-10 grid max-w-3xl grid-cols-2 gap-6 md:grid-cols-4">
                      {meetingIcons.map((item) => (
                        <div
                          key={item.label}
                          className="flex flex-col items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 transition-shadow hover:shadow-md"
                        >
                          <svg
                            className="h-10 w-10 text-brand-teal"
                            fill="none"
                            viewBox="0 0 24 24"
                            strokeWidth={1.5}
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d={item.path}
                            />
                          </svg>
                          <span className="text-sm font-medium text-[var(--foreground)]">
                            {item.label}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Image with gradient fallback */}
                    <div className="w-full md:w-1/2">
                      <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-gradient-to-br from-brand-grad-start to-brand-grad-end">
                        <Image
                          src={feature.image!}
                          alt={feature.imageAlt!}
                          fill
                          className="object-cover"
                          sizes="(max-width: 768px) 100vw, 50vw"
                        />
                      </div>
                    </div>

                    {/* Text */}
                    <div className="w-full md:w-1/2">
                      <h2 className="font-heading text-3xl font-bold text-[var(--foreground)] md:text-4xl">
                        {feature.title}
                      </h2>
                      <p className="mt-4 text-lg leading-relaxed text-[var(--muted)]">
                        {feature.description}
                      </p>
                      <ul className="mt-6 space-y-3">
                        {feature.bullets.map((bullet) => (
                          <li
                            key={bullet.label}
                            className="flex items-start gap-3 text-[var(--foreground)]"
                          >
                            <CheckIcon />
                            <span>{bullet.label}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </>
                )}
              </div>
            </div>
          </section>
        );
      })}

      {/* CTA */}
      <section className="gradient-bg py-16 md:py-20">
        <div className="mx-auto max-w-3xl px-4 text-center">
          <h2 className="font-heading text-3xl font-bold text-white md:text-4xl">
            See it in action
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-white/90">
            Join the Founding Schemes programme and get full access to every
            feature — free until 30&nbsp;June&nbsp;2027.
          </p>
          <a
            href="/pricing"
            className="mt-8 inline-block rounded-full bg-white px-8 py-3 text-lg font-semibold text-brand-teal-dark transition-transform hover:scale-105"
          >
            View pricing
          </a>
        </div>
      </section>
    </main>
  );
}
