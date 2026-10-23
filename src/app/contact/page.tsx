"use client";

import { useState } from "react";

const subjectOptions = [
  "General enquiry",
  "Founding Schemes application",
  "Supplier registration",
  "Partnership",
] as const;

// NOTE: metadata cannot be exported from a client component.
// Move metadata to a separate layout.tsx in this directory, or use
// generateMetadata in a server wrapper. For now, the page title is
// set via the <title> fallback in the root layout template.

function ContactForm() {
  const [subject, setSubject] = useState("");

  return (
    // TODO: Connect to a form handling service (e.g. Formspree, Basin,
    // or a Next.js API route at /api/contact) before launch.
    // The action below is a placeholder.
    <form
      action="https://formspree.io/f/PLACEHOLDER"
      method="POST"
      className="space-y-6"
    >
      {/* Name */}
      <div>
        <label
          htmlFor="name"
          className="mb-1.5 block text-sm font-medium"
        >
          Name <span className="text-brand-teal">*</span>
        </label>
        <input
          type="text"
          id="name"
          name="name"
          required
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-[var(--foreground)] transition-colors focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/20"
          placeholder="Your full name"
        />
      </div>

      {/* Email */}
      <div>
        <label
          htmlFor="email"
          className="mb-1.5 block text-sm font-medium"
        >
          Email <span className="text-brand-teal">*</span>
        </label>
        <input
          type="email"
          id="email"
          name="email"
          required
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-[var(--foreground)] transition-colors focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/20"
          placeholder="you@example.com"
        />
      </div>

      {/* Phone (optional) */}
      <div>
        <label
          htmlFor="phone"
          className="mb-1.5 block text-sm font-medium"
        >
          Phone <span className="text-sm text-[var(--muted)]">(optional)</span>
        </label>
        <input
          type="tel"
          id="phone"
          name="phone"
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-[var(--foreground)] transition-colors focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/20"
          placeholder="04XX XXX XXX"
        />
      </div>

      {/* Subject */}
      <div>
        <label
          htmlFor="subject"
          className="mb-1.5 block text-sm font-medium"
        >
          Subject <span className="text-brand-teal">*</span>
        </label>
        <select
          id="subject"
          name="subject"
          required
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="w-full appearance-none rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-[var(--foreground)] transition-colors focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/20"
        >
          <option value="" disabled>
            Select a subject
          </option>
          {subjectOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      {/* Message */}
      <div>
        <label
          htmlFor="message"
          className="mb-1.5 block text-sm font-medium"
        >
          Message <span className="text-brand-teal">*</span>
        </label>
        <textarea
          id="message"
          name="message"
          required
          rows={5}
          className="w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-[var(--foreground)] transition-colors focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/20"
          placeholder="How can we help?"
        />
      </div>

      {/* Submit */}
      <button
        type="submit"
        className="w-full rounded-xl bg-brand-teal px-6 py-3.5 font-semibold text-white transition-colors hover:bg-brand-teal-dark"
      >
        Send message
      </button>
    </form>
  );
}

export default function ContactPage() {
  return (
    <main>
      {/* Hero */}
      <section className="py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto mb-16 max-w-2xl text-center">
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
              Get in <span className="gradient-text">touch</span>
            </h1>
            <p className="mt-4 text-lg text-[var(--muted)]">
              Have a question about StrataVerze? Want to register your scheme or
              join as a supplier? We would love to hear from you.
            </p>
          </div>

          {/* Two-column layout */}
          <div className="mx-auto grid max-w-5xl gap-12 lg:grid-cols-5">
            {/* Form (wider column) */}
            <div className="lg:col-span-3">
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8">
                <ContactForm />
              </div>
            </div>

            {/* Company details */}
            <div className="lg:col-span-2">
              <div className="space-y-8">
                {/* Company info */}
                <div>
                  <h2 className="mb-4 text-xl font-semibold">
                    Company details
                  </h2>
                  <div className="space-y-3 text-[var(--muted)]">
                    <p className="font-medium text-[var(--foreground)]">
                      StrataVerze Pty Ltd
                    </p>
                    <p>ABN 25 680 401 450</p>
                  </div>
                </div>

                {/* Contact */}
                <div>
                  <h2 className="mb-4 text-xl font-semibold">Email</h2>
                  <a
                    href="mailto:hello@strataverze.com"
                    className="text-brand-teal transition-colors hover:text-brand-teal-dark"
                  >
                    hello@strataverze.com
                  </a>
                </div>

                {/* Location */}
                <div>
                  <h2 className="mb-4 text-xl font-semibold">Location</h2>
                  <p className="text-[var(--muted)]">
                    Based in Sydney, Australia
                  </p>
                </div>

                {/* Divider + support note */}
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-alt)] p-6">
                  <p className="text-sm leading-relaxed text-[var(--muted)]">
                    For privacy-related enquiries, contact{" "}
                    <a
                      href="mailto:privacy@strataverze.com"
                      className="text-brand-teal hover:text-brand-teal-dark"
                    >
                      privacy@strataverze.com
                    </a>
                    . For legal matters, contact{" "}
                    <a
                      href="mailto:legal@strataverze.com"
                      className="text-brand-teal hover:text-brand-teal-dark"
                    >
                      legal@strataverze.com
                    </a>
                    .
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
