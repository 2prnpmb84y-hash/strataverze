"use client";

import { Suspense, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSearchParams } from "next/navigation";
import { Logo } from "@/components/logo";
import { MARKETING_SITE_URL } from "@/lib/site-url";
import { INPUT_FOCUS_CLASS, PRIMARY_ACTION_CLASS, TEXT_LINK_CLASS } from "@/components/ui/action-styles";
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
            <a href={MARKETING_SITE_URL} aria-label="StrataVerze home page">
              <Logo size="lg" variant="gradient" />
            </a>
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
    // The link's own error text is not shown (S7): a crafted link could
    // otherwise put any words on the page.
  } | null>(error ? { type: "error", message: "The reset link is invalid or has expired. Please request a new one." } : null);
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
                  className={`text-sm mt-2 inline-block ${TEXT_LINK_CLASS}`}
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
                className={`text-sm mt-2 inline-block ${TEXT_LINK_CLASS}`}
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
                  className={`w-full rounded-[var(--radius-card)] border border-line bg-white px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-muted ${INPUT_FOCUS_CLASS} transition-shadow`}
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
                  className={`w-full rounded-[var(--radius-card)] border border-line bg-white px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-muted ${INPUT_FOCUS_CLASS} transition-shadow`}
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
                aria-busy={loading || undefined}
                className={`w-full mt-2 ${PRIMARY_ACTION_CLASS}`}
              >
                {loading ? "Updating…" : "Update password"}
              </button>
            </form>
          )}

          <div className="mt-4 text-center">
            <a href="/login" className={`text-sm ${TEXT_LINK_CLASS}`}>
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
