"use client";

import { useState, type FormEvent } from "react";

const subjectOptions = [
  "General enquiry",
  "Founding Schemes application",
  "Supplier registration",
  "Partnership",
] as const;

// ──────────────────────────────────────────────────────────────────
// Formspree form ID
// Set the NEXT_PUBLIC_FORMSPREE_ID environment variable in Vercel,
// or replace the fallback string below.
//
// To get a form ID:
// 1. Sign up at https://formspree.io (free tier: 50 subs/month)
// 2. Create a form called "StrataVerze Contact"
// 3. Copy the form ID (the part after /f/ in the endpoint URL)
// 4. Add it as NEXT_PUBLIC_FORMSPREE_ID in Vercel Environment Variables
// ──────────────────────────────────────────────────────────────────
const FORMSPREE_ID = process.env.NEXT_PUBLIC_FORMSPREE_ID || "PLACEHOLDER";
const FORMSPREE_URL = `https://formspree.io/f/${FORMSPREE_ID}`;

type FormStatus = "idle" | "submitting" | "success" | "error";

function ContactForm() {
  const [subject, setSubject] = useState("");
  const [status, setStatus] = useState<FormStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    setErrorMessage("");

    const form = e.currentTarget;
    const data = new FormData(form);

    // Honeypot check — if filled, silently "succeed" without submitting
    if (data.get("_gotcha")) {
      setStatus("success");
      return;
    }

    try {
      const res = await fetch(FORMSPREE_URL, {
        method: "POST",
        headers: { Accept: "application/json" },
        body: data,
      });

      if (res.ok) {
        setStatus("success");
        form.reset();
        setSubject("");
      } else {
        const json = await res.json().catch(() => null);
        const msg =
          json?.errors
            ?.map((err: { message: string }) => err.message)
            .join(", ") ||
          "Something went wrong. Please try again or email us directly.";
        setErrorMessage(msg);
        setStatus("error");
      }
    } catch {
      setErrorMessage(
        "Could not reach the server. Please check your connection and try again."
      );
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div className="rounded-2xl border border-brand-teal/30 bg-brand-teal/5 p-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-teal/10">
          <svg
            className="h-7 w-7 text-brand-teal"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
            />
          </svg>
        </div>
        <h3 className="mb-2 text-xl font-semibold">Message sent</h3>
        <p className="text-[var(--muted)]">
          Thanks for reaching out. We will get back to you within one business
          day.
        </p>
        <button
          type="button"
          onClick={() => setStatus("idle")}
          className="mt-6 text-sm font-medium text-brand-teal transition-colors hover:text-brand-teal-dark"
        >
          Send another message
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Honeypot — hidden from real users, catches bots */}
      <input
        type="text"
        name="_gotcha"
        tabIndex={-1}
        autoComplete="off"
        className="!absolute !h-0 !w-0 !overflow-hidden !opacity-0"
        aria-hidden="true"
      />

      {/* Name */}
      <div>
        <label htmlFor="name" className="mb-1.5 block text-sm font-medium">
          Name <span className="text-brand-teal">*</span>
        </label>
        <input
          type="text"
          id="name"
          name="name"
          required
          disabled={status === "submitting"}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-[var(--foreground)] transition-colors focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/20 disabled:opacity-60"
          placeholder="Your full name"
        />
      </div>

      {/* Email */}
      <div>
        <label htmlFor="email" className="mb-1.5 block text-sm font-medium">
          Email <span className="text-brand-teal">*</span>
        </label>
        <input
          type="email"
          id="email"
          name="email"
          required
          disabled={status === "submitting"}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-[var(--foreground)] transition-colors focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/20 disabled:opacity-60"
          placeholder="you@example.com"
        />
      </div>

      {/* Phone (optional) */}
      <div>
        <label htmlFor="phone" className="mb-1.5 block text-sm font-medium">
          Phone{" "}
          <span className="text-sm text-[var(--muted)]">(optional)</span>
        </label>
        <input
          type="tel"
          id="phone"
          name="phone"
          disabled={status === "submitting"}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-[var(--foreground)] transition-colors focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/20 disabled:opacity-60"
          placeholder="04XX XXX XXX"
        />
      </div>

      {/* Subject */}
      <div>
        <label htmlFor="subject" className="mb-1.5 block text-sm font-medium">
          Subject <span className="text-brand-teal">*</span>
        </label>
        <select
          id="subject"
          name="subject"
          required
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          disabled={status === "submitting"}
          className="w-full appearance-none rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-[var(--foreground)] transition-colors focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/20 disabled:opacity-60"
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
        <label htmlFor="message" className="mb-1.5 block text-sm font-medium">
          Message <span className="text-brand-teal">*</span>
        </label>
        <textarea
          id="message"
          name="message"
          required
          rows={5}
          disabled={status === "submitting"}
          className="w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-[var(--foreground)] transition-colors focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/20 disabled:opacity-60"
          placeholder="How can we help?"
        />
      </div>

      {/* Founding scheme toggle */}
      <div className="flex items-start gap-3 rounded-xl border border-brand-teal/20 bg-brand-teal/5 p-4">
        <label className="relative inline-flex cursor-pointer items-center pt-0.5">
          <input
            type="checkbox"
            name="founding_scheme"
            value="yes"
            disabled={status === "submitting"}
            className="peer sr-only"
          />
          <div className="h-6 w-11 rounded-full bg-[var(--border)] transition-colors after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-transform peer-checked:bg-brand-teal peer-checked:after:translate-x-5 peer-focus:ring-2 peer-focus:ring-brand-teal/20 peer-disabled:opacity-60" />
        </label>
        <div>
          <span className="block text-sm font-semibold">Apply for Founding Scheme registration</span>
          <span className="block text-xs text-[var(--muted)] mt-0.5">
            Register your scheme as a founding member and receive priority onboarding and early-access benefits.
          </span>
        </div>
      </div>

      {/* Error message */}
      {status === "error" && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400">
          {errorMessage}
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={status === "submitting"}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-amber px-6 py-3.5 font-semibold text-slate-900 transition-colors hover:bg-brand-amber-dark disabled:cursor-not-allowed disabled:opacity-70"
      >
        {status === "submitting" ? (
          <>
            <svg
              className="h-5 w-5 animate-spin"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z"
              />
            </svg>
            Sending…
          </>
        ) : (
          "Send message"
        )}
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
