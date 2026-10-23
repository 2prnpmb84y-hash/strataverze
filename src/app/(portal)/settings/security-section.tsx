"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { removeTotpFactorAction } from "@/app/mfa/actions";

type Factor = { id: string; name: string; createdAt: string };

/** Two-step sign-in: list authenticators, add a second, remove one. */
export function SecuritySection({
  factors,
  mandatory,
  maxFactors,
}: {
  factors: Factor[];
  mandatory: boolean;
  maxFactors: number;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-ink-muted">
        {factors.length === 0
          ? "Two-step sign-in is off. Turn it on to protect your account with an authenticator app as well as your password."
          : mandatory
            ? "Two-step sign-in is on and required for your role."
            : "Two-step sign-in is on."}
      </p>
      {error && (
        <div role="alert" className="rounded-[var(--radius-card)] bg-red-50 border border-red-200 px-4 py-3">
          <p className="text-sm text-red-700">{error}</p>
          {/fresh|confirm it is you/i.test(error) && (
            <a href="/mfa?next=/settings" className="text-sm font-medium text-turquoise mt-1 inline-block">
              Enter a code now
            </a>
          )}
        </div>
      )}
      {factors.length > 0 && (
        <ul className="divide-y divide-line">
          {factors.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink truncate">{f.name}</p>
                <p className="text-xs text-ink-muted">
                  Added {new Date(f.createdAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
                </p>
              </div>
              <button
                type="button"
                disabled={pending}
                className="text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
                onClick={() =>
                  start(async () => {
                    setError(null);
                    const r = await removeTotpFactorAction(f.id);
                    if (r.error) setError(r.error);
                    else router.refresh();
                  })
                }
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      {factors.length < maxFactors && (
        <a
          href="/mfa/setup?next=/settings"
          className="inline-flex w-fit items-center justify-center rounded-full px-6 h-10 text-[13px] font-semibold uppercase tracking-[0.04em] bg-white border-[1.5px] border-turquoise text-turquoise hover:bg-turquoise/5"
        >
          {factors.length === 0 ? "Turn on two-step sign-in" : "Add a second authenticator"}
        </a>
      )}
      {factors.length === 1 && (
        <p className="text-xs text-ink-muted">
          A second authenticator (on another phone, or a password manager) lets you sign in if you lose this one.
        </p>
      )}
    </div>
  );
}
