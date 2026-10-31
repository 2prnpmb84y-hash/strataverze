/**
 * Switched off schemes and the scheduled jobs (31 Oct 2026): which schemes
 * are switched off, and the condition each job adds to leave them out, which
 * is omitted altogether when none is switched off.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));

const { sharedFake } = await import("@/test/fake-orm");
const { activeSchemesOnly, inactiveSchemeIds } = await import("./inactive");

/** A schemeId field that records each NOT IN it is asked for. */
function recordingField() {
  const calls: string[][] = [];
  return { calls, field: { notIn: (ids: string[]) => (calls.push(ids), `NOT IN (${ids.join(", ")})`) } };
}

describe("activeSchemesOnly", () => {
  it("adds no condition at all when no scheme is switched off", () => {
    const { calls, field } = recordingField();
    expect(activeSchemesOnly(field, [])).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("adds schemeId NOT IN the switched off schemes when there are some", () => {
    const { calls, field } = recordingField();
    expect(activeSchemesOnly(field, ["a", "b"])).toEqual(["NOT IN (a, b)"]);
    expect(calls).toEqual([["a", "b"]]);
  });
});

describe("inactiveSchemeIds", () => {
  beforeEach(() => {
    sharedFake.reset({ Scheme: [{ id: "on", isActive: true }, { id: "off", isActive: false }, { id: "unset" }] });
  });

  it("lists only the schemes switched off", async () => {
    expect(await inactiveSchemeIds()).toEqual(["off"]);
  });

  it("is empty when none is switched off", async () => {
    sharedFake.table("Scheme").find((s) => s.id === "off")!.isActive = true;
    expect(await inactiveSchemeIds()).toEqual([]);
  });
});
