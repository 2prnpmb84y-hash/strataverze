import Link from "next/link";
import { signOutAction } from "@/lib/actions/sessions";

const LABELS: Record<string, { label: string; detail: string }> = {
  owner: { label: "Owner", detail: "Your property, levies, meetings and documents" },
  adviser: { label: "Adviser", detail: "Manage schemes as a strata professional" },
  supplier: { label: "Supplier", detail: "Quote requests, jobs and invoices" },
  accountant: { label: "Accountant", detail: "Financial records you have been given" },
  admin: { label: "StrataVerze Admin", detail: "Platform administration" },
};

/** Shown on the sign-in page to someone already signed in. */
export function ContinueAs({ email, portals }: { email: string; portals: string[] }) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold font-heading text-ink mb-1">You&apos;re signed in</h1>
        <p className="text-sm text-ink-muted break-words">as {email}. Choose where to go.</p>
      </div>
      <nav aria-label="Your portals" className="flex flex-col gap-2">
        {portals.map((key) => {
          const item = LABELS[key];
          if (!item) return null;
          return (
            <Link
              key={key}
              href={`/${key}`}
              className="rounded-[var(--radius-card)] border border-line px-4 py-3 hover:border-turquoise hover:bg-muted transition-colors"
            >
              <span className="block text-sm font-semibold text-ink">{item.label}</span>
              <span className="block text-xs text-ink-muted">{item.detail}</span>
            </Link>
          );
        })}
      </nav>
      <form action={signOutAction}>
        <button type="submit" className="w-full text-sm font-medium text-ink-muted hover:text-ink py-2">
          Sign in as someone else
        </button>
      </form>
    </div>
  );
}
