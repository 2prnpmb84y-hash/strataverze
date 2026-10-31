import { resetPassword } from "./actions";
import { Turnstile } from "@/components/auth/turnstile";
import { SubmitButton } from "@/components/auth/submit-button";
import { INPUT_FOCUS_CLASS, TEXT_LINK_CLASS } from "@/components/ui/action-styles";
import { captchaSiteKey } from "@/lib/auth/captcha";
import { Logo } from "@/components/logo";
import { authPageError, authPageMessage } from "@/lib/auth/page-messages";
import { MARKETING_SITE_URL } from "@/lib/site-url";

export const instant = false;

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  // Only fixed texts are shown from the address (S7).
  const params = await searchParams;
  const error = authPageError(params.error);
  const message = authPageMessage(params.message);

  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-muted px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <a href={MARKETING_SITE_URL} aria-label="StrataVerze home page">
            <Logo size="lg" variant="gradient" />
          </a>
        </div>

        {/* Card */}
        <div className="rounded-[var(--radius-card)] bg-white border border-line p-8">
          <h1 className="text-xl font-bold font-heading text-ink mb-1">
            Reset your password
          </h1>
          <p className="text-sm text-ink-muted mb-6">
            Enter your email and we&apos;ll send you a reset link
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

            <Turnstile siteKey={captchaSiteKey()} />
            <SubmitButton formAction={resetPassword} pendingLabel="Sending…" className="mt-2">
              Send reset link
            </SubmitButton>
          </form>

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
