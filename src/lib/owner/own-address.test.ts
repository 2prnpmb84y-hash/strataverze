import { describe, expect, it } from "vitest";
import { accountAddresses, addressResemblance, isOwnAddress, normaliseAddress } from "./own-address";

describe("own addresses (H-1, review L1, L4)", () => {
  it("compares trimmed, in lower case and without a plus tag", () => {
    expect(normaliseAddress("  Chris+Lot7@Example.COM ")).toBe("chris@example.com");
    expect(normaliseAddress("+tag@example.com")).toBe("+tag@example.com");
    expect(normaliseAddress("")).toBeNull();
    const mine = accountAddresses("chris@example.com", { email: "login@example.com", new_email: "next+x@example.com", identities: [{ identity_data: { email: "G@Gmail.com" } }] });
    expect([...mine].sort()).toEqual(["chris@example.com", "g@gmail.com", "login@example.com", "next@example.com"]);
    for (const e of ["chris+buyer@example.com", "LOGIN@example.com", "next@example.com", "g+1@gmail.com"]) expect(isOwnAddress(e, mine)).toBe(true);
    expect(isOwnAddress("chrissy@example.com", mine)).toBe(false);
  });

  it("folds Gmail dots, googlemail.com and a trailing dot on the domain (L4)", () => {
    expect(normaliseAddress("Chris.Chair@googlemail.com")).toBe("chrischair@gmail.com");
    expect(normaliseAddress("c.h.r.i.s+x@gmail.com.")).toBe("chris@gmail.com");
    expect(normaliseAddress("chris.chair@example.com.")).toBe("chris.chair@example.com");
    // Dots matter outside Gmail.
    expect(normaliseAddress("chris.chair@example.com")).not.toBe(normaliseAddress("chrischair@example.com"));
    const mine = accountAddresses("chair@x.test", { identities: [{ identity_data: { email: "chris.chair@gmail.com" } }] });
    for (const e of ["ChrisChair@googlemail.com", "c.h.r.i.s.chair+lot@gmail.com", "chair@x.test.", "CHAIR+1@X.TEST."]) expect(isOwnAddress(e, mine)).toBe(true);
  });

  it("flags a shared local part, or a shared domain that is not a public provider, against any of the recorder's addresses", () => {
    expect(addressResemblance("chris+2@other.org", ["Chris@example.com"])).toBe("local");
    expect(addressResemblance("buyer@chairco.com.au", ["chris@chairco.com.au"])).toBe("domain");
    expect(addressResemblance("buyer@gmail.com", ["chris@gmail.com"])).toBeNull();
    expect(addressResemblance("chris.chair@googlemail.com", ["login@x.test", "chrischair@gmail.com"])).toBe("local");
    expect(addressResemblance("buyer@chairco.com.au.", ["login@x.test", "chris@chairco.com.au"])).toBe("domain");
    expect(addressResemblance(null, ["chris@example.com"])).toBeNull();
  });
});
