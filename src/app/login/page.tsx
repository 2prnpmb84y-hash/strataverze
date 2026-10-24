import { LoginForm } from "./login-form";
import { LogoMark, Logo } from "@/components/logo";
import { sessionEndMessage } from "@/lib/auth/session-policy";

export const instant = false;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string; reason?: string }>;
}) {
  const { error, reason } = await searchParams;
  // Why the last session ended (timeouts, security stage S5), as fixed text.
  const message = sessionEndMessage(reason) ?? (await searchParams).message;

  return (
    <div className="flex flex-1 min-h-screen">
      {/* Left panel — dark gradient, hidden on mobile */}
      <div className="hidden lg:flex lg:w-1/2 rail-gradient flex-col items-center justify-center px-12 relative overflow-hidden">
        {/* Decorative circles */}
        <div className="absolute top-[-80px] left-[-80px] w-64 h-64 rounded-full bg-white/5" />
        <div className="absolute bottom-[-60px] right-[-40px] w-48 h-48 rounded-full bg-white/5" />

        <div className="relative z-10 flex flex-col items-center text-center max-w-md">
          <LogoMark size={120} variant="white" />
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
            <Logo size="xl" variant="dark" />
          </div>

          {/* Desktop logo — hidden on mobile */}
          <div className="hidden lg:flex justify-center mb-8">
            <Logo size="lg" variant="dark" />
          </div>

          {/* Form card */}
          <div className="rounded-[var(--radius-card)] bg-white border border-line p-8">
            <LoginForm error={error} message={message} />
          </div>

          <p className="text-xs text-ink-muted text-center mt-6">
            Owner-first strata management for Australian Owners Corporations
          </p>
        </div>
      </div>
    </div>
  );
}
