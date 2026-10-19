"use client";

import { useState } from "react";
import { login, signup } from "./actions";
import {
  PasswordStrength,
  validatePasswordStrength,
} from "@/components/ui/password-strength";

type Portal = "owner" | "supplier" | "adviser";

const portalConfig = {
  owner: {
    label: "Owner",
    description: "Sign in to manage your strata property",
    accent: "var(--color-turquoise)",
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M11 2L2 8v12h7v-5h4v5h7V8L11 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    ),
    buttonClass:
      "border-[1.5px] border-turquoise text-turquoise bg-white hover:bg-turquoise hover:text-white focus:ring-turquoise",
  },
  supplier: {
    label: "Supplier",
    description: "Sign in to manage jobs and service requests",
    accent: "var(--color-supplier)",
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M14.5 2.5L7 5v6c0 4.5 3 7.5 5.5 8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M9 7l3-1.5M9 10l3-1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.6" />
        <path d="M14.5 2.5L20 5v6c0 4.5-2.5 7-5.5 8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.5" />
      </svg>
    ),
    buttonClass:
      "border-[1.5px] border-supplier text-supplier bg-white hover:bg-supplier hover:text-white focus:ring-supplier",
  },
  adviser: {
    label: "Adviser",
    description: "Sign in to manage schemes as a strata professional",
    accent: "var(--color-gold-line)",
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <circle cx="11" cy="7" r="4" stroke="currentColor" strokeWidth="1.5" />
        <path d="M4 19c0-3.87 3.13-7 7-7s7 3.13 7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    buttonClass:
      "border-[1.5px] border-gold-line text-gold-line bg-white hover:bg-gold-line hover:text-white focus:ring-gold-line",
  },
} as const;

export function LoginForm({
  error,
  message,
}: {
  error?: string;
  message?: string;
}) {
  const [activePortal, setActivePortal] = useState<Portal>("owner");
  const [isSignUp, setIsSignUp] = useState(false);
  const [password, setPassword] = useState("");
  const config = portalConfig[activePortal];

  return (
    <>
      {/* Portal selector */}
      <fieldset className="mb-6">
        <legend className="text-xs font-medium text-ink-muted uppercase tracking-wider mb-3">
          I am signing in as
        </legend>
        <div className="grid grid-cols-3 gap-2">
          {(["owner", "supplier", "adviser"] as const).map((portal) => {
            const selected = activePortal === portal;
            const cfg = portalConfig[portal];
            return (
              <button
                key={portal}
                type="button"
                onClick={() => setActivePortal(portal)}
                className={`flex flex-col items-center gap-1.5 rounded-[var(--radius-card)] px-2 py-3 text-xs font-medium transition-all border-[1.5px] ${
                  selected
                    ? "bg-white shadow-sm"
                    : "bg-muted/50 border-transparent text-ink-muted hover:text-ink hover:bg-muted"
                }`}
                style={
                  selected
                    ? { borderColor: cfg.accent, color: cfg.accent }
                    : undefined
                }
              >
                <span className={selected ? "" : "text-ink-muted"}>{cfg.icon}</span>
                {cfg.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <h1 className="text-xl font-bold font-heading text-ink mb-1">
        {isSignUp ? "Create account" : "Sign in"}
      </h1>
      <p className="text-sm text-ink-muted mb-6">{config.description}</p>

      {error && (
        <div className="rounded-[var(--radius-card)] bg-red-50 border border-red-200 px-4 py-3 mb-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {message && (
        <div className="rounded-[var(--radius-card)] bg-mint-soft border border-mint px-4 py-3 mb-4">
          <p className="text-sm text-ink">{message}</p>
        </div>
      )}

      <form className="flex flex-col gap-4">
        {/* Hidden field to pass the selected portal mode to the server action */}
        <input type="hidden" name="portal" value={activePortal} />

        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium text-ink mb-1.5"
          >
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="w-full rounded-[var(--radius-card)] border border-line bg-white px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:border-transparent transition-shadow"
            style={
              { "--tw-ring-color": config.accent } as React.CSSProperties
            }
            placeholder="you@example.com"
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="block text-sm font-medium text-ink mb-1.5"
          >
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete={isSignUp ? "new-password" : "current-password"}
            minLength={isSignUp ? 8 : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-[var(--radius-card)] border border-line bg-white px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:border-transparent transition-shadow"
            style={
              { "--tw-ring-color": config.accent } as React.CSSProperties
            }
            placeholder="••••••••"
          />
          {isSignUp && <PasswordStrength password={password} />}
        </div>

        <div className="flex justify-end">
          <a
            href="/forgot-password"
            className="text-sm transition-colors"
            style={{ color: config.accent }}
          >
            Forgot password?
          </a>
        </div>

        <div className="flex flex-col gap-2 mt-2">
          {isSignUp ? (
            <>
              <button
                formAction={(formData) => {
                  const { allMet } = validatePasswordStrength(password);
                  if (!allMet) return;
                  signup(formData);
                }}
                className={`w-full h-11 rounded-full text-white font-semibold text-sm uppercase tracking-[0.04em] transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${config.buttonClass}`}
                disabled={!validatePasswordStrength(password).allMet}
              >
                Create account
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsSignUp(false);
                  setPassword("");
                }}
                className="w-full h-11 rounded-full border-[1.5px] border-line bg-white text-ink-muted font-semibold text-sm uppercase tracking-[0.04em] transition-colors hover:bg-muted hover:text-ink focus:outline-none focus:ring-2 focus:ring-turquoise focus:ring-offset-2"
              >
                Back to sign in
              </button>
            </>
          ) : (
            <>
              <button
                formAction={login}
                className={`w-full h-11 rounded-full text-white font-semibold text-sm uppercase tracking-[0.04em] transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${config.buttonClass}`}
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsSignUp(true);
                  setPassword("");
                }}
                className="w-full h-11 rounded-full border-[1.5px] border-line bg-white text-ink-muted font-semibold text-sm uppercase tracking-[0.04em] transition-colors hover:bg-muted hover:text-ink focus:outline-none focus:ring-2 focus:ring-turquoise focus:ring-offset-2"
              >
                Create account
              </button>
            </>
          )}
        </div>
      </form>
    </>
  );
}
