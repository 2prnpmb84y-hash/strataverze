"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resetUserMfaAction } from "@/lib/actions/admin-mfa";

/** Reset a user's authenticators after verifying their identity out of band. */
export function ResetMfaForm({ profileId, name }: { profileId: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "ok"; text: string } | null>(null);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <button type="button" className="text-xs font-medium text-red-600 hover:text-red-700" onClick={() => setOpen(true)}>
        Reset authenticator
      </button>
    );
  }

  return (
    <form
      className="mt-3 flex flex-col gap-2 rounded-[var(--radius-card)] border border-line p-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setMessage(null);
          const r = await resetUserMfaAction(profileId, reason);
          if (r.error) setMessage({ kind: "error", text: r.error });
          else {
            setMessage({ kind: "ok", text: `Removed ${r.removed ?? 0} authenticator(s). ${name} has been signed out and will set up a new one at next sign-in.` });
            router.refresh();
          }
        });
      }}
    >
      <label htmlFor={`reason-${profileId}`} className="text-xs font-medium text-ink">
        How did you verify this is {name}? (call-back number, email confirmation)
      </label>
      <textarea
        id={`reason-${profileId}`}
        required
        minLength={10}
        maxLength={1000}
        rows={3}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="w-full rounded-[var(--radius-card)] border border-line bg-white px-3 py-2 text-sm text-ink"
      />
      <label className="flex items-start gap-2 text-xs text-ink">
        <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5" />
        I confirmed their identity on a phone number or email address already on record, not one they gave me now.
      </label>
      {message && (
        <p role="status" className={`text-xs ${message.kind === "error" ? "text-red-600" : "text-ink"}`}>
          {message.text}
          {message.kind === "error" && /confirm it is you/i.test(message.text) && (
            <>
              {" "}
              <a href="/mfa?next=/admin/security" className="text-turquoise font-medium">
                Enter a code now
              </a>
            </>
          )}
        </p>
      )}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={pending || !confirmed || reason.trim().length < 10}
          className="text-xs font-semibold text-white bg-red-600 rounded-full px-4 h-8 disabled:opacity-50"
        >
          {pending ? "Resetting…" : "Reset"}
        </button>
        <button type="button" className="text-xs text-ink-muted" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
