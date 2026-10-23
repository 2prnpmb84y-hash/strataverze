"use client";

import { Suspense, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSearchParams } from "next/navigation";
import { Logo } from "@/components/logo";
import {
  PasswordStrength,
  validatePasswordStrength,
} from "@/components/ui/password-strength";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col flex-1 items-center justify-center bg-muted px-4">
        <div className="w-full max-w-sm text-center">
          <div className="flex justify-center mb-8">
            <Logo size="lg" variant="gradient" />
          </div>
          <p className="text-sm text-ink-muted">Loading...</p>
        </div>
      </div>
    }>
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<{
    type: "error" | "success";
    message: string;
  } | null>(error ? { type: "error", message: error } : null);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [needsMfa, setNeedsMfa] = useState(false);

  const afterMfa = searchParams.get("after") === "mfa";

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setReady(true);
      }
    });
    // Back from entering an authenticator code: the recovery session is
    // still signed in, now verified.
    if (afterMfa) {
      supabase.auth.getSession().then(({ data }) => {
        if (data.session) setReady(true);
      });
    }
  }, [afterMfa]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);

    const { allMet } = validatePasswordStrength(password);
    if (!allMet) {
      setStatus({
        type: "error",
        message:
          "Password must be at least 8 characters with uppercase, lowercase, number and special character.",
      });
      return;
    }

    if (password !== confirmPassword) {
      setStatus({ type: "error", message: "Passwords do not match." });
      return;
    }

    setLoading(true);

    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({
      password,
    });

    setLoading(false);

    if (updateError) {
      // An account with an authenticator needs a code before its password
      // can change, so a reset link alone cannot take the account over.
      if (updateError.code === "insufficient_aal") {
        setNeedsMfa(true);
        setStatus({
          type: "error",
          message: "Your account uses an authenticator app. Enter a code from it first, then set your new password.",
        });
        return;
      }
      setStatus({
        type: "error",
        message: "Unable to update your password. The reset link may have expired. Please request a new one.",
      });
      return;
    }

    setStatus({
      type: "success",
      message: "Password updated successfully.",
    });
  }

  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-muted px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <Logo size="lg" variant="gradient" />
        </div>

        {/* Card */}
        <div className="rounded-[var(--radius-card)] bg-white border border-line p-8">
          <h1 className="text-xl font-bold font-heading text-ink mb-1">
            Set new password
          </h1>
          <p className="text-sm text-ink-muted mb-6">
            Enter your new password below
          </p>

          {status?.type === "error" && (
            <div className="rounded-[var(--radius-card)] bg-red-50 border border-red-200 px-4 py-3 mb-4">
              <p className="text-sm text-red-700">{status.message}</p>
              {needsMfa && (
                <a
                  href={`/mfa?next=${encodeURIComponent("/reset-password?after=mfa")}`}
                  className="text-sm font-medium text-turquoise hover:text-turquoise/80 transition-colors mt-2 inline-block"
                >
                  Enter authenticator code
                </a>
              )}
            </div>
          )}

          {status?.type === "success" && (
            <div className="rounded-[var(--radius-card)] bg-mint-soft border border-mint px-4 py-3 mb-4">
              <p className="text-sm text-ink">{status.message}</p>
              <a
                href="/login"
                className="text-sm font-medium text-turquoise hover:text-turquoise/80 transition-colors mt-2 inline-block"
              >
                Sign in
              </a>
            </div>
          )}

          {status?.type !== "success" && (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-ink mb-1.5"
                >
                  New password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  autoComplete="new-password"
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-[var(--radius-card)] border border-line bg-white px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-turquoise focus:border-transparent transition-shadow"
                  placeholder="At least 8 characters"
                />
                <PasswordStrength password={password} />
              </div>

              <div>
                <label
                  htmlFor="confirmPassword"
                  className="block text-sm font-medium text-ink mb-1.5"
                >
                  Confirm password
                </label>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  required
                  autoComplete="new-password"
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded-[var(--radius-card)] border border-line bg-white px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-turquoise focus:border-transparent transition-shadow"
                  placeholder="Repeat your password"
                />
              </div>

              <button
                type="submit"
                disabled={
                  loading ||
                  (!ready && !error) ||
                  !validatePasswordStrength(password).allMet ||
                  password !== confirmPassword
                }
                className="w-full h-11 rounded-full bg-turquoise text-white font-semibold text-sm uppercase tracking-[0.04em] transition-colors hover:bg-turquoise/90 focus:outline-none focus:ring-2 focus:ring-turquoise focus:ring-offset-2 mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Updating..." : "Update password"}
              </button>
            </form>
          )}

          <div className="mt-4 text-center">
            <a
              href="/login"
              className="text-sm text-turquoise hover:text-turquoise/80 transition-colors"
            >
              Back to sign in
            </a>
          </div>
        </div>

        <p className="text-xs text-ink-muted text-center mt-6">
          Owner-first strata management for Australian Owners Corporations
        </p>
      </div>
    </div>
  );
}
