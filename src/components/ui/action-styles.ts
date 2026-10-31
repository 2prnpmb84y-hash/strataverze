/**
 * Button styles for the sign-in pages and the app-wide error pages (AR-037).
 *
 * The sign-in button used to combine `text-white` with `text-turquoise
 * bg-white`; Tailwind emits `.text-white` after `.text-turquoise`, so the
 * label was white on white. White on the brand turquoise is no better
 * (1.88:1). These pairs are taken from the tokens in globals.css and pass
 * WCAG 2.1 AA for text (4.5:1) in every state:
 *
 * Primary (filled brand button)
 * - default, focus and pending: ink #1A202C on turquoise #00D4BF, 8.68:1
 * - hover: ink on mint #76E1CE, 10.44:1
 * - disabled: ink-muted #64748B on muted #F8FAFB, 4.55:1
 *
 * Secondary (outlined): ink on white 16.32:1, on muted (hover) 15.59:1.
 * Quiet (text button): ink-muted on white 4.76:1, ink on white (hover) 16.32:1.
 * Text link: ink on white 16.32:1, with a turquoise underline for the brand
 * (turquoise text on white is 1.88:1, so it is not used for words).
 *
 * Focus rings are ink, so the ring is visible against white and turquoise.
 * A pending button is disabled and carries aria-busy="true", which keeps
 * the brand colours (aria-busy is emitted after disabled, so it wins).
 *
 * src/app/auth-form-contrast.test.tsx checks every auth form button against
 * these rules.
 */

const FOCUS =
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2";

/** The one main action on a page: Sign in, Create account, Send reset link. */
export const PRIMARY_ACTION_CLASS =
  `inline-flex items-center justify-center h-11 px-6 rounded-full border-[1.5px] border-turquoise bg-turquoise text-ink font-semibold text-sm uppercase tracking-[0.04em] transition-colors hover:border-mint hover:bg-mint ${FOCUS} disabled:cursor-not-allowed disabled:border-line disabled:bg-muted disabled:text-ink-muted aria-busy:cursor-wait aria-busy:border-turquoise aria-busy:bg-turquoise aria-busy:text-ink`;

/** A second, outlined action: Back to sign in, Sign in on an error page. */
export const SECONDARY_ACTION_CLASS =
  `inline-flex items-center justify-center h-11 px-6 rounded-full border-[1.5px] border-line bg-white text-ink font-semibold text-sm uppercase tracking-[0.04em] transition-colors hover:bg-muted ${FOCUS} disabled:cursor-not-allowed disabled:text-ink-muted`;

/** A quiet text action, such as switching to the sign-up form. */
export const QUIET_ACTION_CLASS =
  `rounded-sm font-semibold text-sm text-ink-muted underline underline-offset-4 transition-colors hover:text-ink ${FOCUS}`;

/** An inline text link on the sign-in pages, such as Forgot password? */
export const TEXT_LINK_CLASS =
  `rounded-sm font-medium text-ink underline decoration-turquoise decoration-2 underline-offset-4 transition-colors hover:decoration-ink ${FOCUS}`;
