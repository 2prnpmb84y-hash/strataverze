import { siteUrl } from "@/lib/site-url";

/**
 * Safe email HTML (security stage S7, finding SEC-019).
 *
 * Email text comes from people: building names, announcement titles and
 * bodies, meeting locations, owners' names. Put into HTML as it is, a title
 * such as `<a href="https://evil.example">Pay here</a>` would arrive from
 * StrataVerze's own sending address as a working link.
 *
 * `html` is a tagged template that escapes every value it is given, unless
 * the value is itself `SafeHtml` (made by `html`, or by `trustedHtml` for
 * fixed text written in this code base). Links go through `safeHref`, which
 * only allows links to the app itself.
 */

export class SafeHtml {
  constructor(readonly value: string) {}
  toString(): string {
    return this.value;
  }
}

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
  "`": "&#96;",
};

/** Escape text for use in HTML content or a quoted attribute. */
export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"'`]/g, (c) => ESCAPES[c]);
}

type Value = SafeHtml | string | number | boolean | null | undefined | readonly Value[];

function render(value: Value): string {
  if (value === null || value === undefined || value === false || value === true) return "";
  if (value instanceof SafeHtml) return value.value;
  if (Array.isArray(value)) return value.map((v) => render(v)).join("");
  return escapeHtml(value);
}

/** Build HTML, escaping every interpolated value that is not SafeHtml. */
export function html(strings: TemplateStringsArray, ...values: Value[]): SafeHtml {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += render(values[i]) + strings[i + 1];
  return new SafeHtml(out);
}

/** Fixed HTML written in this code base (never text from a person). */
export function trustedHtml(fixed: string): SafeHtml {
  return new SafeHtml(fixed);
}

/**
 * A link target that is safe to put in an email: an address on the app
 * itself. Anything else (another site, `javascript:`, a relative path that
 * could be misread) becomes the app's home page.
 */
export function safeHref(href: string, base: string = siteUrl()): string {
  try {
    const app = new URL(base);
    const url = new URL(href);
    if (url.origin === app.origin && (url.protocol === "https:" || url.hostname === "localhost")) return url.toString();
  } catch {
    // fall through
  }
  return `${base}/`;
}

/**
 * A subject line: plain text on one line. Line breaks and control
 * characters are removed, and it is cut to a sensible length.
 */
export function plainSubject(subject: string): string {
  return String(subject ?? "")
    .replace(/[\u0000-\u001F\u007F]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}
