"use client";

import { useState } from "react";
import { login, signup } from "./actions";
import {
  PasswordStrength,
  validatePasswordStrength,
} from "@/components/ui/password-strength";
import { Turnstile } from "@/components/auth/turnstile";
import { SubmitButton } from "@/components/auth/submit-button";
import { INPUT_FOCUS_CLASS, QUIET_ACTION_CLASS, TEXT_LINK_CLASS } from "@/components/ui/action-styles";
import { captchaSiteKey } from "@/lib/auth/captcha";

/**
 * The one sign-in form (25 Oct 2026): everyone signs in here, then goes to
 * their portal. Sign in is the filled main action; Create account is a
 * quiet link below it (AR-037; the colours are in action-styles.ts).
 */
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
            className={`w-full rounded-[var(--radius-card)] border border-line bg-white px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-muted ${INPUT_FOCUS_CLASS} transition-shadow`}
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
            className={`w-full rounded-[var(--radius-card)] border border-line bg-white px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-muted ${INPUT_FOCUS_CLASS} transition-shadow`}
          />
          {isSignUp && <PasswordStrength password={password} />}
        </div>

        <div className="flex justify-end">
          <a href="/forgot-password" className={`text-sm ${TEXT_LINK_CLASS}`}>
            Forgot password?
          </a>
        </div>

        {/* The security check (SEC-020), when CAPTCHA is set up. */}
        <Turnstile siteKey={captchaSiteKey()} />

        <div className="flex flex-col items-center gap-4 mt-2">
          {isSignUp ? (
            <>
              <SubmitButton
                formAction={(formData) => {
                  const { allMet } = validatePasswordStrength(password);
                  if (!allMet) return;
                  return signup(formData);
                }}
                disabled={!validatePasswordStrength(password).allMet}
                pendingLabel="Creating account…"
              >
                Create account
              </SubmitButton>
              <p className="text-sm text-ink-muted">
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setIsSignUp(false);
                    setPassword("");
                  }}
                  className={QUIET_ACTION_CLASS}
                >
                  Back to sign in
                </button>
              </p>
            </>
          ) : (
            <>
              <SubmitButton formAction={login} pendingLabel="Signing in…">
                Sign in
              </SubmitButton>
              <p className="text-sm text-ink-muted">
                New to StrataVerze?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setIsSignUp(true);
                    setPassword("");
                  }}
                  className={QUIET_ACTION_CLASS}
                >
                  Create account
                </button>
              </p>
            </>
          )}
        </div>
      </form>
    </>
  );
}
