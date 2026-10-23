"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminSignOutUserAction } from "@/lib/actions/sessions";

/** End every session of a user (a lost device, or a suspected compromise). */
export function SignOutUserForm({ profileId, name }: { profileId: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<{ kind: "error" | "ok"; text: string } | null>(null);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <button type="button" className="text-xs font-medium text-ink-muted hover:text-ink" onClick={() => setOpen(true)}>
        Sign out everywhere
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
          const r = await adminSignOutUserAction(profileId, reason);
          if (r.error) setMessage({ kind: "error", text: r.error });
          else {
            setMessage({ kind: "ok", text: `${name} has been signed out on every device.` });
            router.refresh();
          }
        });
      }}
    >
      <label htmlFor={`signout-${profileId}`} className="text-xs font-medium text-ink">
        Why are you signing {name} out everywhere?
      </label>
      <textarea
        id={`signout-${profileId}`}
        required
        minLength={10}
        maxLength={1000}
        rows={2}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="w-full rounded-[var(--radius-card)] border border-line bg-white px-3 py-2 text-sm text-ink"
      />
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
          disabled={pending || reason.trim().length < 10}
          className="text-xs font-semibold text-white bg-red-600 rounded-full px-4 h-8 disabled:opacity-50"
        >
          {pending ? "Signing out…" : "Sign out everywhere"}
        </button>
        <button type="button" className="text-xs text-ink-muted" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
