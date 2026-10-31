import { Logo } from "@/components/logo";
import {
  PRIMARY_ACTION_CLASS,
  SECONDARY_ACTION_CLASS,
  TEXT_LINK_CLASS,
} from "@/components/ui/action-styles";

/**
 * The page shown for a wrong address or an unexpected error (AR-038), at
 * the app root (not-found, error, global-error) and inside the portal.
 *
 * It never shows an error's message or stack, only its digest as a
 * reference. Whether someone is signed in is not checked here (an error
 * page should not depend on the session), so it offers both ways back:
 * the dashboard, which sends a signed-out visitor to sign in, and sign in.
 * Plain links, not client navigation, so a broken page is fully reloaded.
 * The logo links to the app root, which src/proxy.ts sends to the
 * dashboard or, for a signed-out visitor, to the public site.
 */

export const SUPPORT_EMAIL = "support@strataverze.com";

export function StatusPage({
  title,
  description,
  digest,
  retry,
  layout = "page",
}: {
  title: string;
  description: string;
  /** The error's digest, matched against the server logs. */
  digest?: string;
  /** Shown as Try again, the main action, when the error may be passing. */
  retry?: () => void;
  /** "page" stands alone with the logo; "inline" sits inside the portal. */
  layout?: "page" | "inline";
}) {
  const reference = digest ? `Reference: ${digest}` : null;
  const mailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("StrataVerze help")}${
    reference ? `&body=${encodeURIComponent(reference)}` : ""
  }`;
  const Heading = layout === "page" ? "h1" : "h2";

  const card = (
    <div className="w-full max-w-md rounded-[var(--radius-card)] border border-line bg-white p-8 text-center">
      <Heading className="font-heading text-xl font-bold text-ink text-balance">{title}</Heading>
      <p className="mt-2 text-sm text-ink-muted">{description}</p>

      <div className="mt-6 flex flex-col gap-3">
        {retry && (
          <button type="button" onClick={() => retry()} className={`w-full ${PRIMARY_ACTION_CLASS}`}>
            Try again
          </button>
        )}
        <a href="/dashboard" className={`w-full ${retry ? SECONDARY_ACTION_CLASS : PRIMARY_ACTION_CLASS}`}>
          Go to your dashboard
        </a>
        <a href="/login" className={`w-full ${SECONDARY_ACTION_CLASS}`}>
          Sign in
        </a>
      </div>

      <div className="mt-6 border-t border-line pt-4 text-sm text-ink-muted">
        <p>
          Need help? Email{" "}
          <span className="select-all font-medium text-ink">{SUPPORT_EMAIL}</span>
        </p>
        <p className="mt-1">
          <a href={mailto} className={TEXT_LINK_CLASS}>
            Email support
          </a>
        </p>
        {reference && (
          <p className="mt-3 text-xs">
            <span className="select-all font-mono">{reference}</span>
          </p>
        )}
      </div>
    </div>
  );

  if (layout === "inline") {
    return <div className="flex min-h-[50vh] items-center justify-center p-6">{card}</div>;
  }

  return (
    <main className="flex min-h-screen flex-1 flex-col items-center justify-center bg-muted px-4 py-10">
      <a href="/" aria-label="StrataVerze home" className="mb-8 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2">
        <Logo size="lg" variant="gradient" />
      </a>
      {card}
    </main>
  );
}

/** The digest of a thrown error, if it has one. Never its message. */
export function digestOf(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "digest" in error) {
    const digest = (error as { digest?: unknown }).digest;
    if (typeof digest === "string" && /^[\w-]{1,64}$/.test(digest)) return digest;
  }
  return undefined;
}
