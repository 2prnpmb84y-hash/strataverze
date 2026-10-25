import { describe, expect, it } from "vitest";
import { afterSignIn, signInPortals } from "./post-sign-in";

describe("the portals offered after signing in", () => {
  it("maps committee and payment authoriser to the owner portal, once", () => {
    expect(signInPortals(["committee", "owner", "payment_authoriser"], false)).toEqual(["owner"]);
  });

  it("adds StrataVerze Admin for platform administrators", () => {
    expect(signInPortals(["owner", "adviser", "supplier"], true)).toEqual(["owner", "adviser", "supplier", "admin"]);
  });

  it("leaves out roles that have no portal of their own", () => {
    expect(signInPortals(["org_admin", "adviser"], false)).toEqual(["adviser"]);
  });
});

describe("where someone goes after signing in", () => {
  it("goes straight to their only portal", () => {
    expect(afterSignIn(["adviser"], null)).toEqual({ kind: "go", path: "/adviser" });
    expect(afterSignIn(["supplier"], "")).toEqual({ kind: "go", path: "/supplier" });
  });

  it("chooses when there is more than one", () => {
    expect(afterSignIn(["owner", "adviser", "supplier", "admin"], null)).toEqual({ kind: "choose" });
  });

  it("goes to the owner portal when there is none yet", () => {
    expect(afterSignIn([], null)).toEqual({ kind: "go", path: "/owner" });
  });

  it("returns to a safe link first, and ignores an unsafe one", () => {
    expect(afterSignIn(["owner", "adviser"], "/adviser/schemes/1")).toEqual({ kind: "go", path: "/adviser/schemes/1" });
    expect(afterSignIn(["owner", "adviser"], "//evil.example")).toEqual({ kind: "choose" });
    expect(afterSignIn(["adviser"], "https://evil.example")).toEqual({ kind: "go", path: "/adviser" });
  });
});
