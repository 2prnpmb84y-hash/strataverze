"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { signOutEverywhereAction } from "@/lib/actions/sessions";

export function SignOutButton() {
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <button
      onClick={handleSignOut}
      className="inline-flex items-center justify-center rounded-[var(--radius-card)] border border-red-200 bg-white px-5 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-300 transition-colors"
    >
      Sign out
    </button>
  );
}

/** Ends every session of the account, on every device (security stage S5). */
export function SignOutEverywhereButton() {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="inline-flex items-center justify-center rounded-[var(--radius-card)] border border-line bg-white px-5 py-2.5 text-sm font-medium text-ink hover:bg-muted focus:outline-none focus:ring-2 focus:ring-turquoise transition-colors"
      >
        Sign out everywhere
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-line p-3">
      <p className="text-sm text-ink">This signs you out on every phone, tablet and computer, including this one.</p>
      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
      <div className="flex gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await signOutEverywhereAction();
              if (r?.error) setError(r.error);
            })
          }
          className="text-xs font-semibold text-white bg-red-600 rounded-full px-4 h-8 disabled:opacity-50"
        >
          {pending ? "Signing out…" : "Sign out everywhere"}
        </button>
        <button type="button" className="text-xs text-ink-muted" onClick={() => setConfirming(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}
