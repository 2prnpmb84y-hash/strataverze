/**
 * The every-lot notice contents (ACT stage 2, PR 6b, 28 Oct 2026): each
 * unit's contribution for the same schedule and period, the fund and its
 * totals, and the unit's proportion. Fixtures only, except where a pack's
 * words or rules are the point.
 */
import { describe, expect, it } from "vitest";
import { extractText, getDocumentProxy } from "unpdf";
import { PENDING_RULE_PACKS, QLD_RULE_PACK, statutoryRulesFor } from "@/config/statutory";
import {
  buildPeriodEveryLot,
  entitlementShares,
  everyLotFor,
  everyLotMissing,
  everyLotRequired,
  everyLotSections,
  everyLotStatus,
  type EveryLotContent,
  type EveryLotPeriodInput,
} from "./every-lot";
import { planNotices } from "./notice-plan";
import { levyNoticeBlocks, renderLevyNoticePdf, type LevyNoticeDocument } from "@/lib/pdf/documents";
import { levyNoticeEmail } from "@/lib/email-templates/levy-notice";
import { noticeLateCharge } from "@/lib/jurisdiction/wording";

const words = { lot: "unit", lots: "units", levy: "contribution", entitlement: "unit entitlement" };
// $4,000 a year, quarterly, by unit entitlement 500/300/200 (common property holds none): the first quarter.
const base: EveryLotPeriodInput = {
  lots: [
    { id: "l10", lotNumber: "10", entitlement: 200, lotType: "RESIDENTIAL" },
    { id: "l2", lotNumber: "2", entitlement: 300 },
    { id: "l1", lotNumber: "1", entitlement: 500 },
    { id: "cp", lotNumber: "CP", entitlement: 0, lotType: "COMMON" },
  ],
  periodNotices: [
    { lotId: "l1", cents: 50_000, insuranceSplit: false },
    { lotId: "l2", cents: 30_000, insuranceSplit: false },
  ],
  schedule: { budgetCents: 400_000, levyType: "ORDINARY", totalEntitlement: 1000, instalments: 4, instalmentIndex: 0, revised: false },
  fundName: "Administrative fund",
  words,
  sharedByEntitlement: true,
};
type Over = Omit<Partial<EveryLotPeriodInput>, "schedule"> & { schedule?: Partial<EveryLotPeriodInput["schedule"]> };
const build = (over: Over = {}, lotId = "l2") => everyLotFor(buildPeriodEveryLot({ ...base, ...over, schedule: { ...base.schedule, ...over.schedule } }), lotId);
const content = (over: Over = {}, lotId = "l2") => build(over, lotId).content as EveryLotContent;

describe("the every-lot content", () => {
  it("lists every unit but common property, in number order, with nil where a unit has no notice, and the total", () => {
    const e = content();
    expect(e.rows).toEqual([
      { lotNumber: "1", cents: 50_000, thisLot: false },
      { lotNumber: "2", cents: 30_000, thisLot: true },
      { lotNumber: "10", cents: null, thisLot: false },
    ]);
    expect(e.totalCents).toBe(80_000);
    expect(e.fund).toEqual({ name: "Administrative fund", scheduleTotalCents: 400_000, wholeYear: true });
    expect(e.proportion).toEqual({ entitlement: 300, totalEntitlement: 1000 });
    expect(e.withheld).toEqual({});
    // The same period content gives each notice its own unit.
    expect(content({}, "l1").rows.filter((r) => r.thisLot).map((r) => r.lotNumber)).toEqual(["1"]);
  });

  it("withholds the proportion where the amounts are not each unit's share by its current entitlement (two units' entitlements swapped)", () => {
    const swapped = base.lots.map((l) => (l.id === "l1" ? { ...l, entitlement: 300 } : l.id === "l2" ? { ...l, entitlement: 500 } : l));
    const e = content({ lots: swapped });
    expect(e.proportion).toBeNull();
    expect(e.withheld.PROPORTION_AND_METHOD).toBe("the amounts on the period's notices are not each unit's share by its current unit entitlement (it has changed since the notices were planned)");
    // The amounts and the list are still stated.
    expect(e.rows.map((r) => r.cents)).toEqual([50_000, 30_000, null]);
    // Another instalment's amounts, or an unknown instalment, are not this period's shares either.
    expect(content({ schedule: { instalmentIndex: null } }).withheld.PROPORTION_AND_METHOD).toBe("which instalment of the schedule the period is cannot be worked out");
  });

  it("withholds the proportion where the contribution was not shared by entitlement alone, or the entitlements no longer add up", () => {
    expect(content({ sharedByEntitlement: false }).withheld.PROPORTION_AND_METHOD).toBe("the contribution was not shared by unit entitlement alone");
    expect(content({ periodNotices: base.periodNotices.map((n) => ({ ...n, insuranceSplit: n.lotId === "l1" })) }).proportion).toBeNull();
    expect(content({ words: { ...words, entitlement: null } }).withheld.PROPORTION_AND_METHOD).toBe("the building's rules hold no entitlement on each lot");
    expect(content({ schedule: { totalEntitlement: 1200 } }).withheld.PROPORTION_AND_METHOD).toBe("the units' unit entitlement (1000) no longer adds up to the schedule's total (1200)");
    expect(content({ schedule: { totalEntitlement: 0 } }).proportion).toBeNull();
    // A removed lot's entitlement does not count.
    expect(content({ lots: [...base.lots, { id: "gone", lotNumber: "9", entitlement: 50, deleted: true }] }).proportion).toEqual({ entitlement: 300, totalEntitlement: 1000 });
  });

  it("withholds the year's total where the schedule for the fund and year was revised", () => {
    const e = content({ schedule: { revised: true } });
    expect(e.fund).toEqual({ name: "Administrative fund", scheduleTotalCents: null, wholeYear: true });
    expect(e.withheld.FUND_TOTAL).toBe("the contribution schedule for this fund and year was revised, so no schedule's total is the year's total");
    expect(everyLotSections(e).funds.rows.map((r) => r[0])).toEqual(["Fund", "This period, all units"]);
    // A special contribution is never a year's total, so a revision does not touch it.
    expect(content({ schedule: { revised: true, levyType: "SPECIAL", instalments: 1 } }).fund.scheduleTotalCents).toBe(400_000);
  });

  it("gives nothing, with the cause, where it cannot be stated truthfully", () => {
    expect(build({}, "cp")).toEqual({ content: null, reason: "the notice's unit is not a unit of the building (common property, or no longer recorded)" });
    expect(build({}, "elsewhere").content).toBeNull();
    expect(build({ periodNotices: [...base.periodNotices, { lotId: "l1", cents: 1, insuranceSplit: false }] })).toEqual({ content: null, reason: "a unit has two notices for the period" });
    // Common property with an amount: named as the cause.
    expect(build({ periodNotices: [...base.periodNotices, { lotId: "cp", cents: 100, insuranceSplit: false }] })).toEqual({
      content: null,
      reason: "common property has a contribution on the period's notices, and it is not a unit",
    });
    expect(build({ periodNotices: [...base.periodNotices, { lotId: "cp", cents: 0, insuranceSplit: false }] }).content).not.toBeNull();
    expect(build({ periodNotices: [...base.periodNotices, { lotId: "gone", cents: 100, insuranceSplit: false }] }).reason).toBe("a contribution on the period's notices is for a unit that is no longer recorded");
    expect(build({ fundName: " " }).reason).toBe("the fund has no name");
    expect(build({ schedule: { budgetCents: 0 } }).reason).toBe("the contribution schedule has no total");
  });
});

describe("entitlementShares", () => {
  const lotsOf = (entitlements: number[]) => entitlements.map((entitlement, i) => ({ lotId: `x${i}`, lotNumber: String(i + 1), entitlement, ownerId: null }));
  const cases: Array<[number, number[], "MONTHLY" | "QUARTERLY" | "HALF_YEARLY" | "ANNUALLY"]> = [
    [400_000, [500, 300, 200], "QUARTERLY"],
    [1_000_001, [1, 1, 1], "MONTHLY"],
    [99_999, [7, 13, 29, 51], "HALF_YEARLY"],
    [12_345_67, [10, 10, 10, 10, 10, 10, 40], "QUARTERLY"],
    [5, [1, 1, 1, 1, 1, 1, 1], "ANNUALLY"],
    [777_777, [0, 333, 333, 334], "MONTHLY"],
  ];
  it("allows every amount planNotices gives, instalment by instalment", () => {
    for (const [total, entitlements, frequency] of cases) {
      const lots = lotsOf(entitlements);
      const plan = planNotices({ lots, totalCents: total, frequency, periodStart: "2026-07-01", firstDueDate: "2026-07-01" });
      const count = { MONTHLY: 12, QUARTERLY: 4, HALF_YEARLY: 2, ANNUALLY: 1 }[frequency];
      for (let k = 0; k < count; k++) {
        const shares = entitlementShares(total, lots.map((l) => ({ id: l.lotId, entitlement: l.entitlement })), count, k)!;
        for (const n of plan.filter((x) => x.instalment === k + 1)) expect(shares.get(n.lotId)!.has(n.amountCents), `${total} ${frequency} ${k} ${n.lotId}`).toBe(true);
      }
    }
  });
  it("allows only one amount where no lots tie at the rounding cut-off", () => {
    const shares = entitlementShares(400_000, [{ id: "a", entitlement: 500 }, { id: "b", entitlement: 300 }, { id: "c", entitlement: 200 }], 4, 0)!;
    expect([...shares.values()].map((s) => [...s])).toEqual([[50_000], [30_000], [20_000]]);
    expect(entitlementShares(0, [{ id: "a", entitlement: 1 }], 1, 0)).toBeNull();
    expect(entitlementShares(100, [{ id: "a", entitlement: 1 }], 4, 4)).toBeNull();
  });
});

describe("everyLotStatus and everyLotMissing", () => {
  const act = PENDING_RULE_PACKS.ACT.rules.NOTICE_RULES;
  it("states the three keys where the content is there, and gives the cause where not", () => {
    expect(everyLotStatus(build(), "ADMINISTRATIVE")).toEqual({ states: { EVERY_LOT_CONTRIBUTION: true, FUND_TOTAL: true, PROPORTION_AND_METHOD: true }, reasons: {} });
    const swapped = build({ lots: base.lots.map((l) => (l.id === "l1" ? { ...l, entitlement: 300 } : l.id === "l2" ? { ...l, entitlement: 500 } : l)) });
    expect(everyLotStatus(swapped, "ADMINISTRATIVE").states).toEqual({ EVERY_LOT_CONTRIBUTION: true, FUND_TOTAL: true, PROPORTION_AND_METHOD: false });
    expect(everyLotStatus({ content: null, reason: "why" }, "ADMINISTRATIVE")).toEqual({ states: {}, reasons: { EVERY_LOT_CONTRIBUTION: "why", FUND_TOTAL: "why", PROPORTION_AND_METHOD: "why" } });
  });
  it("states the year's sinking fund total only for a budget schedule", () => {
    expect(everyLotStatus(build(), "CAPITAL_WORKS").states.FUND_TOTAL).toBe(true);
    const special = build({ schedule: { levyType: "SPECIAL", instalments: 1 } });
    expect(everyLotStatus(special, "CAPITAL_WORKS")).toMatchObject({ states: { FUND_TOTAL: false }, reasons: { FUND_TOTAL: "a special contribution has no total for the year" } });
    expect(everyLotStatus(special, "ADMINISTRATIVE").states.FUND_TOTAL).toBe(true);
  });
  it("names the first required part that cannot be stated, for the notice's fund", () => {
    expect(everyLotMissing(act, build(), "ADMINISTRATIVE")).toBeNull();
    const swapped = build({ lots: base.lots.map((l) => (l.id === "l1" ? { ...l, entitlement: 300 } : l.id === "l2" ? { ...l, entitlement: 500 } : l)) });
    expect(everyLotMissing(act, swapped, "ADMINISTRATIVE")).toMatch(/^The notice must state the unit's proportion and how it is worked out \(.+\), and it cannot be stated: the amounts on the period's notices/);
    expect(everyLotMissing(act, build({ schedule: { levyType: "SPECIAL", instalments: 1 } }), "CAPITAL_WORKS")).toContain("a special contribution has no total for the year");
    expect(everyLotMissing(statutoryRulesFor("NSW").NOTICE_RULES, { content: null, reason: "x" }, "ADMINISTRATIVE")).toBeNull();
  });
});

describe("everyLotRequired", () => {
  it("is required by the ACT pack only", () => {
    expect(everyLotRequired(PENDING_RULE_PACKS.ACT.rules.NOTICE_RULES)).toBe(true);
    expect(everyLotRequired(statutoryRulesFor("NSW").NOTICE_RULES)).toBe(false);
    expect(everyLotRequired(QLD_RULE_PACK.rules.NOTICE_RULES)).toBe(false);
    expect(everyLotRequired(PENDING_RULE_PACKS.VIC.rules.NOTICE_RULES)).toBe(false);
    expect(everyLotRequired(PENDING_RULE_PACKS.WA.rules.NOTICE_RULES)).toBe(false);
  });
});

describe("everyLotSections", () => {
  it("words the content in the building's words", () => {
    const s = everyLotSections(content());
    expect(s.contributions).toEqual({
      title: "Contribution for each unit",
      columns: ["Unit", "Contribution"],
      rows: [
        ["1", "$500.00"],
        ["2 (this unit)", "$300.00"],
        ["10", "Nil"],
      ],
      total: ["Total, all units", "$800.00"],
    });
    expect(s.funds.rows).toEqual([
      ["Fund", "Administrative fund (all of this contribution)"],
      ["This period, all units", "$800.00"],
      ["The year, all units", "$4,000.00"],
    ]);
    expect(s.proportion?.rows).toEqual([
      ["Proportion", "300 of 1000 (30%)"],
      ["How it is worked out", "By unit entitlement: this unit's unit entitlement divided by the total unit entitlement of all units"],
    ]);
    // A special contribution's total is not the year's.
    expect(everyLotSections(content({ schedule: { levyType: "SPECIAL", instalments: 1 } })).funds.rows[2]).toEqual(["This contribution, all units", "$4,000.00"]);
    expect(everyLotSections({ ...content(), proportion: { entitlement: 1, totalEntitlement: 3 } }).proportion?.rows[0]).toEqual(["Proportion", "1 of 3 (33.3333%)"]);
  });
});

// ─── The notice PDF and email ──────────────────────────────────────────────

async function textOf(bytes: Uint8Array) {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: true });
  return { text: String(text).replace(/\s+/g, " "), pages: pdf.numPages };
}

const act = PENDING_RULE_PACKS.ACT.rules;
const notice: LevyNoticeDocument = {
  schemeName: "Lake View",
  planNumber: "1234",
  lotNumber: "2",
  ownerNames: ["Alex Nguyen"],
  noticeNumber: "LN-0007",
  noticeDate: "2026-06-03",
  dueDate: "2026-07-01",
  periodStart: "2026-07-01",
  periodEnd: "2026-09-30",
  fundName: "Administrative fund",
  amountCents: 30_000,
  payment: { accountName: "The Owners", bsb: "062-000", accountNumber: "12345678", reference: "LN-0007" },
  contact: { name: "Sam Adviser", emailOrPhone: "sam@example.com" },
  ledgerUrl: "https://app.strataverze.com/owner/levies",
  // The ACT's annual-rate interest cannot be worded yet; a monthly penalty stands in for the late charge here.
  ...noticeLateCharge(QLD_RULE_PACK.rules.LATE_CHARGE, { mode: "NONE" }),
  hardship: null,
  terms: act.TERMINOLOGY,
  everyLot: content(),
};

describe("the notice PDF and email with the every-lot content", () => {
  it("adds the table, the fund and totals and the proportion after the usual items", () => {
    const blocks = levyNoticeBlocks(notice);
    const without = levyNoticeBlocks({ ...notice, everyLot: undefined });
    expect(blocks.slice(0, without.length)).toEqual(without);
    expect(blocks.slice(without.length)).toEqual([
      { kind: "heading", text: "Contribution for each unit", level: 2 },
      {
        kind: "table",
        columns: [{ header: "Unit", width: 3 }, { header: "Contribution", width: 1.5, align: "right" }],
        rows: [["1", "$500.00"], ["2 (this unit)", "$300.00"], ["10", "Nil"]],
        totalRow: ["Total, all units", "$800.00"],
      },
      { kind: "heading", text: "Fund and totals", level: 2 },
      { kind: "keyValues", rows: everyLotSections(notice.everyLot!).funds.rows },
      { kind: "heading", text: "This unit's proportion", level: 2 },
      { kind: "keyValues", rows: everyLotSections(notice.everyLot!).proportion!.rows },
    ]);
    // Null (the pack requires it, but it cannot be stated) adds nothing.
    expect(levyNoticeBlocks({ ...notice, everyLot: null })).toEqual(without);
  });

  it("states each unit's number and amount in the PDF, and only the notice's own owner by name", async () => {
    const { text, pages } = await textOf(await renderLevyNoticePdf(notice));
    expect(pages).toBe(1);
    for (const s of ["Contribution for each unit", "2 (this unit)", "$500.00", "Nil", "Total, all units", "$800.00", "The year, all units", "$4,000.00", "300 of 1000 (30%)", "By unit entitlement"]) {
      expect(text).toContain(s);
    }
    expect(text.match(/Alex Nguyen/g)).toHaveLength(1);
  });

  it("runs a long list of units over several pages, with the column headings on each", async () => {
    const lots = Array.from({ length: 180 }, (_, i) => ({ id: `u${i + 1}`, lotNumber: String(i + 1), entitlement: 1 }));
    const everyLot = content(
      {
        lots,
        periodNotices: lots.filter((l) => l.id !== "u45").map((l) => ({ lotId: l.id, cents: 12_345, insuranceSplit: false })),
        schedule: { budgetCents: 180 * 12_345 * 4, totalEntitlement: 180 },
      },
      "u90",
    );
    expect(everyLot.proportion).toEqual({ entitlement: 1, totalEntitlement: 180 });
    expect(everyLot.rows).toHaveLength(180);
    const { text, pages } = await textOf(await renderLevyNoticePdf({ ...notice, lotNumber: "90", everyLot }));
    expect(pages).toBeGreaterThan(2);
    expect(text).toContain(`Page ${pages} of ${pages}`);
    expect(text).toContain("90 (this unit)");
    expect(text).toContain("180 $123.45");
    expect(text).toContain("45 Nil");
    expect(text).toContain(`Total, all units $${(179 * 123.45).toLocaleString("en-AU", { minimumFractionDigits: 2 })}`);
    expect(text).toContain("1 of 180");
    // The column headings repeat on each page the table runs over.
    expect(text.match(/Unit Contribution/g)!.length).toBeGreaterThanOrEqual(pages - 1);
  });

  it("states the same content in the email, which goes on its own when the PDF fails", () => {
    const email = levyNoticeEmail({ to: "alex@example.com", ownerName: "Alex Nguyen", amount: "300.00", ...notice, planNumber: "1234" });
    for (const s of ["Contribution for each unit", "2 (this unit)", "$500.00", "Nil", "Total, all units", "$800.00", "Fund and totals", "The year, all units", "$4,000.00", "This unit&#39;s proportion", "300 of 1000 (30%)"]) {
      expect(email.html).toContain(s);
    }
    expect(email.html.match(/Alex Nguyen/g)).toHaveLength(1);
    // Without it the email is as it was.
    const plain = levyNoticeEmail({ to: "alex@example.com", ownerName: "Alex Nguyen", amount: "300.00", ...notice, everyLot: undefined, planNumber: "1234" });
    expect(plain.html).not.toContain("Contribution for each unit");
    expect(levyNoticeEmail({ to: "alex@example.com", ownerName: "Alex Nguyen", amount: "300.00", ...notice, everyLot: null, planNumber: "1234" }).html).toBe(plain.html);
  });
});
