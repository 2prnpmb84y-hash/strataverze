"use client";

import { useActionState, useEffect, useState } from "react";
import { Turnstile } from "@/components/auth/turnstile";
import { PasswordStrength } from "@/components/ui/password-strength";
import {
  acceptJoinAction,
  completeJoinAction,
  lookupJoinLinkAction,
  type JoinDetails,
  type JoinFormState,
  type JoinView,
} from "./actions";

const INPUT =
  "w-full rounded-[var(--radius-card)] border border-line bg-white px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-turquoise focus:border-transparent transition-shadow";
const BUTTON =
  "w-full h-11 rounded-full bg-turquoise text-white font-semibold text-sm uppercase tracking-[0.04em] transition-colors hover:bg-turquoise/90 focus:outline-none focus:ring-2 focus:ring-turquoise focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed";

const STORE = "sv_join_link";

/**
 * The token from the address's fragment, removed from the address bar and
 * history once read. Kept for this tab only (sessionStorage), so a reload
 * still works; it is never sent anywhere but the server actions.
 */
function takeToken(): string {
  const fromHash = window.location.hash.replace(/^#/, "");
  if (fromHash) {
    window.history.replaceState(null, "", window.location.pathname);
    rememberToken(fromHash);
    return fromHash;
  }
  try {
    return window.sessionStorage.getItem(STORE) ?? "";
  } catch {
    return "";
  }
}

function rememberToken(token: string) {
  try {
    if (token) window.sessionStorage.setItem(STORE, token);
  } catch {
    // Storage blocked: the page still works until it is reloaded.
  }
}

/**
 * Forget the token (review finding L5): once the link has been used, is
 * known not to work, or the page hands over to the sign-in page, nothing in
 * this tab should still hold it.
 */
function forgetToken() {
  try {
    window.sessionStorage.removeItem(STORE);
  } catch {
    // Storage blocked: nothing was kept.
  }
}

/**
 * The /join page (S2a). What it shows comes from the server; the page
 * itself decides nothing. Opening it changes nothing: only submitting a
 * form uses the link.
 */
export function JoinFlow({ captchaSiteKey }: { captchaSiteKey: string | null }) {
  const [link, setLink] = useState<{ token: string; view: JoinView } | null>(null);

  useEffect(() => {
    const token = takeToken();
    let cancelled = false;
    lookupJoinLinkAction(token)
      .then((view) => {
        // A link that does not work is not kept. (One for an account that
        // signs in is forgotten when the page hands over to the sign-in page.)
        if (view.state === "invalid") forgetToken();
        if (!cancelled) setLink({ token, view });
      })
      .catch(() => {
        forgetToken();
        if (!cancelled) setLink({ token, view: { state: "invalid", message: "Something went wrong. Please open the link from your email again." } });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!link) {
    return <p className="text-sm text-ink-muted" role="status">Checking your invitation…</p>;
  }
  const { token, view } = link;

  if (view.state === "invalid") {
    return (
      <>
        <h1 className="text-xl font-bold font-heading text-ink mb-2">Invitation link</h1>
        <p className="text-sm text-ink" role="alert">{view.message}</p>
        <p className="mt-4 text-sm text-ink-muted">
          Already set up? <a className="text-turquoise underline" href="/login" onClick={forgetToken}>Sign in</a>
        </p>
      </>
    );
  }

  return (
    <>
      <h1 className="text-xl font-bold font-heading text-ink mb-1">You&apos;ve been invited</h1>
      <Summary details={view.details} />
      {view.state === "set-password" ? (
        <SetPasswordForm token={token} captchaSiteKey={captchaSiteKey} maskedEmail={view.details.maskedEmail} />
      ) : (
        <SignInToAccept token={token} signedIn={view.signedIn} />
      )}
    </>
  );
}

function Summary({ details }: { details: JoinDetails }) {
  return (
    <p className="text-sm text-ink-muted mb-6">
      Join <strong className="text-ink">{details.schemeName}</strong> as {/^[AEIOU]/.test(details.roleLabel) ? "an" : "a"}{" "}
      <strong className="text-ink">{details.roleLabel}</strong>
      {details.lotNumber ? <> for <strong className="text-ink">Lot {details.lotNumber}</strong></> : null}. The invitation
      expires on {details.expiresOn}.
    </p>
  );
}

/**
 * Keep the stored token in step with a form's answer. The token is
 * forgotten when the form is sent (a success redirects away, and nothing
 * comes back to forget it then), and kept again only if the answer leaves
 * the link usable (a weak password, say), so a reload still works.
 */
function useTokenAfterAnswer(token: string, state: JoinFormState) {
  useEffect(() => {
    if (!state.error && !state.fieldErrors) return;
    if (state.linkDone || state.signInInstead) {
      forgetToken();
      return;
    }
    rememberToken(token);
  }, [token, state]);
}

function Problem({ state }: { state: JoinFormState }) {
  if (!state.error) return null;
  return (
    <div role="alert" className="rounded-[var(--radius-card)] bg-red-50 border border-red-200 px-4 py-3 mb-4">
      <p className="text-sm text-red-700">{state.error}</p>
      {state.signInInstead && (
        <p className="text-sm mt-2">
          <a className="text-turquoise underline" href="/login?next=/invitations" onClick={forgetToken}>Sign in</a>
        </p>
      )}
    </div>
  );
}

function SetPasswordForm({ token, captchaSiteKey, maskedEmail }: { token: string; captchaSiteKey: string | null; maskedEmail: string }) {
  const [state, formAction, pending] = useActionState<JoinFormState, FormData>(completeJoinAction, {});
  const [password, setPassword] = useState("");
  useTokenAfterAnswer(token, state);
  return (
    <form action={formAction} onSubmit={forgetToken} className="flex flex-col gap-4">
      <Problem state={state} />
      <p className="text-sm text-ink">
        Choose a password for your new StrataVerze account ({maskedEmail}). You will sign in with your email address and
        this password.
      </p>
      <input type="hidden" name="token" value={token} />
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-ink mb-1.5">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          maxLength={72}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={!!state.fieldErrors?.password}
          aria-describedby={state.fieldErrors?.password ? "password-error" : undefined}
          className={INPUT}
        />
        {state.fieldErrors?.password && <p id="password-error" className="mt-1.5 text-xs text-red-500">{state.fieldErrors.password}</p>}
        <PasswordStrength password={password} />
      </div>
      <div>
        <label htmlFor="confirmPassword" className="block text-sm font-medium text-ink mb-1.5">Confirm password</label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          required
          autoComplete="new-password"
          aria-invalid={!!state.fieldErrors?.confirmPassword}
          aria-describedby={state.fieldErrors?.confirmPassword ? "confirm-error" : undefined}
          className={INPUT}
        />
        {state.fieldErrors?.confirmPassword && (
          <p id="confirm-error" className="mt-1.5 text-xs text-red-500">{state.fieldErrors.confirmPassword}</p>
        )}
      </div>
      <Turnstile siteKey={captchaSiteKey} />
      <button type="submit" disabled={pending} className={BUTTON}>
        {pending ? "Setting up…" : "Set password and accept"}
      </button>
    </form>
  );
}

function SignInToAccept({ token, signedIn }: { token: string; signedIn: "invitee" | "someone-else" | "nobody" }) {
  const [state, formAction, pending] = useActionState<JoinFormState, FormData>(acceptJoinAction, {});
  useTokenAfterAnswer(token, state);
  if (signedIn === "invitee") {
    return (
      <form action={formAction} onSubmit={forgetToken} className="flex flex-col gap-4">
        <Problem state={state} />
        <input type="hidden" name="token" value={token} />
        <button type="submit" disabled={pending} className={BUTTON}>
          {pending ? "Accepting…" : "Accept invitation"}
        </button>
      </form>
    );
  }
  return (
    <div className="flex flex-col gap-3 text-sm text-ink">
      {signedIn === "someone-else" ? (
        <p>
          You are signed in with a different email address. Sign out, then sign in with the address this invitation was
          sent to. It will be waiting under Invitations.
        </p>
      ) : (
        <p>
          Sign in with the address this invitation was sent to. It will be waiting under Invitations. If you have
          forgotten your password, you can reset it from the sign-in page.
        </p>
      )}
      <a className={`${BUTTON} inline-flex items-center justify-center`} href="/login?next=/invitations" onClick={forgetToken}>
        Sign in
      </a>
    </div>
  );
}
