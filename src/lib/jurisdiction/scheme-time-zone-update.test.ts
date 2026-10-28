/** A building's time zone follows a change of state or postcode, and only a real change. */
import { describe, expect, it, vi } from "vitest";

vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));

const { sharedFake } = await import("@/test/fake-orm");
const { updateScheme } = await import("@/lib/queries/schemes");

const row = () => sharedFake.table("Scheme")[0] as { timeZone: string; postcode: string };

describe("updateScheme and the time zone", () => {
  it("keeps a time zone set by hand when the state and postcode are sent unchanged", async () => {
    sharedFake.reset({ Scheme: [{ id: "s", name: "Old", state: "NSW", postcode: "2880", timeZone: "Australia/Sydney" }] });
    await updateScheme("s", { name: "New name", state: "NSW", postcode: "2880" });
    expect(row().timeZone).toBe("Australia/Sydney");
  });

  it("follows a new postcode", async () => {
    sharedFake.reset({ Scheme: [{ id: "s", name: "Old", state: "NSW", postcode: "2000", timeZone: "Australia/Sydney" }] });
    await updateScheme("s", { state: "NSW", postcode: "2898" });
    expect(row().timeZone).toBe("Australia/Lord_Howe");
    await updateScheme("s", { state: "nsw", postcode: "2000" });
    expect(row().timeZone).toBe("Australia/Sydney");
  });
});

describe("updateScheme and the regulation module (QLD stage 2, step 10)", () => {
  const scheme = () => sharedFake.table("Scheme")[0] as Record<string, unknown>;

  it("clears a Queensland building's module when its state changes, so the database's Queensland-only check holds", async () => {
    sharedFake.reset({ Scheme: [{ id: "s", state: "QLD", postcode: "4000", timeZone: "Australia/Brisbane", regulationModule: "STANDARD" }] });
    await updateScheme("s", { state: "QLD", postcode: "4000", name: "Kept" });
    expect(scheme().regulationModule).toBe("STANDARD");
    await updateScheme("s", { state: "NSW", postcode: "2000" });
    expect(scheme()).toMatchObject({ state: "NSW", regulationModule: null, timeZone: "Australia/Sydney" });
  });

  it("clears a Queensland building's plan format with it (QLD go-live gap, insurance in contributions)", async () => {
    sharedFake.reset({ Scheme: [{ id: "s", state: "QLD", postcode: "4000", timeZone: "Australia/Brisbane", regulationModule: "STANDARD", planFormat: "BUILDING" }] });
    await updateScheme("s", { state: "QLD", postcode: "4000", name: "Kept" });
    expect(scheme().planFormat).toBe("BUILDING");
    await updateScheme("s", { state: "NSW", postcode: "2000" });
    expect(scheme()).toMatchObject({ state: "NSW", regulationModule: null, planFormat: null });
  });

  it("leaves an NSW building's update as it was: no module is written", async () => {
    sharedFake.reset({ Scheme: [{ id: "s", name: "Old", state: "NSW", postcode: "2000", timeZone: "Australia/Sydney" }] });
    await updateScheme("s", { name: "New", state: "NSW", postcode: "2880" });
    expect(scheme()).toEqual({ id: "s", name: "New", state: "NSW", postcode: "2880", timeZone: "Australia/Broken_Hill" });
  });
});

describe("updateScheme and the building selectors (VIC, ACT and WA stage 2, PR 2)", () => {
  const S = "s";
  const OTHER = "other";
  const seed = (state: string) =>
    sharedFake.reset({
      Scheme: [
        { id: S, state, postcode: "3000", timeZone: "Australia/Melbourne", servicesOnly: true, replacementCost: null },
        { id: OTHER, state, postcode: "3000", timeZone: "Australia/Melbourne", servicesOnly: false },
      ],
      SchemeSelectorValue: [
        { id: "v1", schemeId: S, key: "ownersCorporationType", value: "UNLIMITED" },
        { id: "v2", schemeId: OTHER, key: "ownersCorporationType", value: "UNLIMITED" },
      ],
      Lot: [
        { id: "l1", schemeId: S, lotNumber: "1", occupiable: true },
        { id: "l2", schemeId: S, lotNumber: "2", occupiable: null },
        { id: "l3", schemeId: OTHER, lotNumber: "1", occupiable: false },
      ],
    });
  const scheme = (id: string) => sharedFake.table("Scheme").find((s) => s.id === id) as Record<string, unknown>;

  it("keeps the recorded values and facts while the state stays the same", async () => {
    seed("VIC");
    await updateScheme(S, { state: "VIC", postcode: "3000", name: "Kept" });
    expect(sharedFake.table("SchemeSelectorValue")).toHaveLength(2);
    expect(scheme(S).servicesOnly).toBe(true);
    expect(sharedFake.table("Lot").map((l) => l.occupiable)).toEqual([true, null, false]);
  });

  it("clears the building's recorded values and facts when its state changes, and no other building's", async () => {
    seed("VIC");
    await updateScheme(S, { state: "NSW", postcode: "2000" });
    expect(scheme(S)).toMatchObject({ state: "NSW", servicesOnly: null, timeZone: "Australia/Sydney" });
    expect(sharedFake.table("SchemeSelectorValue").map((v) => v.schemeId)).toEqual([OTHER]);
    expect(sharedFake.table("Lot").map((l) => l.occupiable)).toEqual([null, null, false]);
    expect(scheme(OTHER).servicesOnly).toBe(false);
  });

  it("clears a Western Australian building's replacement cost when its state changes", async () => {
    sharedFake.reset({ Scheme: [{ id: S, state: "WA", postcode: "6000", timeZone: "Australia/Perth", replacementCost: "6000000.00" }], SchemeSelectorValue: [], Lot: [] });
    await updateScheme(S, { state: "NSW", postcode: "2000" });
    expect(scheme(S)).toMatchObject({ state: "NSW", replacementCost: null });
  });

  it("locks the building's row for a state change, so a building rules save in progress is cleared after it, and takes no lock otherwise", async () => {
    seed("VIC");
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    // A building rules save holding the row, writing a value under the old state.
    const saving = sharedFake.db.transaction(async (tx) => {
      await tx.orm.public.Scheme.where({ id: S }).forNoKeyUpdate().first();
      await held;
      await tx.orm.public.SchemeSelectorValue.create({ schemeId: S, key: "severalOwnersCorporations", value: "NO" });
      await tx.orm.public.Scheme.where({ id: S }).update({ servicesOnly: false });
    });
    const moving = updateScheme(S, { state: "NSW", postcode: "2000" });
    await new Promise((r) => setTimeout(r, 20));
    release();
    await saving;
    await moving;
    expect(scheme(S)).toMatchObject({ state: "NSW", servicesOnly: null });
    expect(sharedFake.table("SchemeSelectorValue").map((v) => v.schemeId)).toEqual([OTHER]);
    expect(sharedFake.locks.filter((l) => l.table === "Scheme" && l.ids.includes(S))).toEqual([
      { table: "Scheme", ids: [S], inTransaction: true },
      { table: "Scheme", ids: [S], inTransaction: true },
    ]);
    expect(sharedFake.globalCallsUnderLock).toEqual([]);

    sharedFake.reset({ Scheme: [{ id: "n", name: "Old", state: "NSW", postcode: "2000", timeZone: "Australia/Sydney" }] });
    await updateScheme("n", { name: "New", state: "NSW", postcode: "2880" });
    expect(sharedFake.locks).toEqual([]);
  });
});

