/**
 * AR-037: every button and link on the sign-in pages has a readable label
 * (one text colour per state, 4.5:1 against its background in the default,
 * hover, focus, disabled and pending states).
 *
 * The sign-in button used to carry `text-white` and `text-turquoise` with
 * `bg-white`, and rendered white on white.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { classContrastProblems } from "@/test/class-contrast";
import { PRIMARY_ACTION_CLASS, QUIET_ACTION_CLASS, SECONDARY_ACTION_CLASS, TEXT_LINK_CLASS } from "@/components/ui/action-styles";

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

/** Every button and link on the page, with what is wrong with its classes. */
function problems(container: HTMLElement) {
  const controls = [...container.querySelectorAll<HTMLElement>("button, a")];
  expect(controls.length).toBeGreaterThan(0);
  return controls
    .map((el) => ({ control: `${el.tagName.toLowerCase()} "${el.textContent?.trim()}"`, problems: classContrastProblems(el.className) }))
    .filter((c) => c.problems.length > 0);
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
    const signIn = screen.getByRole("button", { name: "Sign in" });
    expect(signIn.className).toContain("bg-turquoise");
    expect(signIn.className).toContain("text-ink");
    expect(signIn.getAttribute("type")).toBe("submit");
    const create = screen.getByRole("button", { name: "Create account" });
    expect(create.getAttribute("type")).toBe("button");
    expect(create.className).not.toContain("bg-turquoise");
    // Create account comes after Sign in.
    expect(signIn.compareDocumentPosition(create) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("sign up mode", () => {
    const { container } = render(<LoginForm />);
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(screen.getByRole("button", { name: "Create account" }).getAttribute("type")).toBe("submit");
    expect(screen.getByRole("button", { name: "Back to sign in" })).toBeTruthy();
    expect(problems(container)).toEqual([]);
  });

  it("forgot password", async () => {
    const { container } = render(await ForgotPasswordPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole("button", { name: "Send reset link" })).toBeTruthy();
    expect(problems(container)).toEqual([]);
  });

  it("reset password", async () => {
    const { container } = render(<ResetPasswordPage />);
    expect(await screen.findByRole("button", { name: "Update password" })).toBeTruthy();
    expect(problems(container)).toEqual([]);
  });

  it("MFA: verify, and each step of setting up an authenticator", async () => {
    const verify = render(<VerifyForm factors={[{ id: "f1", name: "Phone" }]} next={null} />);
    expect(problems(verify.container)).toEqual([]);
    cleanup();

    const enrol = render(<EnrolForm next={null} />);
    expect(problems(enrol.container)).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Set up authenticator" }));
    expect(await screen.findByRole("button", { name: "Confirm and continue" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Enter a setup key instead" })).toBeTruthy();
    expect(problems(enrol.container)).toEqual([]);
  });
});
