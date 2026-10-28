/**
 * The every-lot notice contents (ACT stage 2, PR 6b, 28 Oct 2026): each
 * unit's contribution for the same schedule and period, the fund and its
 * totals, and the unit's proportion. Fixtures only, except where a pack's
 * words or rules are the point.
 */
import { describe, expect, it } from "vitest";
import { extractText, getDocumentProxy } from "unpdf";
import { PENDING_RULE_PACKS, QLD_RULE_PACK, statutoryRulesFor } from "@/config/statutory";
import { buildEveryLot, everyLotRequired, everyLotSections, everyLotStates, type EveryLotInput } from "./every-lot";
import { levyNoticeBlocks, renderLevyNoticePdf, type LevyNoticeDocument } from "@/lib/pdf/documents";
import { levyNoticeEmail } from "@/lib/email-templates/levy-notice";
import { noticeLateCharge } from "@/lib/jurisdiction/wording";

const words = { lot: "unit", lots: "units", levy: "contribution", entitlement: "unit entitlement" };
const base: EveryLotInput = {
  lotId: "l2",
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
  schedule: { budgetCents: 400_000, levyType: "ORDINARY", totalEntitlement: 1000 },
  fundName: "Administrative fund",
  words,
  sharedByEntitlement: true,
};

describe("buildEveryLot", () => {
  it("lists every unit but common property, in number order, with nil where a unit has no notice, and the total", () => {
    const e = buildEveryLot(base)!;
    expect(e.rows).toEqual([
      { lotNumber: "1", cents: 50_000, thisLot: false },
      { lotNumber: "2", cents: 30_000, thisLot: true },
      { lotNumber: "10", cents: null, thisLot: false },
    ]);
    expect(e.totalCents).toBe(80_000);
    expect(e.fund).toEqual({ name: "Administrative fund", scheduleTotalCents: 400_000, wholeYear: true });
    expect(e.proportion).toEqual({ entitlement: 300, totalEntitlement: 1000 });
  });

  it("states the proportion only where the contribution was shared by entitlement alone and the entitlements still add up", () => {
    expect(buildEveryLot({ ...base, sharedByEntitlement: false })!.proportion).toBeNull();
    expect(buildEveryLot({ ...base, words: { ...words, entitlement: null } })!.proportion).toBeNull();
    expect(buildEveryLot({ ...base, periodNotices: base.periodNotices.map((n) => ({ ...n, insuranceSplit: n.lotId === "l1" })) })!.proportion).toBeNull();
    expect(buildEveryLot({ ...base, schedule: { ...base.schedule, totalEntitlement: 1200 } })!.proportion).toBeNull();
    expect(buildEveryLot({ ...base, schedule: { ...base.schedule, totalEntitlement: 0 } })!.proportion).toBeNull();
    expect(buildEveryLot({ ...base, lots: base.lots.map((l) => (l.id === "l2" ? { ...l, entitlement: 0 } : l)) })!.proportion).toBeNull();
    // A removed lot's entitlement does not count.
    expect(buildEveryLot({ ...base, lots: [...base.lots, { id: "gone", lotNumber: "9", entitlement: 50, deleted: true }] })!.proportion).toEqual({ entitlement: 300, totalEntitlement: 1000 });
  });

  it("gives nothing where it cannot be stated truthfully", () => {
    // The notice's lot is common property, or not in the building.
    expect(buildEveryLot({ ...base, lotId: "cp" })).toBeNull();
    expect(buildEveryLot({ ...base, lotId: "elsewhere" })).toBeNull();
    // Two notices for one lot in the period.
    expect(buildEveryLot({ ...base, periodNotices: [...base.periodNotices, { lotId: "l1", cents: 1, insuranceSplit: false }] })).toBeNull();
    // An amount for a lot that is not shown (common property or another building's lot).
    expect(buildEveryLot({ ...base, periodNotices: [...base.periodNotices, { lotId: "cp", cents: 100, insuranceSplit: false }] })).toBeNull();
    expect(buildEveryLot({ ...base, periodNotices: [...base.periodNotices, { lotId: "cp", cents: 0, insuranceSplit: false }] })).not.toBeNull();
    // No fund name, or no schedule total.
    expect(buildEveryLot({ ...base, fundName: " " })).toBeNull();
    expect(buildEveryLot({ ...base, schedule: { ...base.schedule, budgetCents: 0 } })).toBeNull();
  });
});

describe("everyLotStates", () => {
  const e = buildEveryLot(base)!;
  it("states the three keys where the content is there", () => {
    expect(everyLotStates(e, "ADMINISTRATIVE")).toEqual({ EVERY_LOT_CONTRIBUTION: true, FUND_TOTAL: true, PROPORTION_AND_METHOD: true });
    expect(everyLotStates({ ...e, proportion: null }, "ADMINISTRATIVE")).toEqual({ EVERY_LOT_CONTRIBUTION: true, FUND_TOTAL: true, PROPORTION_AND_METHOD: false });
  });
  it("states the year's sinking fund total only for a budget schedule", () => {
    expect(everyLotStates(e, "CAPITAL_WORKS").FUND_TOTAL).toBe(true);
    expect(everyLotStates(buildEveryLot({ ...base, schedule: { ...base.schedule, levyType: "SPECIAL" } }), "CAPITAL_WORKS").FUND_TOTAL).toBe(false);
    expect(everyLotStates(buildEveryLot({ ...base, schedule: { ...base.schedule, levyType: "SPECIAL" } }), "ADMINISTRATIVE").FUND_TOTAL).toBe(true);
  });
  it("states nothing without the content", () => {
    expect(everyLotStates(null, "ADMINISTRATIVE")).toEqual({});
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
    const s = everyLotSections(buildEveryLot(base)!);
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
    expect(everyLotSections(buildEveryLot({ ...base, schedule: { ...base.schedule, levyType: "SPECIAL" } })!).funds.rows[2]).toEqual(["This contribution, all units", "$4,000.00"]);
    expect(everyLotSections({ ...buildEveryLot(base)!, proportion: { entitlement: 1, totalEntitlement: 3 } }).proportion?.rows[0]).toEqual(["Proportion", "1 of 3 (33.3333%)"]);
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
  everyLot: buildEveryLot(base),
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
    const everyLot = buildEveryLot({
      ...base,
      lotId: "u90",
      lots,
      periodNotices: lots.filter((l) => l.id !== "u45").map((l) => ({ lotId: l.id, cents: 12_345, insuranceSplit: false })),
      schedule: { budgetCents: 179 * 12_345 * 4, levyType: "ORDINARY", totalEntitlement: 180 },
    })!;
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
