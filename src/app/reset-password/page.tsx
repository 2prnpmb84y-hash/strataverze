"use client";

import { Suspense, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSearchParams } from "next/navigation";
import { Logo } from "@/components/logo";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col flex-1 items-center justify-center bg-muted px-4">
        <div className="w-full max-w-sm text-center">
          <div className="flex justify-center mb-8">
            <Logo size="lg" variant="gradient" />
          </div>
          <p className="text-sm text-muted-foreground">Loading...</p>
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

  useEffect(() => {
    // Supabase delivers the recovery token via the URL hash.
    // The client library picks it up automatically on init.
    const supabase = createClient();
    supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setReady(true);
      }
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);

    if (password.length < 8) {
      setStatus({
        type: "error",
        message: "Password must be at least 8 characters",
      });
      return;
    }

    if (password !== confirmPassword) {
      setStatus({ type: "error", message: "Passwords do not match" });
      return;
    }

    setLoading(true);

    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({
      password,
    });

    setLoading(false);

    if (updateError) {
      setStatus({ type: "error", message: updateError.message });
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
        <div className="rounded-xl bg-card border border-border p-8 shadow-sm">
          <h1 className="text-xl font-bold font-heading text-card-foreground mb-1">
            Set new password
          </h1>
          <p className="text-sm text-muted-foreground mb-6">
            Enter your new password below
          </p>

          {status?.type === "error" && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 mb-4">
              <p className="text-sm text-red-700">{status.message}</p>
            </div>
          )}

          {status?.type === "success" && (
            <div className="rounded-lg bg-primary-50 border border-primary-200 px-4 py-3 mb-4">
              <p className="text-sm text-primary-500">{status.message}</p>
              <a
                href="/login"
                className="text-sm font-medium text-primary-400 hover:text-primary-500 transition-colors mt-2 inline-block"
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
                  className="block text-sm font-medium text-card-foreground mb-1.5"
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
                  className="w-full rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent transition-shadow"
                  placeholder="At least 8 characters"
                />
              </div>

              <div>
                <label
                  htmlFor="confirmPassword"
                  className="block text-sm font-medium text-card-foreground mb-1.5"
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
                  className="w-full rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent transition-shadow"
                  placeholder="Repeat your password"
                />
              </div>

              <button
                type="submit"
                disabled={loading || (!ready && !error)}
                className="w-full h-11 rounded-lg bg-primary-400 text-white font-semibold text-sm transition-colors hover:bg-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:ring-offset-2 mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Updating..." : "Update password"}
              </button>
            </form>
          )}

          <div className="mt-4 text-center">
            <a
              href="/login"
              className="text-sm text-primary-400 hover:text-primary-500 transition-colors"
            >
              Back to sign in
            </a>
          </div>
        </div>

        <p className="text-xs text-muted-foreground text-center mt-6">
          Owner-first strata management for Australian Owners Corporations
        </p>
      </div>
    </div>
  );
}
