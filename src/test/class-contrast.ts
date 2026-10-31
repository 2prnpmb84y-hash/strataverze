import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Checks the Tailwind colour classes on a control (AR-037): no state may
 * carry two text colours or two backgrounds at once (the sign-in button had
 * `text-white` and `text-turquoise`, and Tailwind's order made it white on
 * white), and the text must reach WCAG 2.1 AA (4.5:1) against its
 * background in every state. Colours come from the tokens in globals.css.
 */

const TOKENS: Record<string, string> = (() => {
  const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
  const map: Record<string, string> = { white: "#FFFFFF", black: "#000000" };
  for (const m of css.matchAll(/--color-([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) map[m[1]] = m[2].toUpperCase();
  return map;
})();

const NOT_COLOUR = /^(xs|sm|base|lg|[2-9]?xl|left|right|center|justify|start|end|wrap|nowrap|balance|pretty|clip|ellipsis|\[\d+(\.\d+)?(px|rem|em)\])$/;

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
function colourOf(value: string): Colour | "unknown" | null {
  const [name, alphaPart] = value.split("/");
  const arbitrary = /^\[(#[0-9a-fA-F]{6})\]$/.exec(name);
  const hex = arbitrary ? arbitrary[1].toUpperCase() : TOKENS[name];
  if (!hex) return "unknown";
  const alpha = alphaPart ? Number(alphaPart) / 100 : 1;
  return { hex, alpha };
}

type Parsed = Record<string, { text: string[]; bg: string[]; opacity: number | null }>;

/** Groups a class list by variant ("" for none; "hover", "disabled", ...). */
function parse(className: string): { byVariant: Parsed; unknown: string[] } {
  const byVariant: Parsed = {};
  const unknown: string[] = [];
  for (const cls of className.split(/\s+/).filter(Boolean)) {
    const at = cls.lastIndexOf(":");
    const variant = at === -1 ? "" : cls.slice(0, at);
    const utility = at === -1 ? cls : cls.slice(at + 1);
    const slot = (byVariant[variant] ??= { text: [], bg: [], opacity: null });
    const text = /^text-(.+)$/.exec(utility);
    const bg = /^bg-(.+)$/.exec(utility);
    const opacity = /^opacity-(\d+)$/.exec(utility);
    if (text && !NOT_COLOUR.test(text[1])) {
      slot.text.push(text[1]);
      if (colourOf(text[1]) === "unknown") unknown.push(cls);
    } else if (bg) {
      slot.bg.push(bg[1]);
      if (colourOf(bg[1]) === "unknown") unknown.push(cls);
    } else if (opacity) {
      slot.opacity = Number(opacity[1]) / 100;
    }
  }
  return { byVariant, unknown };
}

/** Variants in the order Tailwind emits them, so a later one wins. */
const STATES: Record<string, string[]> = {
  default: [""],
  hover: ["", "hover"],
  focus: ["", "focus", "focus-visible"],
  disabled: ["", "disabled"],
  "disabled and hovered": ["", "hover", "disabled"],
  pending: ["", "disabled", "aria-busy"],
};

export type ClassProblem = string;

/**
 * Problems with one control's classes, empty when it is fine. `surface` is
 * the colour behind the control (the white card on the sign-in pages).
 */
export function classContrastProblems(className: string, surface = "#FFFFFF"): ClassProblem[] {
  const problems: ClassProblem[] = [];
  const { byVariant, unknown } = parse(className);
  for (const cls of unknown) problems.push(`unknown colour ${cls}: use a token from globals.css`);
  for (const [variant, slot] of Object.entries(byVariant)) {
    const where = variant || "base";
    if (new Set(slot.text).size > 1) problems.push(`${where}: conflicting text colours ${slot.text.map((t) => `text-${t}`).join(" + ")}`);
    if (new Set(slot.bg).size > 1) problems.push(`${where}: conflicting backgrounds ${slot.bg.map((b) => `bg-${b}`).join(" + ")}`);
  }
  if (unknown.length) return problems;
  // A control with no text colour of its own inherits the page's ink.
  if (!byVariant[""]?.text.length) return problems;

  for (const [state, variants] of Object.entries(STATES)) {
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
    if (ratio < 4.5) problems.push(`${state}: text-${text} on ${bg ? `bg-${bg}` : surface} is ${ratio.toFixed(2)}:1, under 4.5:1`);
  }
  return problems;
}
