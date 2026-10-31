/**
 * The sign-in submit button while the form is being sent (L3): it keeps
 * keyboard focus (aria-disabled, not disabled), ignores a second click so
 * the form is not sent twice, announces the pending label in a polite live
 * region, and keeps the pending colours, which key off aria-busy.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { elementContrastProblems } from "@/test/class-contrast";

const status = vi.hoisted(() => ({ pending: false }));
vi.mock("react-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-dom")>()),
  useFormStatus: () => ({ pending: status.pending, data: null, method: null, action: null }),
}));

const { SubmitButton } = await import("./submit-button");

afterEach(() => {
  cleanup();
  status.pending = false;
});

function renderInForm(onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault())) {
  render(
    <form onSubmit={onSubmit}>
      <SubmitButton pendingLabel="Signing in…">Sign in</SubmitButton>
    </form>,
  );
  return onSubmit;
}

describe("SubmitButton", () => {
  it("at rest: an enabled submit button, and a silent status region", () => {
    const onSubmit = renderInForm();
    const button = screen.getByRole("button", { name: "Sign in" });
    expect(button.hasAttribute("disabled")).toBe(false);
    expect(button.getAttribute("aria-disabled")).toBeNull();
    expect(button.getAttribute("aria-busy")).toBeNull();
    expect(screen.getByRole("status").textContent).toBe("");
    fireEvent.click(button);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("while pending: keeps focus, ignores a second click and announces the label", () => {
    status.pending = true;
    const onSubmit = renderInForm();
    const button = screen.getByRole("button", { name: "Signing in…" });
    // Not disabled, so it stays focusable and keeps focus.
    expect(button.hasAttribute("disabled")).toBe(false);
    button.focus();
    expect(document.activeElement).toBe(button);
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(button.getAttribute("aria-busy")).toBe("true");
    // A click (and Enter in a field, which clicks the submit button) is ignored.
    fireEvent.click(button);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(button);
    const live = screen.getByRole("status");
    expect(live.getAttribute("aria-live")).toBe("polite");
    expect(live.className.split(/\s+/)).toContain("sr-only");
    expect(live.textContent).toBe("Signing in…");
  });

  it("keeps the pending colours, which key off aria-busy, readable", () => {
    status.pending = true;
    renderInForm();
    const button = screen.getByRole("button", { name: "Signing in…" });
    const classes = button.className.split(/\s+/);
    expect(classes).toEqual(expect.arrayContaining(["aria-busy:bg-turquoise", "aria-busy:text-ink"]));
    expect(elementContrastProblems(button)).toEqual([]);
  });

  it("is still disabled when the form cannot be sent", () => {
    render(
      <form>
        <SubmitButton pendingLabel="Creating account…" disabled>
          Create account
        </SubmitButton>
      </form>,
    );
    expect(screen.getByRole("button", { name: "Create account" }).hasAttribute("disabled")).toBe(true);
  });
});
