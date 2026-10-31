/**
 * AR-037 and AR-042: every button and link on the sign-in pages has a
 * readable label (one text colour per state, 4.5:1 against its background
 * in every combination of the default, hover, focus, pressed, disabled and
 * pending states), every text field has a focus indicator of 3:1 (WCAG
 * 1.4.11), and no password field shows a row of dots as its placeholder.
 *
 * The sign-in button used to carry `text-white` and `text-turquoise` with
 * `bg-white`, and rendered white on white.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { classContrastProblems, elementContrastProblems, inputFocusProblems } from "@/test/class-contrast";
import { INPUT_FOCUS_CLASS, PRIMARY_ACTION_CLASS, QUIET_ACTION_CLASS, SECONDARY_ACTION_CLASS, TEXT_LINK_CLASS } from "@/components/ui/action-styles";

vi.mock("./login/actions", () => ({ login: vi.fn(), signup: vi.fn() }));
vi.mock("./forgot-password/actions", () => ({ resetPassword: vi.fn() }));
vi.mock("./mfa/actions", () => ({
  verifyTotpAction: vi.fn(),
  confirmTotpEnrolmentAction: vi.fn(),
  startTotpEnrolmentAction: vi.fn(async () => ({ factorId: "f1", qrCode: "data:image/png;base64,AA==", secret: "SECRET" })),
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      getSession: async () => ({ data: { session: null } }),
      updateUser: vi.fn(),
    },
  }),
}));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));

const { LoginForm } = await import("./login/login-form");
const { default: ForgotPasswordPage } = await import("./forgot-password/page");
const { default: ResetPasswordPage } = await import("./reset-password/page");
const { VerifyForm, EnrolForm } = await import("./mfa/mfa-forms");

afterEach(cleanup);

/**
 * A fixture: the Forgot password? link as it was before AR-037, turquoise
 * (#00D4BF) on white, 1.88:1, set in an inline style the old class-only
 * check never looked at.
 */
const ACCENT = "var(--color-turquoise)";
function OldForgotPasswordLink() {
  return (
    <div className="flex justify-end">
      <a href="/forgot-password" className="text-sm transition-colors" style={{ color: ACCENT }}>
        Forgot password?
      </a>
    </div>
  );
}

/** Every button and link on the page, with what is wrong with its classes. */
function problems(container: HTMLElement) {
  const controls = [...container.querySelectorAll<HTMLElement>("button, a")];
  expect(controls.length).toBeGreaterThan(0);
  return controls
    .map((el) => ({ control: `${el.tagName.toLowerCase()} "${el.textContent?.trim()}"`, problems: elementContrastProblems(el) }))
    .filter((c) => c.problems.length > 0);
}

/** Every visible text field on the page, with what is wrong with its focus indicator (WCAG 1.4.11). */
function inputProblems(container: HTMLElement) {
  const inputs = [...container.querySelectorAll<HTMLElement>('input:not([type="hidden"])')];
  expect(inputs.length).toBeGreaterThan(0);
  return inputs
    .map((el) => ({ input: el.id || el.getAttribute("name"), problems: inputFocusProblems(el) }))
    .filter((c) => c.problems.length > 0);
}

function passwordPlaceholders(container: HTMLElement) {
  return [...container.querySelectorAll<HTMLInputElement>('input[type="password"]')]
    .map((el) => el.getAttribute("placeholder"))
    .filter((p) => p !== null && p !== "Password");
}

describe("the checker", () => {
  it("catches the old sign-in button", () => {
    const old =
      "w-full h-11 rounded-full text-white font-semibold text-sm uppercase focus:ring-2 border-[1.5px] border-turquoise text-turquoise bg-white hover:bg-turquoise hover:text-white focus:ring-turquoise";
    const found = classContrastProblems(old);
    expect(found).toContain("base: conflicting text colours text-white + text-turquoise");
    expect(found.some((p) => p.startsWith("hover: text-white on bg-turquoise is 1.88:1"))).toBe(true);
  });

  it("catches white on turquoise and a faded disabled state", () => {
    expect(classContrastProblems("bg-turquoise text-white").length).toBeGreaterThan(0);
    expect(classContrastProblems("bg-ink text-white disabled:opacity-50").some((p) => p.startsWith("disabled:"))).toBe(true);
  });

  it("catches the old Forgot password? link: an inline turquoise colour and no text class", () => {
    const { container } = render(<OldForgotPasswordLink />);
    const link = screen.getByRole("link", { name: "Forgot password?" });
    // The class list alone looks harmless: no colour at all.
    expect(classContrastProblems(link.className)).toEqual([]);
    const found = elementContrastProblems(link);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatch(/^inline style sets a colour \(color: var\(--color-turquoise\)\)/);
    expect(problems(container)).toHaveLength(1);
  });

  it("takes the text colour of a control with none from its nearest ancestor", () => {
    render(
      <p className="text-ink">
        <span className="text-turquoise">
          <a href="/forgot-password" className="text-sm transition-colors">
            Forgot password?
          </a>
        </span>
      </p>,
    );
    const found = elementContrastProblems(screen.getByRole("link"));
    expect(found.some((p) => p.startsWith("default: text-turquoise on #FFFFFF is 1.88:1"))).toBe(true);
    cleanup();
    // An ancestor's inline colour is caught too.
    render(
      <p style={{ color: "var(--color-turquoise)" }}>
        <a href="/x">Link</a>
      </p>,
    );
    expect(elementContrastProblems(screen.getByRole("link"))[0]).toMatch(/^ancestor <p> inline style sets a colour/);
  });

  it("fails on a variant it does not understand instead of ignoring it", () => {
    for (const cls of ["disabled:hover:text-white", "group-hover:bg-turquoise", "dark:text-white", "md:hover:text-turquoise"]) {
      const found = classContrastProblems(`bg-white text-ink ${cls}`);
      expect(found, cls).toEqual([expect.stringContaining(`unknown variant "${cls.slice(0, cls.lastIndexOf(":"))}:" in ${cls}`)]);
    }
    // Variants on classes that are not colours do not matter.
    expect(classContrastProblems("bg-white text-ink md:px-6 group-hover:underline")).toEqual([]);
  });

  it("catches the old input focus: a turquoise ring (1.88:1) and a border that disappears", () => {
    const old = document.createElement("input");
    old.className =
      "w-full rounded-[var(--radius-card)] border border-line bg-white px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-turquoise focus:border-transparent transition-shadow";
    expect(inputFocusProblems(old)).toEqual([
      "focus: the border becomes border-transparent; keep a visible border",
      "focus: ring-turquoise is 1.88:1 against #FFFFFF, under 3:1 (WCAG 1.4.11)",
    ]);
    // The sign-in form set the ring colour in an inline style.
    old.setAttribute("style", "--tw-ring-color: var(--color-turquoise)");
    expect(inputFocusProblems(old)[0]).toMatch(/^inline style sets a colour \(--tw-ring-color/);
    // Removing the outline with nothing in its place is caught too.
    const bare = document.createElement("input");
    bare.className = "border border-line bg-white text-ink focus:outline-none";
    expect(inputFocusProblems(bare)).toEqual(["focus: no visible focus indicator (outline removed, no ring, border unchanged)"]);
    // A compound variant on a ring is not ignored.
    bare.className = "border border-line bg-white text-ink focus:outline-none focus:ring-2 focus:hover:ring-turquoise";
    expect(inputFocusProblems(bare)[0]).toMatch(/^unknown variant "focus:hover:"/);
  });

  it("passes the shared input focus style", () => {
    const input = document.createElement("input");
    input.className = `border border-line bg-white text-ink ${INPUT_FOCUS_CLASS}`;
    expect(inputFocusProblems(input)).toEqual([]);
  });

  it("passes the shared button styles in every state", () => {
    for (const cls of [PRIMARY_ACTION_CLASS, SECONDARY_ACTION_CLASS, QUIET_ACTION_CLASS, TEXT_LINK_CLASS]) {
      expect(classContrastProblems(cls)).toEqual([]);
    }
  });
});

describe("the sign-in pages", () => {
  it("sign in: Sign in is the main, readable action and Create account is quieter", () => {
    const { container } = render(<LoginForm />);
    expect(problems(container)).toEqual([]);
    expect(inputProblems(container)).toEqual([]);
    expect(passwordPlaceholders(container)).toEqual([]);
    const signIn = screen.getByRole("button", { name: "Sign in" });
    // Exact classes, not substrings: "hover:bg-turquoise" contains "bg-turquoise".
    // Founder direction: outlined with turquoise-deep words at rest, filled when
    // selected (hovered, or pressed on a touch screen).
    const signInClasses = signIn.className.split(/\s+/);
    expect(signInClasses).toEqual(expect.arrayContaining(["border-turquoise", "bg-white", "text-turquoise-deep", "hover:bg-turquoise", "active:bg-turquoise", "active:text-ink"]));
    expect(signInClasses).not.toContain("bg-turquoise");
    expect(signIn.getAttribute("type")).toBe("submit");
    const create = screen.getByRole("button", { name: "Create account" });
    expect(create.getAttribute("type")).toBe("button");
    expect(create.className.split(/\s+/).filter((c) => c.endsWith("bg-turquoise"))).toEqual([]);
    // Create account comes after Sign in.
    expect(signIn.compareDocumentPosition(create) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("sign up mode", () => {
    const { container } = render(<LoginForm />);
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(screen.getByRole("button", { name: "Create account" }).getAttribute("type")).toBe("submit");
    expect(screen.getByRole("button", { name: "Back to sign in" })).toBeTruthy();
    expect(problems(container)).toEqual([]);
    expect(inputProblems(container)).toEqual([]);
    expect(passwordPlaceholders(container)).toEqual([]);
  });

  it("forgot password", async () => {
    const { container } = render(await ForgotPasswordPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole("button", { name: "Send reset link" })).toBeTruthy();
    expect(problems(container)).toEqual([]);
    expect(inputProblems(container)).toEqual([]);
  });

  it("reset password", async () => {
    const { container } = render(<ResetPasswordPage />);
    expect(await screen.findByRole("button", { name: "Update password" })).toBeTruthy();
    expect(problems(container)).toEqual([]);
    expect(inputProblems(container)).toEqual([]);
    expect(container.querySelectorAll('input[type="password"]').length).toBe(2);
    expect(passwordPlaceholders(container)).toEqual([]);
  });

  it("MFA: verify, and each step of setting up an authenticator", async () => {
    const verify = render(<VerifyForm factors={[{ id: "f1", name: "Phone" }]} next={null} />);
    expect(problems(verify.container)).toEqual([]);
    expect(inputProblems(verify.container)).toEqual([]);
    cleanup();

    const enrol = render(<EnrolForm next={null} />);
    expect(problems(enrol.container)).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Set up authenticator" }));
    expect(await screen.findByRole("button", { name: "Confirm and continue" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Enter a setup key instead" })).toBeTruthy();
    expect(problems(enrol.container)).toEqual([]);
    expect(inputProblems(enrol.container)).toEqual([]);
  });
});
