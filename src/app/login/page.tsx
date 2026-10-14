import { LoginForm } from "./login-form";

export const instant = false;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { error, message } = await searchParams;

  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-muted px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-lg sidebar-gradient" />
          <span className="text-2xl font-bold font-heading text-foreground tracking-tight">
            StrataVerze
          </span>
        </div>

        {/* Card */}
        <div className="rounded-xl bg-card border border-border p-8 shadow-sm">
          <LoginForm error={error} message={message} />
        </div>

        <p className="text-xs text-muted-foreground text-center mt-6">
          Owner-first strata management for Australian Owners Corporations
        </p>
      </div>
    </div>
  );
}
