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
