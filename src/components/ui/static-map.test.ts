import { describe, expect, it } from "vitest";
import { mapEmbedUrl } from "./static-map";

describe("mapEmbedUrl", () => {
  const address = "15 Harbour Esplanade, Docklands VIC 3008";

  it("uses the Maps Embed API place mode when a key is set", () => {
    expect(mapEmbedUrl(address, "abc123")).toBe(
      "https://www.google.com/maps/embed/v1/place?key=abc123&q=15%20Harbour%20Esplanade%2C%20Docklands%20VIC%203008",
    );
  });

  it("falls back to the keyless embed without a key", () => {
    expect(mapEmbedUrl(address)).toBe(
      "https://maps.google.com/maps?q=15%20Harbour%20Esplanade%2C%20Docklands%20VIC%203008&z=16&output=embed",
    );
  });
});
