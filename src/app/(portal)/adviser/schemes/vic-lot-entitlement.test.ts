/**
 * A Victorian lot's lot entitlement on the fake database (VIC, ACT and WA
 * stage 2, PR 4): captured on lot create and edit (locked like lot
 * liability), by the CSV lot import and by createScheme; cleared when the
 * building's state changes; and read for the insurance part of an annual
 * fee. Victoria cannot have buildings until its pack is switched on, so the
 * pending pack is injected for a "VIC" building, as the Queensland tests did.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/mfa-enforcement", () => ({
  requireRecentMfa: vi.fn(async () => {}),
  getMfaStatus: vi.fn(async () => null),
  enforceMfa: vi.fn(async () => {}),
  enforceMfaFor: vi.fn(async () => {}),
  StepUpRequiredError: class extends Error {},
}));
const caller = vi.hoisted(() => ({ id: "caller", isPlatformAdmin: true, roles: ["ADVISER"] as string[] }));
vi.mock("@/lib/auth/require-membership", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/require-membership")>("@/lib/auth/require-membership");
  return {
    ...actual,
    requireAuth: vi.fn(async () => caller),
    requirePlatformAdmin: vi.fn(async () => {
      if (!caller.isPlatformAdmin) throw new actual.AuthorisationError("Only StrataVerze staff can do this.");
      return caller;
    }),
    requireSchemeMembership: vi.fn(async () => ({ profile: caller, membership: { role: "ADVISER", profileId: caller.id }, roles: caller.roles })),
  };
});
vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;replace;${url}` });
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
vi.mock("@/lib/queries/activity-log", () => ({ logActivity: vi.fn(async () => {}), logActivityTx: vi.fn() }));
vi.mock("@/lib/audit/security-audit", () => ({ recordSecurityEvent: vi.fn(async () => {}) }));
vi.mock("@/lib/auth/session-register", () => ({ revokeAllSessions: vi.fn(async () => {}) }));
vi.mock("@/lib/queries/seed-chart-of-accounts", () => ({ seedDefaultChartOfAccounts: vi.fn(async () => {}) }));
// A Victorian building has the pending Victorian pack, lent the NSW accounting
// basis and Queensland's late charge setting (none until resolved), which the
// draft does not have yet, to reach the rest of createScheme.
vi.mock("@/lib/jurisdiction/scheme-rules", async () => {
  const actual = await vi.importActual<typeof import("@/lib/jurisdiction/scheme-rules")>("@/lib/jurisdiction/scheme-rules");
  const { PENDING_RULE_PACKS } = await import("@/config/statutory");
  const forState = (state: string | null | undefined) => {
    const nsw = actual.rulesForState("NSW").rules;
    if (state === "VIC")
      return {
        pack: null,
        rules: { ...PENDING_RULE_PACKS.VIC.rules, defaultAccountingBasis: nsw.defaultAccountingBasis, LATE_CHARGE: PENDING_RULE_PACKS.QLD.rules.LATE_CHARGE },
        label: "AU-VIC test",
      };
    if (state === "QLD") return { pack: null, rules: { ...PENDING_RULE_PACKS.QLD.rules, defaultAccountingBasis: nsw.defaultAccountingBasis }, label: "AU-QLD test" };
    return actual.rulesForState(state);
  };
  return {
    ...actual,
    rulesForState: forState,
    rulesForScheme: async (schemeId: string) => {
      const { sharedFake } = await import("@/test/fake-orm");
      return forState(sharedFake.table("Scheme").find((s) => s.id === schemeId)?.state as string);
    },
  };
});

const { sharedFake } = await import("@/test/fake-orm");
const { createLotAction, updateLotAction } = await import("./[id]/lots/actions");
const { validateLots, importLots } = await import("@/lib/queries/data-migration");
const { createScheme, newSchemeDataProblem, updateScheme, SchemeDataError } = await import("@/lib/queries/schemes");
const { contributionInsurance } = await import("@/lib/levies/contribution-insurance");
const { PENDING_RULE_PACKS } = await import("@/config/statutory");
type Rules = import("@/config/statutory").StatutoryRules;
const VIC_RULES = PENDING_RULE_PACKS.VIC.rules as unknown as Rules;

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}
async function createLot(schemeId: string, fields: Record<string, string>) {
  try {
    return await createLotAction(schemeId, {}, form(fields));
  } catch (err) {
    if ((err as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) return "created";
    throw err;
  }
}
const lot = (id: string) => sharedFake.table("Lot").find((l) => l.id === id)!;

beforeEach(() => {
  Object.assign(caller, { isPlatformAdmin: true, roles: ["ADVISER"] });
  sharedFake.reset({
    Scheme: [
      { id: "vic", state: "VIC" },
      { id: "qld", state: "QLD" },
    ],
    Lot: [{ id: "lot-vic", schemeId: "vic", lotNumber: "1", entitlement: 10, lotEntitlement: null, lotType: "RESIDENTIAL" }],
  });
});

describe("the lot form for a Victorian lot", () => {
  const base = { lotNumber: "2", entitlement: "1", lotType: "RESIDENTIAL" };

  it("needs the lot entitlement, a positive whole number, when StrataVerze adds a lot", async () => {
    expect(await createLot("vic", base)).toEqual({ fieldErrors: { lotEntitlement: "Enter the lot entitlement." } });
    expect(await createLot("vic", { ...base, lotEntitlement: "0" })).toEqual({ fieldErrors: { lotEntitlement: "Lot Entitlement must be a whole number of at least 1." } });
    // A value under Queensland's field is not read as a lot entitlement.
    expect(await createLot("vic", { ...base, interestScheduleEntitlement: "18" })).toEqual({ fieldErrors: { lotEntitlement: "Enter the lot entitlement." } });
    expect(await createLot("vic", { ...base, lotEntitlement: "18" })).toBe("created");
    const created = sharedFake.table("Lot").find((l) => l.schemeId === "vic" && l.lotNumber === "2")!;
    expect(created).toMatchObject({ entitlement: 1, lotEntitlement: 18 });
    expect("interestScheduleEntitlement" in created).toBe(false);
  });

  it("checks lot liability is a whole number, under its own name", async () => {
    expect(await createLot("vic", { ...base, entitlement: "1.5", lotEntitlement: "18" })).toEqual({ fieldErrors: { entitlement: "Lot Liability must be a whole number of at least 1." } });
  });

  it("is locked for the adviser like lot liability, and entered by StrataVerze", async () => {
    caller.isPlatformAdmin = false;
    const fields = { lotNumber: "1", entitlement: "10", lotType: "RESIDENTIAL" };
    expect(await updateLotAction("vic", "lot-vic", {}, form({ ...fields, unitNumber: "4", lotEntitlement: "" }))).toEqual({});
    expect(lot("lot-vic")).toMatchObject({ unitNumber: "4", lotEntitlement: null });
    expect((await updateLotAction("vic", "lot-vic", {}, form({ ...fields, lotEntitlement: "12" }))).error).toMatch(/locked building record/);
    expect(lot("lot-vic").lotEntitlement).toBeNull();

    caller.isPlatformAdmin = true;
    expect(await updateLotAction("vic", "lot-vic", {}, form({ ...fields, lotEntitlement: "12" }))).toEqual({});
    expect(lot("lot-vic").lotEntitlement).toBe(12);
    expect(await updateLotAction("vic", "lot-vic", {}, form({ ...fields, lotEntitlement: "1.5" }))).toEqual({
      fieldErrors: { lotEntitlement: "Lot Entitlement must be a whole number of at least 1." },
    });
    expect(lot("lot-vic").lotEntitlement).toBe(12);
  });

  it("refuses another pack's field, saving nothing", async () => {
    const fields = { lotNumber: "1", entitlement: "10", lotType: "RESIDENTIAL" };
    expect(await updateLotAction("vic", "lot-vic", {}, form({ ...fields, lotEntitlement: "12", interestScheduleEntitlement: "9" }))).toEqual({
      error: "This building's lots hold their lot entitlement only, so this lot cannot be saved here.",
    });
    expect(lot("lot-vic")).toMatchObject({ lotEntitlement: null });
    expect("interestScheduleEntitlement" in lot("lot-vic")).toBe(false);
  });
});

describe("the CSV lot import for a Victorian building", () => {
  const row = (rowNumber: number, data: Record<string, string>) => ({ rowNumber, data, errors: [] as string[], warnings: [] as string[] });

  it("needs each row's lot entitlement, a positive whole number", async () => {
    const checked = await validateLots("vic", [
      row(2, { lotNumber: "2", entitlement: "1", lotEntitlement: "12" }),
      row(3, { lotNumber: "3", entitlement: "1" }),
      row(4, { lotNumber: "4", entitlement: "1", lotEntitlement: "0" }),
      row(5, { lotNumber: "5", entitlement: "1", interestScheduleEntitlement: "12" }),
    ]);
    expect(checked.map((r) => r.errors)).toEqual([
      [],
      ["Enter the lot entitlement."],
      ["Lot Entitlement must be a whole number of at least 1."],
      ["Enter the lot entitlement."],
    ]);
  });

  it("writes the lot entitlement in its own column, and nothing in Queensland's", async () => {
    const result = await importLots("vic", [row(2, { lotNumber: "2", entitlement: "1", lotEntitlement: "12", interestScheduleEntitlement: "99" })], "adviser");
    expect(result).toEqual({ created: 1, errors: [] });
    const created = sharedFake.table("Lot").find((l) => l.lotNumber === "2")!;
    expect(created).toMatchObject({ schemeId: "vic", entitlement: 1, lotEntitlement: 12 });
    expect("interestScheduleEntitlement" in created).toBe(false);
  });

  it("never writes a lot entitlement for a Queensland building", async () => {
    await importLots("qld", [row(2, { lotNumber: "2", entitlement: "1", interestScheduleEntitlement: "5", lotEntitlement: "12" })], "adviser");
    const created = sharedFake.table("Lot").find((l) => l.schemeId === "qld")!;
    expect(created).toMatchObject({ interestScheduleEntitlement: 5 });
    expect("lotEntitlement" in created).toBe(false);
  });
});

describe("createScheme for a Victorian building", () => {
  const building = { name: "Collins Place", planNumber: "PS 12345", address: "1 Collins St", suburb: "Melbourne", state: "VIC", postcode: "3000", totalLots: 2, totalEntitlement: 2 };
  const lots = (a?: number | null, b?: number | null, field = "lotEntitlement") => [
    { lotNumber: "1", unitNumber: null, entitlement: 1, ownerName: "A", ...(a !== undefined ? { [field]: a } : {}) },
    { lotNumber: "2", unitNumber: null, entitlement: 1, ownerName: "B", ...(b !== undefined ? { [field]: b } : {}) },
  ];

  beforeEach(() => sharedFake.reset({ Scheme: [], SchemeMembership: [], Fund: [], Lot: [], LotDetail: [] }));

  it("saves both schedules, each in its own column", async () => {
    await createScheme(building, "adviser", lots(60, 40));
    expect(sharedFake.table("Lot").map((l) => [l.lotNumber, l.entitlement, l.lotEntitlement, l.interestScheduleEntitlement ?? null])).toEqual([
      ["1", 1, 60, null],
      ["2", 1, 40, null],
    ]);
  });

  it("refuses a lot entitlement out of range, or one sent under Queensland's field, creating nothing", async () => {
    for (const [rows, message] of [
      [lots(0, 40), "Lot 1: the lot entitlement must be a whole number from 1 to 1,000,000."],
      [lots(60, 1.5), "Lot 2: the lot entitlement must be a whole number from 1 to 1,000,000."],
      [lots(60, 40, "interestScheduleEntitlement"), "Lot 1 has a second lot entitlement, which this building's rules do not hold."],
    ] as const) {
      await expect(createScheme(building, "adviser", rows as never)).rejects.toThrow(SchemeDataError);
      await expect(createScheme(building, "adviser", rows as never)).rejects.toThrow(message);
    }
    expect(sharedFake.table("Scheme")).toHaveLength(0);
    expect(sharedFake.table("Lot")).toHaveLength(0);
  });

  it("is checked by newSchemeDataProblem for every pack", () => {
    expect(newSchemeDataProblem(VIC_RULES, {}, lots(60, 40))).toBeNull();
    expect(newSchemeDataProblem(VIC_RULES, {}, lots())).toBeNull();
    const qld = PENDING_RULE_PACKS.QLD.rules as unknown as Rules;
    expect(newSchemeDataProblem(qld, { regulationModule: "STANDARD", planFormat: "BUILDING" }, lots(60, 40))).toBe(
      "Lot 1 has a second lot entitlement, which this building's rules do not hold.",
    );
  });
});

describe("a Victorian building moved to another state", () => {
  it("loses each lot's lot entitlement, as it loses each lot's occupiable answer", async () => {
    sharedFake.reset({
      Scheme: [{ id: "s", state: "VIC", postcode: "3000", timeZone: "Australia/Melbourne", servicesOnly: false }],
      Lot: [
        { id: "l1", schemeId: "s", lotNumber: "1", entitlement: 1, lotEntitlement: 60, occupiable: true },
        { id: "l2", schemeId: "other", lotNumber: "1", entitlement: 1, lotEntitlement: 40, occupiable: true },
      ],
      SchemeSelectorValue: [],
    });
    await updateScheme("s", { state: "NSW", postcode: "2000" });
    expect(lot("l1")).toMatchObject({ lotEntitlement: null, occupiable: null, entitlement: 1 });
    expect(lot("l2")).toMatchObject({ lotEntitlement: 40 });
  });

  it("keeps them when only the postcode changes", async () => {
    sharedFake.reset({ Scheme: [{ id: "s", state: "VIC", postcode: "3000", timeZone: "Australia/Melbourne" }], Lot: [{ id: "l1", schemeId: "s", lotNumber: "1", entitlement: 1, lotEntitlement: 60 }] });
    await updateScheme("s", { postcode: "3121" });
    expect(lot("l1").lotEntitlement).toBe(60);
  });
});

describe("the insurance part of a Victorian annual fee, from the building's data", () => {
  function seed(opts: { lotEntitlement?: ReadonlyArray<number | null>; insurance?: string | null } = {}) {
    const held = opts.lotEntitlement ?? [50, 30, 20];
    sharedFake.reset({
      Scheme: [{ id: "s1", state: "VIC" }],
      Fund: [
        { id: "admin", schemeId: "s1", name: "Administrative Fund", fundType: "ADMINISTRATIVE", isActive: true },
        { id: "mnt", schemeId: "s1", name: "Maintenance Fund", fundType: "CAPITAL_WORKS", isActive: true },
      ],
      Lot: [1, 1, 2].map((entitlement, i) => ({ id: `l${i + 1}`, schemeId: "s1", lotNumber: String(i + 1), entitlement, lotEntitlement: held[i] })),
      AccountCode: [
        { id: "acc-ins", schemeId: "s1", code: "5-1100", name: "Insurance", accountType: "EXPENSE", accountSubType: "INSURANCE_EXPENSE", fundId: "admin" },
        { id: "acc-mnt", schemeId: "s1", code: "5-1200", name: "Maintenance and Repairs", accountType: "EXPENSE", accountSubType: "MAINTENANCE_EXPENSE", fundId: "admin" },
      ],
      Budget: [{ id: "b-admin", schemeId: "s1", fundId: "admin", financialYear: 2026, version: 1, status: "ADOPTED" }],
      BudgetLine: [
        ...(opts.insurance === null ? [] : [{ id: "bl1", fundId: "admin", accountCodeId: "acc-ins", financialYear: 2026, budgetId: "b-admin", budgetAmount: opts.insurance ?? "333.33" }]),
        { id: "bl2", fundId: "admin", accountCodeId: "acc-mnt", financialYear: 2026, budgetId: "b-admin", budgetAmount: "666.67" },
      ],
    });
  }
  const planLots = [1, 1, 2].map((entitlement, i) => ({ lotId: `l${i + 1}`, lotNumber: String(i + 1), entitlement, ownerId: null }));
  const schedule = { fundId: "admin", financialYear: 2026, levyType: "ORDINARY", budgetAmount: "1000.00" };

  it("shares the budget's insurance by lot entitlement and the rest by lot liability, summing exactly", async () => {
    seed();
    const { split, problem } = await contributionInsurance("s1", schedule, planLots);
    expect(problem).toBeNull();
    expect(split?.insuranceSchedule.key).toBe("LOT_ENTITLEMENT");
    expect(split?.shares.reduce((a, s) => a + s.insuranceCents, 0)).toBe(33_333);
    expect(split?.shares.reduce((a, s) => a + s.totalCents, 0)).toBe(100_000);
  });

  it("refuses a lot without a lot entitlement, with a plain message", async () => {
    seed({ lotEntitlement: [50, null, 20] });
    expect(await contributionInsurance("s1", schedule, planLots)).toEqual({
      split: null,
      problem: "Lot 2 has no lot entitlement recorded, so its share cannot be worked out. StrataVerze enters it from the building's records. The fees were not issued.",
    });
  });

  it("shares the whole fee by lot liability when the budget has no insurance", async () => {
    seed({ insurance: null, lotEntitlement: [null, null, null] });
    expect(await contributionInsurance("s1", schedule, planLots)).toEqual({ split: null, problem: null });
  });
});
