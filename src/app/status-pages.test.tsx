/**
 * AR-038: the app's own 404 and error pages, at the root and in the portal.
 * Each shows the brand, a way back for someone signed in (the dashboard)
 * and someone signed out (sign in), and the support address as text and as
 * a mailto link. Error pages never show the error's message or stack, only
 * its digest. The buttons pass the same contrast rules as the sign-in pages.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { classContrastProblems } from "@/test/class-contrast";

vi.mock("./fonts", () => ({ poppins: { variable: "font-poppins" }, inter: { variable: "font-inter" } }));

const { default: NotFound } = await import("./not-found");
const { default: AppError } = await import("./error");
const { default: GlobalError } = await import("./global-error");
const { default: PortalNotFound } = await import("./(portal)/not-found");
const { default: PortalError } = await import("./(portal)/error");

afterEach(cleanup);

const SECRET = "relation \"Profile\" does not exist at db.ts:42";
function thrown() {
  const e = new Error(SECRET) as Error & { digest: string };
  e.digest = "3141592653";
  e.stack = `Error: ${SECRET}\n    at Object.<anonymous> (/var/task/src/lib/db.ts:42:7)`;
  return e;
}

function expectWaysBack(container: HTMLElement) {
  const links = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href"));
  expect(links).toContain("/dashboard");
  expect(links).toContain("/login");
  expect(links.some((h) => h?.startsWith("mailto:support@strataverze.com"))).toBe(true);
  // The address itself, as text that can be selected and copied.
  const address = [...container.querySelectorAll("span")].find((s) => s.textContent === "support@strataverze.com");
  expect(address).toBeTruthy();
  expect(address!.className).not.toContain("select-none");
  for (const el of container.querySelectorAll<HTMLElement>("a, button")) {
    expect(classContrastProblems(el.className), el.textContent ?? "").toEqual([]);
  }
}

describe("not found", () => {
  it("at the root: the logo, both ways back and support", () => {
    const { container } = render(<NotFound />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("We can't find that page");
    expect(container.querySelector('img[alt="StrataVerze"]')).toBeTruthy();
    expectWaysBack(container);
  });

  it("in the portal: the same, inside the portal frame", () => {
    const { container } = render(<PortalNotFound />);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("We can't find that page");
    expectWaysBack(container);
  });
});

describe("errors", () => {
  for (const [name, Page] of [["the root", AppError], ["the portal", PortalError]] as const) {
    it(`in ${name}: try again, both ways back, support, and the digest but not the message`, () => {
      const retry = vi.fn();
      const { container } = render(<Page error={thrown()} retry={retry} />);
      expect(container.textContent).not.toContain(SECRET);
      expect(container.textContent).not.toContain("db.ts");
      expect(container.textContent).toContain("Reference: 3141592653");
      const mailto = [...container.querySelectorAll("a")].find((a) => a.href.startsWith("mailto:"))!;
      expect(decodeURIComponent(mailto.href)).toContain("Reference: 3141592653");
      expectWaysBack(container);
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
      expect(retry).toHaveBeenCalledOnce();
    });
  }

  it("a value thrown in the browser, with no digest, shows no reference", () => {
    const { container } = render(<AppError error="boom: secret detail" retry={() => {}} />);
    expect(container.textContent).not.toContain("secret detail");
    expect(container.textContent).not.toContain("Reference:");
  });

  it("global error renders its own document, without the message", () => {
    const html = renderToStaticMarkup(<GlobalError error={thrown()} retry={() => {}} />);
    expect(html).toMatch(/^<html lang="en-AU"/);
    expect(html).toMatch(/<body[^>]*>.*Something went wrong.*<\/body><\/html>$/s);
    expect(html).toContain("Something went wrong");
    expect(html).toContain("support@strataverze.com");
    expect(html).toContain('href="/dashboard"');
    expect(html).toContain('href="/login"');
    expect(html).toContain("Reference: 3141592653");
    expect(html).not.toContain(SECRET);
  });
});
