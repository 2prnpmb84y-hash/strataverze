"use client";

import { useState } from "react";
import { login, signup } from "./actions";
import {
  PasswordStrength,
  validatePasswordStrength,
} from "@/components/ui/password-strength";

/** The one sign-in form (25 Oct 2026): everyone signs in here, then goes to their portal. */
const BUTTON_CLASS =
  "border-[1.5px] border-turquoise text-turquoise bg-white hover:bg-turquoise hover:text-white focus:ring-turquoise";
const ACCENT = "var(--color-turquoise)";

export function LoginForm({
  error,
  message,
  next,
}: {
  error?: string;
  message?: string;
  /** Where to return after signing in, if the person was sent here. Checked on the server. */
  next?: string;
}) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [password, setPassword] = useState("");

  return (
    <>
      <h1 className="text-xl font-bold font-heading text-ink mb-1">
        {isSignUp ? "Create account" : "Sign in"}
      </h1>
      <p className="text-sm text-ink-muted mb-6">
        {isSignUp ? "Create your StrataVerze account." : "Owners, committee members, advisers and suppliers all sign in here."}
      </p>

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
        {next && <input type="hidden" name="next" value={next} />}

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
              { "--tw-ring-color": ACCENT } as React.CSSProperties
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
              { "--tw-ring-color": ACCENT } as React.CSSProperties
            }
            placeholder="••••••••"
          />
          {isSignUp && <PasswordStrength password={password} />}
        </div>

        <div className="flex justify-end">
          <a
            href="/forgot-password"
            className="text-sm transition-colors"
            style={{ color: ACCENT }}
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
                className={`w-full h-11 rounded-full text-white font-semibold text-sm uppercase tracking-[0.04em] transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${BUTTON_CLASS}`}
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
                className={`w-full h-11 rounded-full text-white font-semibold text-sm uppercase tracking-[0.04em] transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${BUTTON_CLASS}`}
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
