export const metadata = {
  title: "Pricing",
  description:
    "Join the StrataVerze Founding Schemes programme — full platform access, free until 30 June 2027, for the first 25 NSW Owners Corporations.",
};

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

const included = [
  "Full financial management",
  "Records vault with unlimited storage",
  "Meeting management tools",
  "Compliance tracking and reminders",
  "Priority support",
  "Early access to new features",
];

const faqs: { question: string; answer: string }[] = [
  {
    question: "Who can apply?",
    answer:
      "Any NSW Owners Corporation can apply. Whether your scheme has ten lots or two hundred, the Founding Schemes programme is open to all strata plans registered in New South Wales.",
  },
  {
    question: "How many schemes are accepted?",
    answer:
      "We’re accepting up to 25 schemes in the Founding Schemes programme. Places are allocated on a first-come, first-served basis.",
  },
  {
    question: "What’s included?",
    answer:
      "Founding schemes receive full platform access — financial management, records vault, meeting management, compliance tracking, priority support, and early access to every new feature we release.",
  },
  {
    question: "Is there a contract?",
    answer:
      "There is no lock-in during the founding period. Your scheme can leave at any time, and we’ll help you export your data.",
  },
  {
    question: "How do I apply?",
    answer:
      "Complete the application form and we’ll be in touch within two business days to discuss onboarding your scheme.",
  },
];

/* ------------------------------------------------------------------ */
/*  Icons                                                              */
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
            Founding Schemes programme
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-white/90 md:text-xl">
            Be one of the first 25 NSW schemes on StrataVerze
          </p>
        </div>
      </section>

      {/* Pricing Card */}
      <section className="py-16 md:py-24">
        <div className="mx-auto max-w-xl px-4">
          <div className="relative overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--surface)] shadow-xl">
            {/* Gradient accent bar */}
            <div className="h-1.5 bg-gradient-to-r from-brand-grad-start to-brand-grad-end" />

            <div className="p-8 md:p-10">
              {/* Plan name */}
              <p className="text-sm font-semibold uppercase tracking-wider text-brand-teal-dark">
                Founding Schemes
              </p>

              {/* Price */}
              <div className="mt-4 flex items-baseline gap-2">
                <span className="font-heading text-5xl font-bold text-[var(--foreground)] md:text-6xl">
                  Free
                </span>
              </div>
              <p className="mt-2 text-[var(--muted)]">
                until 30&nbsp;June&nbsp;2027
              </p>

              {/* Divider */}
              <hr className="my-8 border-[var(--border)]" />

              {/* Inclusions */}
              <p className="mb-4 text-sm font-semibold uppercase tracking-wider text-[var(--foreground)]">
                What&rsquo;s included
              </p>
              <ul className="space-y-3">
                {included.map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-3 text-[var(--foreground)]"
                  >
                    <CheckIcon />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <a
                href="/contact"
                className="mt-8 block rounded-full bg-brand-amber py-3 text-center text-lg font-semibold text-slate-900 transition-colors hover:bg-brand-amber-dark"
              >
                Apply now
              </a>

              {/* Note */}
              <p className="mt-4 text-center text-sm text-[var(--muted)]">
                Limited to 25 NSW schemes
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* What happens after? */}
      <section className="bg-[var(--surface-alt)] py-16 md:py-24">
        <div className="mx-auto max-w-3xl px-4 text-center">
          <h2 className="font-heading text-3xl font-bold text-[var(--foreground)] md:text-4xl">
            What happens after June&nbsp;2027?
          </h2>
          <div className="mx-auto mt-6 max-w-2xl space-y-4 text-lg leading-relaxed text-[var(--muted)]">
            <p>
              We&rsquo;ll announce pricing well before the free period ends, so
              there are no surprises. Founding schemes will receive preferential
              rates as a thank-you for helping us shape the platform in its
              earliest days.
            </p>
            <p>
              You&rsquo;ll always be able to export your data, and there will
              never be a lock-in contract.
            </p>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 md:py-24">
        <div className="mx-auto max-w-3xl px-4">
          <h2 className="font-heading text-center text-3xl font-bold text-[var(--foreground)] md:text-4xl">
            Frequently asked questions
          </h2>

          <div className="mt-12 divide-y divide-[var(--border)]">
            {faqs.map((faq) => (
              <details key={faq.question} className="group py-6">
                <summary className="flex cursor-pointer items-center justify-between font-heading text-lg font-semibold text-[var(--foreground)] [&::-webkit-details-marker]:hidden">
                  <span>{faq.question}</span>
                  <svg
                    className="h-5 w-5 shrink-0 text-[var(--muted)] transition-transform group-open:rotate-45"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 4.5v15m7.5-7.5h-15"
                    />
                  </svg>
                </summary>
                <p className="mt-3 leading-relaxed text-[var(--muted)]">
                  {faq.answer}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="gradient-bg py-16 md:py-20">
        <div className="mx-auto max-w-3xl px-4 text-center">
          <h2 className="font-heading text-3xl font-bold text-white md:text-4xl">
            Ready to get started?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-white/90">
            Apply for the Founding Schemes programme and give your committee the
            tools it deserves.
          </p>
          <a
            href="/contact"
            className="mt-8 inline-block rounded-full bg-white px-8 py-3 text-lg font-semibold text-brand-teal-dark transition-transform hover:scale-105"
          >
            Apply now
          </a>
        </div>
      </section>
    </main>
  );
}
