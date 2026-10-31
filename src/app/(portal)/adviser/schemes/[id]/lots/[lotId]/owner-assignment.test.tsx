/**
 * The lot's owner assignment control (S-01, 31 Oct 2026): the search to
 * assign an owner directly is shown only to those who may use it (the
 * building's Adviser and StrataVerze). The server action enforces the same
 * rule (src/test/cross-scheme-governance-lots.test.ts).
 */
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("../actions", () => ({ searchProfilesAction: vi.fn(), assignOwnerAction: vi.fn(), removeOwnerAction: vi.fn() }));

const { OwnerAssignment } = await import("./owner-assignment");

const owners = [{ id: "m1", profile: { id: "p1", firstName: "Alex", lastName: "Nguyen", email: "alex@example.test" } }];

describe("the owner assignment control", () => {
  it("shows the search to assign an owner when the viewer may assign", () => {
    const html = renderToStaticMarkup(<OwnerAssignment schemeId="s" lotId="l" owners={owners} canAssign />);
    expect(html).toContain("Assign Owner");
    expect(html).toContain('id="owner-search"');
  });

  it("hides it otherwise, and still lists the owners", () => {
    const html = renderToStaticMarkup(<OwnerAssignment schemeId="s" lotId="l" owners={owners} canAssign={false} />);
    expect(html).not.toContain("Assign Owner");
    expect(html).not.toContain('id="owner-search"');
    expect(html).toContain("Alex Nguyen");
  });
});
