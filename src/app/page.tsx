"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { WaitlistForm } from "./waitlist-form";

/* ─── Permission row type ─── */
interface Permission {
  label: string;
  enabled: boolean;
}

export default function LandingPage() {
  const [permissions, setPermissions] = useState<Permission[]>([
    { label: "View Financials", enabled: true },
    { label: "Upload Documents", enabled: true },
    { label: "Process Payments", enabled: false },
    { label: "Contact Owners", enabled: false },
    { label: "Maintenance Orders", enabled: true },
    { label: "Modify Bylaws", enabled: false },
  ]);

  const togglePermission = (index: number) => {
    setPermissions((prev) =>
      prev.map((p, i) => (i === index ? { ...p, enabled: !p.enabled } : p))
    );
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ═══════ Navbar ═══════ */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-border">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-6 py-3">
          {/* Logo + wordmark */}
          <Link href="/" className="flex items-center">
            <Logo size="sm" variant="gradient" />
          </Link>

          {/* Nav links — hidden below sm */}
          <div className="hidden sm:flex items-center gap-6 text-sm font-medium text-muted-foreground">
            <a href="#platform" className="hover:text-foreground transition-colors">
              Platform
            </a>
            <a href="#financials" className="hover:text-foreground transition-colors">
              Financials
            </a>
            <a href="#adviser" className="hover:text-foreground transition-colors">
              Adviser Access
            </a>
            <a href="#vault" className="hover:text-foreground transition-colors">
              Asset Vault
            </a>
          </div>

          {/* Login button */}
          <Link
            href="/login"
            className="inline-flex h-9 items-center justify-center rounded-lg bg-coral px-5 text-sm text-white font-semibold transition-colors hover:opacity-90"
          >
            Login
          </Link>
        </div>
      </nav>

      {/* ═══════ Hero ═══════ */}
      <section className="px-6 pt-20 pb-24 max-w-7xl mx-auto">
        <div className="text-center max-w-3xl mx-auto">
          {/* Badge */}
          <span className="inline-block rounded-full bg-primary-50 text-primary-500 text-xs font-semibold tracking-wider uppercase px-4 py-1.5 mb-6">
            Data Sovereignty for Strata
          </span>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold font-heading text-foreground tracking-tight leading-tight">
            When owners know everything,{" "}
            <span className="text-primary-400">everyone wins.</span>
          </h1>

          <p className="mt-6 text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed">
            StrataVerze puts lot owners in the driver&apos;s seat. Full financial
            transparency, real-time governance, and total data sovereignty &mdash;
            built for Australian owners corporations.
          </p>

          {/* CTAs */}
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="#early-access"
              className="inline-flex h-12 items-center justify-center rounded-lg bg-primary-400 px-8 text-white font-semibold text-base transition-colors hover:bg-primary-500"
            >
              Get Early Access &rarr;
            </a>
            <a
              href="#platform"
              className="inline-flex h-12 items-center justify-center rounded-lg border border-border px-8 text-foreground font-semibold text-base transition-colors hover:bg-muted"
            >
              See How It Works
            </a>
          </div>
        </div>

        {/* Hero image */}
        <div className="relative mt-16 max-w-4xl mx-auto">
          <Image
            src="/images/hero-lobby.webp"
            alt="Diverse group of apartment owners chatting in a modern strata building lobby"
            width={1600}
            height={900}
            className="w-full rounded-2xl object-cover aspect-video"
            priority
          />

          {/* Stat pills */}
          <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 flex flex-wrap justify-center gap-3">
            <div className="bg-white rounded-full shadow-lg px-5 py-2.5 text-sm font-semibold text-foreground border border-border whitespace-nowrap">
              <span className="text-primary-400 font-bold">100%</span> Owner-held data
            </div>
            <div className="bg-white rounded-full shadow-lg px-5 py-2.5 text-sm font-semibold text-foreground border border-border whitespace-nowrap">
              <span className="text-primary-400 font-bold">0</span> Hidden fees
            </div>
            <div className="bg-white rounded-full shadow-lg px-5 py-2.5 text-sm font-semibold text-foreground border border-border whitespace-nowrap">
              <span className="text-primary-400 font-bold">24/7</span> Live visibility
            </div>
          </div>
        </div>
      </section>

      {/* ═══════ The Platform ═══════ */}
      <section id="platform" className="px-6 py-24 max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <span className="text-sm font-semibold text-primary-400 uppercase tracking-wider">
            The Platform
          </span>
          <h2 className="mt-3 text-3xl sm:text-4xl font-bold font-heading text-foreground">
            Built for owners. <span className="text-primary-400">Not managers.</span>
          </h2>
        </div>

        <div className="flex flex-col gap-10">
          {/* Feature 1 — Financial Transparency (photo left) */}
          <div className="flex flex-col md:flex-row items-stretch gap-0 rounded-2xl border border-border overflow-hidden bg-card border-l-4 border-l-primary-400">
            <div className="md:w-1/2 min-h-[240px] relative">
              <Image
                src="/images/feature-financial.webp"
                alt="Family enjoying the view from their apartment balcony overlooking Sydney Harbour"
                fill
                className="object-cover"
              />
            </div>
            <div className="md:w-1/2 p-8 flex flex-col justify-center">
              <span className="inline-block self-start rounded-full bg-primary-50 text-primary-500 text-xs font-semibold px-3 py-1 mb-3">
                Financial Transparency
              </span>
              <h3 className="text-xl font-bold font-heading text-foreground mb-2">
                See everything. Always.
              </h3>
              <p className="text-muted-foreground leading-relaxed">
                Every levy dollar tracked in real time. No hidden accounts, no buried
                receipts. Owners see every transaction the moment it happens &mdash;
                because it&apos;s their money.
              </p>
            </div>
          </div>

          {/* Feature 2 — Owner Control (REVERSED — content left, photo right) */}
          <div className="flex flex-col md:flex-row-reverse items-stretch gap-0 rounded-2xl border border-border overflow-hidden bg-card border-l-4 border-l-primary-400">
            <div className="md:w-1/2 min-h-[240px] relative">
              <Image
                src="/images/feature-owner.webp"
                alt="Owner reviewing strata documents on a tablet at home"
                fill
                className="object-cover"
              />
            </div>
            <div className="md:w-1/2 p-8 flex flex-col justify-center">
              <span className="inline-block self-start rounded-full bg-primary-50 text-primary-500 text-xs font-semibold px-3 py-1 mb-3">
                Owner Control
              </span>
              <h3 className="text-xl font-bold font-heading text-foreground mb-2">
                It&apos;s your building. Own your data.
              </h3>
              <p className="text-muted-foreground leading-relaxed">
                Data sovereignty means the owners corporation retains full control of
                every record, document, and financial entry. Switch managers without
                losing a single byte.
              </p>
            </div>
          </div>

          {/* Feature 3 — Compliance Ready (amber border, photo left) */}
          <div className="flex flex-col md:flex-row items-stretch gap-0 rounded-2xl border border-border overflow-hidden bg-card border-l-4 border-l-gold-400">
            <div className="md:w-1/2 min-h-[240px] relative">
              <Image
                src="/images/feature-compliance.webp"
                alt="Residents chatting outside a modern Australian apartment complex"
                fill
                className="object-cover"
              />
            </div>
            <div className="md:w-1/2 p-8 flex flex-col justify-center">
              <span className="inline-block self-start rounded-full bg-gold-50 text-gold-500 text-xs font-semibold px-3 py-1 mb-3">
                Compliance Ready
              </span>
              <h3 className="text-xl font-bold font-heading text-foreground mb-2">
                Governance made simple.
              </h3>
              <p className="text-muted-foreground leading-relaxed">
                Meeting minutes, AGM notices, by-law registers, and compliance
                certificates &mdash; all organised, all auditable, all in one place.
              </p>
            </div>
          </div>

          {/* Feature 4 — Adviser Framework (REVERSED) */}
          <div className="flex flex-col md:flex-row-reverse items-stretch gap-0 rounded-2xl border border-border overflow-hidden bg-card border-l-4 border-l-primary-400">
            <div className="md:w-1/2 min-h-[240px] relative">
              <Image
                src="/images/feature-adviser.webp"
                alt="Strata manager reviewing building plans on a tablet"
                fill
                className="object-cover"
              />
            </div>
            <div className="md:w-1/2 p-8 flex flex-col justify-center">
              <span className="inline-block self-start rounded-full bg-primary-50 text-primary-500 text-xs font-semibold px-3 py-1 mb-3">
                Adviser Framework
              </span>
              <h3 className="text-xl font-bold font-heading text-foreground mb-2">
                Your manager works for you.
              </h3>
              <p className="text-muted-foreground leading-relaxed">
                Strata managers become advisers with scoped, revocable permissions.
                Owners grant access, set boundaries, and revoke privileges &mdash;
                all from a single dashboard.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════ The Sovereign Ledger ═══════ */}
      <section id="financials" className="px-6 py-24 bg-muted">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <span className="text-sm font-semibold text-primary-400 uppercase tracking-wider">
              The Sovereign Ledger
            </span>
            <h2 className="mt-3 text-3xl sm:text-4xl font-bold font-heading text-foreground">
              Every dollar. Accounted for.
            </h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
            {/* Fund cards */}
            <div className="flex flex-col gap-4">
              <FundCard
                name="Admin Fund"
                balance="$48,290"
                change="+12%"
                changePositive
                color="bg-primary-400"
              />
              <FundCard
                name="Sinking Fund"
                balance="$124,500"
                change="+8%"
                changePositive
                color="bg-purple-400"
              />
              <FundCard
                name="Contingency Fund"
                balance="$31,070"
                change="-2%"
                changePositive={false}
                color="bg-gold-400"
              />
            </div>

            {/* Transaction table */}
            <div className="bg-card rounded-2xl border border-border overflow-hidden">
              <div className="px-6 py-4 border-b border-border">
                <h3 className="font-heading font-semibold text-foreground">
                  Recent Transactions
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b border-border">
                      <th className="px-6 py-3 font-medium">Date</th>
                      <th className="px-6 py-3 font-medium">Description</th>
                      <th className="px-6 py-3 font-medium text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="text-foreground">
                    <tr className="border-b border-border">
                      <td className="px-6 py-3 whitespace-nowrap">12 Oct 2026</td>
                      <td className="px-6 py-3">Quarterly levy &mdash; Lot 4</td>
                      <td className="px-6 py-3 text-right text-success font-medium">+$1,240</td>
                    </tr>
                    <tr className="border-b border-border">
                      <td className="px-6 py-3 whitespace-nowrap">10 Oct 2026</td>
                      <td className="px-6 py-3">Lift maintenance &mdash; Schindler</td>
                      <td className="px-6 py-3 text-right text-danger font-medium">-$3,850</td>
                    </tr>
                    <tr className="border-b border-border">
                      <td className="px-6 py-3 whitespace-nowrap">08 Oct 2026</td>
                      <td className="px-6 py-3">Insurance premium &mdash; CHU</td>
                      <td className="px-6 py-3 text-right text-danger font-medium">-$12,400</td>
                    </tr>
                    <tr className="border-b border-border">
                      <td className="px-6 py-3 whitespace-nowrap">05 Oct 2026</td>
                      <td className="px-6 py-3">Quarterly levy &mdash; Lot 7</td>
                      <td className="px-6 py-3 text-right text-success font-medium">+$1,240</td>
                    </tr>
                    <tr>
                      <td className="px-6 py-3 whitespace-nowrap">01 Oct 2026</td>
                      <td className="px-6 py-3">Garden maintenance &mdash; GreenCo</td>
                      <td className="px-6 py-3 text-right text-danger font-medium">-$680</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="px-6 py-4 bg-primary-50 border-t border-primary-100">
                <p className="text-sm font-semibold text-primary-500">
                  Your funds. Your oversight.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════ The Adviser Gateway ═══════ */}
      <section id="adviser" className="px-6 py-24 max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <span className="text-sm font-semibold text-primary-400 uppercase tracking-wider">
            The Adviser Gateway
          </span>
          <h2 className="mt-3 text-3xl sm:text-4xl font-bold font-heading text-foreground">
            You set the rules. They follow them.
          </h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Owner Master Controls */}
          <div className="rounded-2xl border-2 border-primary-400 bg-card overflow-hidden">
            <div className="px-6 py-4 bg-primary-50 border-b border-primary-100">
              <h3 className="font-heading font-semibold text-foreground">
                Owner Master Controls
              </h3>
            </div>
            <div className="divide-y divide-border">
              {permissions.map((perm, idx) => (
                <div
                  key={perm.label}
                  className="flex items-center justify-between px-6 py-4"
                >
                  <span className="text-sm font-medium text-foreground">
                    {perm.label}
                  </span>
                  <button
                    type="button"
                    onClick={() => togglePermission(idx)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ${
                      perm.enabled ? "bg-primary-400" : "bg-gray-300"
                    }`}
                    role="switch"
                    aria-checked={perm.enabled}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition-transform duration-200 mt-0.5 ${
                        perm.enabled ? "translate-x-5 ml-0.5" : "translate-x-0 ml-0.5"
                      }`}
                    />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Adviser's View */}
          <div className="rounded-2xl border-2 border-dashed border-gold-400 bg-card overflow-hidden">
            <div className="px-6 py-4 bg-gold-50 border-b border-gold-100">
              <h3 className="font-heading font-semibold text-foreground">
                Adviser&apos;s View
              </h3>
            </div>
            <div className="divide-y divide-border">
              {permissions.map((perm) => (
                <div
                  key={perm.label}
                  className="flex items-center justify-between px-6 py-4"
                >
                  <span className="text-sm font-medium text-foreground">
                    {perm.label}
                  </span>
                  <span
                    className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                      perm.enabled
                        ? "bg-success/10 text-success"
                        : "bg-danger/10 text-danger"
                    }`}
                  >
                    {perm.enabled ? "Granted" : "Revoked"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══════ The Asset Vault ═══════ */}
      <section id="vault" className="px-6 py-24 bg-muted">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <span className="text-sm font-semibold text-primary-400 uppercase tracking-wider">
              The Asset Vault
            </span>
            <h2 className="mt-3 text-3xl sm:text-4xl font-bold font-heading text-foreground">
              Every document. Digitised and secure.
            </h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
            {/* Vault photo */}
            <div className="w-full rounded-2xl aspect-square max-h-[480px] relative overflow-hidden">
              <Image
                src="/images/vault-garden.webp"
                alt="Neighbours chatting along a garden pathway in a strata complex"
                fill
                className="object-cover rounded-2xl"
              />
            </div>

            {/* Document cards grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 gap-4">
              <DocumentCard
                title="Financial Reports"
                badge="Finance"
                borderColor="border-t-primary-400"
                badgeColor="bg-primary-50 text-primary-500"
              />
              <DocumentCard
                title="AGM Minutes"
                badge="Governance"
                borderColor="border-t-purple-400"
                badgeColor="bg-purple-50 text-purple-500"
              />
              <DocumentCard
                title="Building Plans"
                badge="Assets"
                borderColor="border-t-gold-400"
                badgeColor="bg-gold-50 text-gold-500"
              />
              <DocumentCard
                title="Bylaws & Rules"
                badge="Legal"
                borderColor="border-t-purple-400"
                badgeColor="bg-purple-50 text-purple-500"
              />
              <DocumentCard
                title="Maintenance Log"
                badge="Operations"
                borderColor="border-t-primary-400"
                badgeColor="bg-primary-50 text-primary-500"
              />
              <DocumentCard
                title="Insurance Policies"
                badge="Compliance"
                borderColor="border-t-gold-400"
                badgeColor="bg-gold-50 text-gold-500"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ═══════ Early Access CTA ═══════ */}
      <section
        id="early-access"
        className="px-6 py-24 relative overflow-hidden"
      >
        {/* Background image with gradient overlay */}
        <Image
          src="/images/cta-lobby.webp"
          alt=""
          fill
          className="object-cover"
          aria-hidden="true"
        />
        <div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(135deg, rgba(0,212,191,0.85) 0%, rgba(139,154,255,0.85) 50%, rgba(124,58,237,0.85) 100%)",
          }}
        />

        {/* Ghost watermark */}
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none select-none"
          aria-hidden="true"
        >
          <span
            className="text-white/5 font-heading font-bold whitespace-nowrap"
            style={{ fontSize: "12rem" }}
          >
            StrataVerze
          </span>
        </div>

        <div className="relative z-10 max-w-2xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold font-heading text-white mb-4">
            Ready to take the wheel?
          </h2>
          <p className="text-white/80 text-lg mb-10 leading-relaxed">
            Join the waitlist and be among the first owners corporations to experience
            true data sovereignty.
          </p>

          {/* Waitlist form */}
          <div className="max-w-md mx-auto mb-10">
            <WaitlistForm />
          </div>

          <div className="flex items-center justify-center mb-6">
            <a
              href="/login"
              className="text-white/70 text-sm hover:text-white transition-colors underline underline-offset-4"
            >
              Already have an account? Log in
            </a>
          </div>

          {/* Trust points */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6 text-white/70 text-sm">
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
              No credit card required
            </span>
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
              Australian-hosted data
            </span>
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
              Cancel anytime
            </span>
          </div>
        </div>
      </section>

      {/* ═══════ Footer ═══════ */}
      <footer className="px-6 py-16 bg-dark-bg text-white">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-12 mb-12">
            {/* Brand column */}
            <div>
              <div className="mb-4">
                <Logo size="sm" variant="white" />
              </div>
              <div className="w-12 h-1 rounded-full bg-primary-400 mb-4" />
              <p className="text-sm text-white/60 leading-relaxed">
                Owner-first strata management for Australian owners corporations.
                Transparent. Sovereign. Simple.
              </p>
            </div>

            {/* Platform links */}
            <div>
              <h4 className="font-heading font-semibold mb-4 text-sm uppercase tracking-wider text-white/40">
                Platform
              </h4>
              <ul className="flex flex-col gap-2.5 text-sm text-white/60">
                <li>
                  <a href="#platform" className="hover:text-white transition-colors">
                    Features
                  </a>
                </li>
                <li>
                  <a href="#financials" className="hover:text-white transition-colors">
                    Financial Transparency
                  </a>
                </li>
                <li>
                  <a href="#adviser" className="hover:text-white transition-colors">
                    Adviser Gateway
                  </a>
                </li>
                <li>
                  <a href="#vault" className="hover:text-white transition-colors">
                    Asset Vault
                  </a>
                </li>
              </ul>
            </div>

            {/* Company links */}
            <div>
              <h4 className="font-heading font-semibold mb-4 text-sm uppercase tracking-wider text-white/40">
                Company
              </h4>
              <ul className="flex flex-col gap-2.5 text-sm text-white/60">
                <li>
                  <a href="#" className="hover:text-white transition-colors">
                    About
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white transition-colors">
                    Contact
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white transition-colors">
                    Careers
                  </a>
                </li>
                <li>
                  <a href="#early-access" className="hover:text-white transition-colors">
                    Early Access
                  </a>
                </li>
              </ul>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="border-t border-white/10 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-white/40">
              &copy; 2026 StrataVerze Pty Ltd. All rights reserved.
            </p>
            <div className="flex items-center gap-6 text-xs text-white/40">
              <a href="#" className="hover:text-white/60 transition-colors">
                Privacy Policy
              </a>
              <a href="#" className="hover:text-white/60 transition-colors">
                Terms of Service
              </a>
              <a href="#" className="hover:text-white/60 transition-colors">
                Accessibility
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ─── Sub-components ─── */

function FundCard({
  name,
  balance,
  change,
  changePositive,
  color,
}: {
  name: string;
  balance: string;
  change: string;
  changePositive: boolean;
  color: string;
}) {
  return (
    <div className="flex items-center gap-4 rounded-2xl bg-card border border-border p-6">
      <div className={`w-3 h-12 rounded-full ${color}`} />
      <div className="flex-1">
        <p className="text-sm text-muted-foreground">{name}</p>
        <p className="text-2xl font-bold font-heading text-foreground">{balance}</p>
      </div>
      <span
        className={`text-sm font-semibold ${
          changePositive ? "text-success" : "text-danger"
        }`}
      >
        {change}
      </span>
    </div>
  );
}

function DocumentCard({
  title,
  badge,
  borderColor,
  badgeColor,
}: {
  title: string;
  badge: string;
  borderColor: string;
  badgeColor: string;
}) {
  return (
    <div
      className={`rounded-xl bg-card border border-border border-t-4 ${borderColor} p-4 flex flex-col gap-3`}
    >
      <span className={`inline-block self-start rounded-full text-[10px] font-semibold px-2.5 py-0.5 ${badgeColor}`}>
        {badge}
      </span>
      <p className="text-sm font-semibold text-foreground leading-snug">{title}</p>
      <div className="flex items-center gap-1 text-muted-foreground">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
        </svg>
        <span className="text-[11px]">3 files</span>
      </div>
    </div>
  );
}
