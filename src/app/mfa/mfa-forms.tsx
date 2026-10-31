"use client";

import { useState, useTransition } from "react";
import { confirmTotpEnrolmentAction, startTotpEnrolmentAction, verifyTotpAction } from "./actions";
import { PRIMARY_ACTION_CLASS, TEXT_LINK_CLASS } from "@/components/ui/action-styles";

const inputClass =
  "w-full rounded-[var(--radius-card)] border border-line bg-white px-3.5 py-2.5 text-lg tracking-[0.4em] text-center text-ink placeholder:text-ink-muted placeholder:tracking-normal focus:outline-none focus:ring-2 focus:ring-turquoise focus:border-transparent transition-shadow";
// White on turquoise was 1.88:1; see action-styles.ts (AR-037).
const buttonClass = `w-full ${PRIMARY_ACTION_CLASS}`;

function ErrorBox({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded-[var(--radius-card)] bg-red-50 border border-red-200 px-4 py-3">
      <p className="text-sm text-red-700">{message}</p>
    </div>
  );
}

function CodeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label htmlFor="code" className="block text-sm font-medium text-ink mb-1.5">
        6-digit code
      </label>
      <input
        id="code"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9 ]*"
        maxLength={7}
        required
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
        placeholder="123 456"
      />
    </div>
  );
}

/** Verify with an enrolled authenticator. */
export function VerifyForm({
  factors,
  next,
}: {
  factors: { id: string; name: string }[];
  next: string | null;
}) {
  const [factorId, setFactorId] = useState(factors[0]?.id ?? "");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setError(null);
          const r = await verifyTotpAction(factorId, code, next ?? undefined);
          if (r?.error) setError(r.error);
          else if (r?.navigate) window.location.assign(r.navigate);
        });
      }}
    >
      <ErrorBox message={error} />
      {factors.length > 1 && (
        <div>
          <label htmlFor="factor" className="block text-sm font-medium text-ink mb-1.5">
            Authenticator
          </label>
          <select
            id="factor"
            value={factorId}
            onChange={(e) => setFactorId(e.target.value)}
            className="w-full rounded-[var(--radius-card)] border border-line bg-white px-3.5 py-2.5 text-sm text-ink"
          >
            {factors.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <CodeInput value={code} onChange={setCode} />
      <button type="submit" disabled={pending} aria-busy={pending || undefined} className={buttonClass}>
        {pending ? "Checking…" : "Verify"}
      </button>
    </form>
  );
}

/** Enrol an authenticator app: show the QR code and secret, then confirm with a code. */
export function EnrolForm({ next }: { next: string | null }) {
  const [setup, setSetup] = useState<{ factorId: string; qrCode: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!setup) {
    return (
      <div className="flex flex-col gap-4">
        <ErrorBox message={error} />
        <p className="text-sm text-ink-muted">
          You need an authenticator app on your phone, such as Google Authenticator, Microsoft Authenticator or 1Password.
        </p>
        <button
          type="button"
          disabled={pending}
          aria-busy={pending || undefined}
          className={buttonClass}
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await startTotpEnrolmentAction();
              if (r.error || !r.factorId || !r.qrCode || !r.secret) {
                setError(r.error ?? "Could not start. Please try again.");
                return;
              }
              setSetup({ factorId: r.factorId, qrCode: r.qrCode, secret: r.secret });
            })
          }
        >
          {pending ? "Starting…" : "Set up authenticator"}
        </button>
      </div>
    );
  }

  const qrSrc = setup.qrCode.startsWith("data:")
    ? setup.qrCode
    : `data:image/svg+xml;utf-8,${encodeURIComponent(setup.qrCode)}`;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setError(null);
          const r = await confirmTotpEnrolmentAction(setup.factorId, code, next ?? undefined);
          if (r?.error) setError(r.error);
          else if (r?.navigate) window.location.assign(r.navigate);
        });
      }}
    >
      <ErrorBox message={error} />
      <ol className="text-sm text-ink list-decimal pl-5 flex flex-col gap-1">
        <li>Open your authenticator app and add a new account.</li>
        <li>Scan this QR code.</li>
        <li>Enter the 6-digit code the app shows.</li>
      </ol>
      {/* eslint-disable-next-line @next/next/no-img-element -- a data URL from Supabase, not an optimisable image */}
      <img src={qrSrc} alt="QR code for your authenticator app" className="mx-auto h-48 w-48 bg-white" />
      <div className="text-xs text-ink-muted">
        Can&apos;t scan it?{" "}
        <button type="button" className={TEXT_LINK_CLASS} onClick={() => setShowSecret((v) => !v)}>
          {showSecret ? "Hide the setup key" : "Enter a setup key instead"}
        </button>
        {showSecret && (
          <p className="mt-2 break-all font-mono text-ink select-all" aria-label="Setup key">
            {setup.secret}
          </p>
        )}
      </div>
      <CodeInput value={code} onChange={setCode} />
      <button type="submit" disabled={pending} aria-busy={pending || undefined} className={buttonClass}>
        {pending ? "Checking…" : "Confirm and continue"}
      </button>
    </form>
  );
}
