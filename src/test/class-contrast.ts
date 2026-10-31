import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Checks the colours on a control (AR-037): no state may carry two text
 * colours or two backgrounds at once (the sign-in button had `text-white`
 * and `text-turquoise`, and Tailwind's order made it white on white), and
 * the text must reach WCAG 2.1 AA (4.5:1) against its background in every
 * state. Colours come from the tokens in globals.css.
 *
 * The checker fails rather than guesses:
 * - an inline `style` colour or background on a control is a failure (the
 *   old Forgot password? link was `style={{ color: ACCENT }}`, turquoise on
 *   white, 1.88:1, and a class-only check never saw it);
 * - a control with no text colour of its own takes it from its nearest
 *   ancestor with a `text-*` colour class, else the page's ink;
 * - a colour class under a variant it does not know (`disabled:hover:`,
 *   `group-hover:`, `dark:`) is a failure, not skipped.
 *
 * inputFocusProblems checks an input's focus indicator against WCAG 2.1
 * 1.4.11 (non-text contrast, 3:1).
 */

const TOKENS: Record<string, string> = (() => {
  const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
  const map: Record<string, string> = { white: "#FFFFFF", black: "#000000" };
  for (const m of css.matchAll(/--color-([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) map[m[1]] = m[2].toUpperCase();
  return map;
})();

/** The body's text colour (globals.css: body { color: var(--color-foreground) }). */
const PAGE_TEXT = "foreground";

const NOT_COLOUR = /^(xs|sm|base|lg|[2-9]?xl|left|right|center|justify|start|end|wrap|nowrap|balance|pretty|clip|ellipsis|\[\d+(\.\d+)?(px|rem|em)\])$/;
const NOT_BG_COLOUR = /^(none|cover|contain|auto|fixed|local|scroll|center|top|bottom|left|right|repeat(-.*)?|no-repeat|clip-.*|origin-.*|blend-.*)$/;
const NOT_BORDER_COLOUR = /^(\d+|[xytrblse]|[xytrblse]-\d+|[xytrblse]-\[.*\]|\[\d+(\.\d+)?px\]|solid|dashed|dotted|double|hidden|none|collapse|separate|spacing-.*)$/;

type Rgb = [number, number, number];
const rgb = (hex: string): Rgb => {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
};
const blend = (top: Rgb, under: Rgb, alpha: number): Rgb =>
  top.map((v, i) => v * alpha + under[i] * (1 - alpha)) as Rgb;
const luminance = (c: Rgb) =>
  c
    .map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    })
    .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
export const contrast = (a: Rgb, b: Rgb) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

type Colour = { hex: string; alpha: number };
function colourOf(value: string): Colour | "unknown" {
  const [name, alphaPart] = value.split("/");
  if (name === "transparent") return { hex: "#000000", alpha: 0 };
  const arbitrary = /^\[(#[0-9a-fA-F]{6})\]$/.exec(name);
  const hex = arbitrary ? arbitrary[1].toUpperCase() : TOKENS[name];
  if (!hex) return "unknown";
  const alpha = alphaPart ? Number(alphaPart) / 100 : 1;
  return { hex, alpha };
}

/**
 * The variants the checker understands, in the order Tailwind 4 emits them
 * (checked against the compiled CSS), so a later one wins when several
 * apply. Anything else on a colour class is reported, not ignored.
 */
const VARIANTS = ["", "hover", "focus", "focus-visible", "active", "disabled", "aria-busy", "aria-disabled"] as const;
type Variant = (typeof VARIANTS)[number];
const isVariant = (v: string): v is Variant => (VARIANTS as readonly string[]).includes(v);

/** Splits `a:b:[x:y]:util` at the colons outside brackets. */
function splitClass(cls: string): { variant: string; utility: string } {
  let depth = 0;
  let at = -1;
  for (let i = 0; i < cls.length; i++) {
    const ch = cls[i];
    if (ch === "[" || ch === "(") depth++;
    else if (ch === "]" || ch === ")") depth--;
    else if (ch === ":" && depth === 0) at = i;
  }
  const utility = (at === -1 ? cls : cls.slice(at + 1)).replace(/^!|!$/g, "");
  return { variant: at === -1 ? "" : cls.slice(0, at), utility };
}

type Slot = { text: string[]; bg: string[]; opacity: number | null; ringWidth: number | null; ring: string[]; border: string[]; outlineNone: boolean | null };
type Parsed = Partial<Record<Variant, Slot>>;

type Kind = "text" | "bg" | "opacity" | "ringWidth" | "ring" | "border" | "outline";
const TEXT_KINDS: ReadonlySet<Kind> = new Set(["text", "bg", "opacity"]);
const FOCUS_KINDS: ReadonlySet<Kind> = new Set(["ringWidth", "ring", "border", "outline"]);
const emptySlot = (): Slot => ({ text: [], bg: [], opacity: null, ringWidth: null, ring: [], border: [], outlineNone: null });

/**
 * Groups the classes of the given kinds by variant, and lists what it
 * cannot read (an unknown variant or colour on one of those classes).
 */
function parse(className: string, kinds: ReadonlySet<Kind>): { byVariant: Parsed; problems: string[] } {
  const byVariant: Parsed = {};
  const problems: string[] = [];
  for (const cls of className.split(/\s+/).filter(Boolean)) {
    const { variant, utility } = splitClass(cls);
    const text = /^text-(.+)$/.exec(utility);
    const bg = /^bg-(.+)$/.exec(utility);
    const opacity = /^opacity-(\d+)$/.exec(utility);
    const ringWidth = /^ring(?:-(\d+)|-\[(\d+(?:\.\d+)?)px\])?$/.exec(utility);
    const ring = /^ring-(?!offset-|inset$)(.+)$/.exec(utility);
    const border = /^border-(.+)$/.exec(utility);
    const outline = /^outline-(none|hidden)$/.exec(utility);

    const colour =
      text && !NOT_COLOUR.test(text[1]) ? { kind: "text" as const, value: text[1] }
      : bg && !NOT_BG_COLOUR.test(bg[1]) ? { kind: "bg" as const, value: bg[1] }
      : ringWidth ? null
      : ring ? { kind: "ring" as const, value: ring[1] }
      : border && !NOT_BORDER_COLOUR.test(border[1]) ? { kind: "border" as const, value: border[1] }
      : null;
    const kind: Kind | null = colour ? colour.kind : opacity ? "opacity" : ringWidth ? "ringWidth" : outline ? "outline" : null;
    if (!kind || !kinds.has(kind)) continue;
    if (!isVariant(variant)) {
      problems.push(`unknown variant "${variant}:" in ${cls}: the checker cannot tell when it applies`);
      continue;
    }
    const slot = (byVariant[variant] ??= emptySlot());
    if (colour) {
      if (colourOf(colour.value) === "unknown" && colour.value !== "current") {
        problems.push(`unknown colour ${cls}: use a token from globals.css`);
        continue;
      }
      slot[colour.kind].push(colour.value);
    } else if (opacity) {
      slot.opacity = Number(opacity[1]) / 100;
    } else if (ringWidth) {
      slot.ringWidth = ringWidth[1] !== undefined ? Number(ringWidth[1]) : ringWidth[2] !== undefined ? Number(ringWidth[2]) : 1;
    } else if (outline) {
      slot.outlineNone = true;
    }
  }
  return { byVariant, problems };
}

/** Inline style colours on an element: always a failure on a checked control. */
function inlineColourProblems(el: Element, who = "inline style"): string[] {
  const style = (el as HTMLElement).style;
  if (!style) return [];
  const found: string[] = [];
  for (let i = 0; i < style.length; i++) {
    const prop = style[i];
    if (/color|background|^fill$|^stroke$/.test(prop)) found.push(`${prop}: ${style.getPropertyValue(prop)}`);
  }
  return found.length ? [`${who} sets a colour (${found.join("; ")}): use the token classes in action-styles.ts`] : [];
}

/** The last base (no variant) colour class of a kind, ignoring everything else. */
const baseColour = (className: string, kind: "text" | "bg") =>
  className
    .split(/\s+/)
    .map((cls) => new RegExp(`^${kind}-(.+)$`).exec(cls)?.[1])
    .filter((v): v is string => !!v && !(kind === "text" ? NOT_COLOUR : NOT_BG_COLOUR).test(v))
    .at(-1);

/**
 * The text colour class a control inherits: its nearest ancestor's base
 * `text-*` colour, or the page's ink. An ancestor's inline colour is a
 * failure too.
 */
function inheritedText(el: Element): { cls: string; problems: string[] } {
  for (let up = el.parentElement; up; up = up.parentElement) {
    const inline = inlineColourProblems(up, `ancestor <${up.tagName.toLowerCase()}> inline style`);
    if (inline.length) return { cls: `text-${PAGE_TEXT}`, problems: inline };
    const text = baseColour(up.getAttribute("class") ?? "", "text");
    if (text) return { cls: `text-${text}`, problems: [] };
  }
  return { cls: `text-${PAGE_TEXT}`, problems: [] };
}

export type ClassProblem = string;

/** Every set of states a control can be in at once (focus-visible needs focus). */
const STATES: Variant[][] = (() => {
  const interactive = VARIANTS.slice(1);
  const states: Variant[][] = [];
  for (let mask = 0; mask < 1 << interactive.length; mask++) {
    const on = interactive.filter((_, i) => mask & (1 << i));
    if (on.includes("focus-visible") && !on.includes("focus")) continue;
    states.push(["", ...on]);
  }
  return states.sort((a, b) => a.length - b.length);
})();

/**
 * Problems with one control's classes, empty when it is fine. `surface` is
 * the colour behind the control (the white card on the sign-in pages). A
 * class list with no text colour is read as the page's ink; use
 * elementContrastProblems for a rendered control, which looks up the
 * nearest ancestor's text colour.
 */
export function classContrastProblems(className: string, surface = "#FFFFFF"): ClassProblem[] {
  const { byVariant, problems } = parse(className, TEXT_KINDS);
  if (problems.length) return problems;
  for (const [variant, slot] of Object.entries(byVariant)) {
    const where = variant || "base";
    if (new Set(slot.text).size > 1) problems.push(`${where}: conflicting text colours ${slot.text.map((t) => `text-${t}`).join(" + ")}`);
    if (new Set(slot.bg).size > 1) problems.push(`${where}: conflicting backgrounds ${slot.bg.map((b) => `bg-${b}`).join(" + ")}`);
  }
  if (!byVariant[""]?.text.length) (byVariant[""] ??= emptySlot()).text.push(PAGE_TEXT);

  const seen = new Set<string>();
  for (const variants of STATES) {
    let text: string | undefined;
    let bg: string | undefined;
    let opacity = 1;
    for (const v of variants) {
      const slot = byVariant[v];
      if (!slot) continue;
      text = slot.text.at(-1) ?? text;
      bg = slot.bg.at(-1) ?? bg;
      if (slot.opacity !== null) opacity = slot.opacity;
    }
    const key = `${text}|${bg}|${opacity}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const under = rgb(surface);
    const bgColour = bg ? (colourOf(bg) as Colour) : { hex: surface, alpha: 1 };
    let bgRgb = blend(rgb(bgColour.hex), under, bgColour.alpha);
    const textColour = colourOf(text!) as Colour;
    let textRgb = blend(rgb(textColour.hex), bgRgb, textColour.alpha);
    if (opacity < 1) {
      bgRgb = blend(bgRgb, under, opacity);
      textRgb = blend(textRgb, under, opacity);
    }
    const ratio = contrast(textRgb, bgRgb);
    const state = variants.slice(1).join(" + ") || "default";
    if (ratio < 4.5) problems.push(`${state}: text-${text} on ${bg ? `bg-${bg}` : surface} is ${ratio.toFixed(2)}:1, under 4.5:1`);
  }
  return problems;
}

/**
 * Problems with a rendered button or link: inline colours, and its classes
 * with the text colour it inherits when it has none of its own.
 */
export function elementContrastProblems(el: Element, surface = "#FFFFFF"): ClassProblem[] {
  const problems = inlineColourProblems(el);
  let className = el.getAttribute("class") ?? "";
  if (!baseColour(className, "text")) {
    const inherited = inheritedText(el);
    problems.push(...inherited.problems);
    className = `${inherited.cls} ${className}`;
  }
  return [...problems, ...classContrastProblems(className, surface)];
}

/**
 * Problems with an input's focus indicator (WCAG 2.1 1.4.11, 3:1). When
 * focused, the input must keep a visible border, and its ring (or, with no
 * ring, its border) must reach 3:1 against the surface and the field.
 * A ring with no colour class is the text colour (Tailwind 4 rings default
 * to currentColor).
 */
export function inputFocusProblems(el: Element, surface = "#FFFFFF"): ClassProblem[] {
  const problems = inlineColourProblems(el);
  const className = el.getAttribute("class") ?? "";
  const { byVariant, problems: unreadable } = parse(className, FOCUS_KINDS);
  problems.push(...unreadable);
  if (problems.length) return problems;
  const text = baseColour(className, "text") ?? PAGE_TEXT;
  const bg = baseColour(className, "bg");

  const focused: Variant[] = ["", "focus", "focus-visible"];
  let ringWidth = 0;
  let ring: string | undefined;
  let border: string | undefined;
  let restingBorder: string | undefined;
  let outlineNone = false;
  for (const v of focused) {
    const slot = byVariant[v];
    if (!slot) continue;
    if (slot.ringWidth !== null) ringWidth = slot.ringWidth;
    ring = slot.ring.at(-1) ?? ring;
    border = slot.border.at(-1) ?? border;
    if (slot.outlineNone) outlineNone = true;
    if (v === "") restingBorder = border;
  }
  for (const c of [text, bg, ring === "current" ? undefined : ring, border]) {
    if (c && colourOf(c) === "unknown") problems.push(`unknown colour ${c}: use a token from globals.css`);
  }
  if (problems.length) return problems;
  const under = rgb(surface);
  const fieldColour = bg ? (colourOf(bg) as Colour) : null;
  const field = fieldColour ? blend(rgb(fieldColour.hex), under, fieldColour.alpha) : under;
  const resolve = (c: string) => colourOf(c === "current" ? text : c) as Colour;
  const ratioOf = (c: string) => {
    const colour = resolve(c);
    return Math.min(contrast(blend(rgb(colour.hex), under, colour.alpha), under), contrast(blend(rgb(colour.hex), field, colour.alpha), field));
  };

  if (border && resolve(border).alpha === 0) {
    problems.push(`focus: the border becomes border-${border}; keep a visible border`);
  }
  if (ringWidth > 0) {
    const colour = ring ?? "current";
    const ratio = ratioOf(colour);
    if (ratio < 3) problems.push(`focus: ring-${colour} is ${ratio.toFixed(2)}:1 against ${surface}, under 3:1 (WCAG 1.4.11)`);
  } else if (outlineNone) {
    if (!border || border === restingBorder) problems.push("focus: no visible focus indicator (outline removed, no ring, border unchanged)");
    else {
      const ratio = ratioOf(border);
      if (ratio < 3) problems.push(`focus: border-${border} is ${ratio.toFixed(2)}:1 against ${surface}, under 3:1 (WCAG 1.4.11)`);
    }
  }
  return problems;
}
