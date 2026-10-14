import { login, signup } from "./actions";

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
          <h1 className="text-xl font-bold font-heading text-card-foreground mb-1">
            Sign in
          </h1>
          <p className="text-sm text-muted-foreground mb-6">
            Enter your email to access your portal
          </p>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 mb-4">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {message && (
            <div className="rounded-lg bg-primary-50 border border-primary-200 px-4 py-3 mb-4">
              <p className="text-sm text-primary-500">{message}</p>
            </div>
          )}

          <form className="flex flex-col gap-4">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-card-foreground mb-1.5"
              >
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                className="w-full rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent transition-shadow"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-card-foreground mb-1.5"
              >
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                className="w-full rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent transition-shadow"
                placeholder="••••••••"
              />
            </div>

            <div className="flex justify-end">
              <a
                href="/forgot-password"
                className="text-sm text-primary-400 hover:text-primary-500 transition-colors"
              >
                Forgot password?
              </a>
            </div>

            <div className="flex flex-col gap-2 mt-2">
              <button
                formAction={login}
                className="w-full h-11 rounded-lg bg-primary-400 text-white font-semibold text-sm transition-colors hover:bg-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:ring-offset-2"
              >
                Sign in
              </button>

              <button
                formAction={signup}
                className="w-full h-11 rounded-lg border border-border bg-background text-card-foreground font-medium text-sm transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary-400 focus:ring-offset-2"
              >
                Create account
              </button>
            </div>
          </form>
        </div>

        <p className="text-xs text-muted-foreground text-center mt-6">
          Owner-first strata management for Australian Owners Corporations
        </p>
      </div>
    </div>
  );
}
