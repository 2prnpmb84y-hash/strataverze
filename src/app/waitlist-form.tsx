"use client";

import { useState, useTransition } from "react";
import { joinWaitlistAction } from "./actions";

export function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{
    success?: boolean;
    message?: string;
    error?: string;
  } | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);

    startTransition(async () => {
      const res = await joinWaitlistAction(email);
      setResult(res);
      if (res.success) {
        setEmail("");
      }
    });
  }

  if (result?.success) {
    return (
      <div className="flex flex-col items-center gap-3">
        <div className="flex items-center gap-2 rounded-full bg-white/20 backdrop-blur-sm px-6 py-3">
          <svg
            className="w-5 h-5 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m4.5 12.75 6 6 9-13.5"
            />
          </svg>
          <span className="text-white font-semibold text-sm">
            {result.message}
          </span>
        </div>
        <p className="text-white/60 text-sm">
          We will be in touch when early access opens.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col items-center gap-4">
      <div className="flex items-center gap-3 w-full max-w-md">
        <input
          type="email"
          name="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="h-12 flex-1 rounded-lg bg-white/15 backdrop-blur-sm border border-white/20 px-4 text-white text-sm placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-white/40"
        />
        <button
          type="submit"
          disabled={isPending}
          className="h-12 rounded-lg bg-coral px-8 text-white font-semibold text-sm transition-colors hover:opacity-90 whitespace-nowrap disabled:opacity-50"
        >
          {isPending ? "Joining..." : "Get Early Access"}
        </button>
      </div>

      {result?.error && (
        <p className="text-sm text-red-200">{result.error}</p>
      )}
    </form>
  );
}
