import { Logo } from "@/components/logo";
import { SignOutButton } from "@/app/(portal)/settings/sign-out-button";

/** The centred card used by the sign-in pages. */
export function MfaShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-muted px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8">
          <Logo size="lg" variant="gradient" />
        </div>
        <div className="rounded-[var(--radius-card)] bg-white border border-line p-8">
          <h1 className="text-xl font-bold font-heading text-ink mb-1 text-balance">{title}</h1>
          <p className="text-sm text-ink-muted mb-6">{description}</p>
          {children}
        </div>
        <p className="text-xs text-ink-muted text-center mt-6">
          Lost your phone? Ask a StrataVerze administrator to reset your authenticator.
        </p>
        <div className="flex justify-center mt-4">
          <SignOutButton />
        </div>
      </div>
    </div>
  );
}
