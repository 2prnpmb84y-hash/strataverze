import { LoginForm } from "./login-form";
import { LogoMark, Logo } from "@/components/logo";
import { sessionEndMessage } from "@/lib/auth/session-policy";
import { authPageError, authPageMessage } from "@/lib/auth/page-messages";
import { getAvailablePortals, getCurrentProfile } from "@/lib/queries/profiles";
import { ContinueAs } from "./continue-as";
import { MARKETING_SITE_URL } from "@/lib/site-url";

export const instant = false;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string; reason?: string }>;
}) {
  const params = await searchParams;
  // Only fixed texts are shown from the address (S7), so a crafted link
  // cannot put its own words on the sign-in page.
  const error = authPageError(params.error);
  // Why the last session ended (timeouts, security stage S5), as fixed text.
  const message = sessionEndMessage(params.reason) ?? authPageMessage(params.message);

  // Already signed in: offer their portals rather than the form.
  const profile = await getCurrentProfile();
  const portals = profile
    ? [...(await getAvailablePortals(profile.id)), ...(profile.isPlatformAdmin ? ["admin"] : [])]
    : [];

  return (
    <div className="flex flex-1 min-h-screen">
      {/* Left panel — dark gradient, hidden on mobile */}
      <div className="hidden lg:flex lg:w-1/2 rail-gradient flex-col items-center justify-center px-12 relative overflow-hidden">
        {/* Decorative circles */}
        <div className="absolute top-[-80px] left-[-80px] w-64 h-64 rounded-full bg-white/5" />
        <div className="absolute bottom-[-60px] right-[-40px] w-48 h-48 rounded-full bg-white/5" />

        <div className="relative z-10 flex flex-col items-center text-center max-w-md">
          <a href={MARKETING_SITE_URL} aria-label="StrataVerze home page" className="rounded-full focus-visible:outline-2 focus-visible:outline-white">
            <LogoMark size={120} variant="white" />
          </a>
          <h1 className="mt-8 text-3xl font-bold font-heading text-white leading-tight">
            Owner-first strata management
          </h1>
          <p className="mt-3 text-base text-white/70 leading-relaxed">
            Transparent, efficient, and fair governance for Australian Owners
            Corporations.
          </p>
        </div>
      </div>

      {/* Right panel — white with login form */}
      <div className="flex flex-1 flex-col items-center justify-center bg-white px-4">
        <div className="w-full max-w-sm">
          {/* Mobile logo — hidden on desktop */}
          <div className="flex justify-center mb-8 lg:hidden">
            <a href={MARKETING_SITE_URL} aria-label="StrataVerze home page">
              <Logo size="xl" variant="dark" />
            </a>
          </div>

          {/* Desktop logo — hidden on mobile */}
          <div className="hidden lg:flex justify-center mb-8">
            <a href={MARKETING_SITE_URL} aria-label="StrataVerze home page">
              <Logo size="lg" variant="dark" />
            </a>
          </div>

          {/* Form card */}
          <div className="rounded-[var(--radius-card)] bg-white border border-line p-8">
            {profile ? (
              <ContinueAs email={String(profile.email ?? "")} portals={portals.length ? portals : ["owner"]} />
            ) : (
              <LoginForm error={error} message={message} />
            )}
          </div>

          <p className="text-xs text-ink-muted text-center mt-6">
            Owner-first strata management for Australian Owners Corporations
          </p>
        </div>
      </div>
    </div>
  );
}
