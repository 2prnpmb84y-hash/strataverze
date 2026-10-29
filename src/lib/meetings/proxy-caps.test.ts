/**
 * Proxy caps, warned only (VIC, ACT and WA stage 2, PR 8b-iv, 29 Oct 2026):
 * the caps at 20 and 21 occupiable lots or units, the share rounded down and
 * up at 30 and 41, Victoria's limit read on the day (in force, commenced, and
 * the reader refusing), the lot owners counted or the lots (D16), the holder
 * in arrears (D17), the ACT's chair, and no warning for a pack without caps.
 */
import { describe, expect, it } from "vitest";
import { PENDING_RULE_PACKS, RULE_PACKS, type StatutoryRules } from "@/config/statutory";
import { proxiesHeld, proxyCapWarnings, proxyHolderKey, type ProxyCapFacts } from "./proxy-caps";

const VIC = PENDING_RULE_PACKS.VIC.rules as unknown as StatutoryRules;
const ACT = PENDING_RULE_PACKS.ACT.rules as unknown as StatutoryRules;
const WA = PENDING_RULE_PACKS.WA.rules as unknown as StatutoryRules;
const NO_DASH_OR_SEMICOLON = /[;–—]/;

const lots = (n: number, occupiable: boolean | null = true) =>
  Array.from({ length: n }, (_, i) => ({ id: `l${i + 1}`, lotNumber: String(i + 1), lotType: "RESIDENTIAL", occupiable }));

function facts({ lotCount, ownerCount, ...over }: Partial<ProxyCapFacts> & { lotCount?: number; ownerCount?: number } = {}): ProxyCapFacts {
  const n = lotCount ?? 30;
  return {
    holderName: "Pat Holder",
    held: 2,
    day: "2026-11-20",
    meetingDay: true,
    building: { scheme: { totalLots: n }, lots: lots(n) },
    owners: { distinct: ownerCount ?? n, everyLotHasOne: true },
    ...over,
  };
}

const warn = (pack: StatutoryRules, f: ProxyCapFacts) => {
  const out = proxyCapWarnings(pack, f);
  for (const w of out) expect(w).not.toMatch(NO_DASH_OR_SEMICOLON);
  return out;
};

describe("who holds a proxy, and how many for a meeting", () => {
  it("matches the email in any case and trimmed, else the name", () => {
    expect(proxyHolderKey({ proxyName: "Pat", proxyEmail: " Pat@Example.com " })).toBe("email:pat@example.com");
    expect(proxyHolderKey({ proxyName: "  Pat   Holder ", proxyEmail: "" })).toBe("name:pat holder");
    expect(proxyHolderKey({ proxyName: " ", proxyEmail: null })).toBeNull();
  });

  it("counts those for the day and those with no meeting date, or with no day the undated and the most for one day", () => {
    const p = (lotId: string, meetingDate: string | null, proxyEmail = "pat@example.com") => ({ lotId, proxyName: "Pat", proxyEmail, meetingDate });
    const list = [p("a", "2026-11-20"), p("b", "2026-11-20"), p("c", null), p("d", "2026-12-01"), p("e", "2026-11-20", "other@example.com")];
    expect(proxiesHeld(list, "email:pat@example.com", "2026-11-20")).toBe(3);
    expect(proxiesHeld(list, "email:pat@example.com", "2026-12-01")).toBe(2);
    expect(proxiesHeld(list, "email:pat@example.com", null)).toBe(3);
    expect(proxiesHeld([], "email:pat@example.com", null)).toBe(0);
  });
});

describe("Victoria (s 89D), warned only", () => {
  it("20 or fewer occupiable lots: 1 proxy, over at 2, with the exceptions", () => {
    expect(warn(VIC, facts({ lotCount: 20, held: 1 }))).toEqual([]);
    const [w] = warn(VIC, facts({ lotCount: 20, held: 2 }));
    expect(w).toBe(
      "Pat Holder holds 2 proxies for the meeting on 20 November 2026, over the limit of 1 proxy where there are 20 or fewer occupiable lots. The limit does not apply to family members, one owner with multiple lots (prescribed) or owners corporations managing commercial, retail or industrial common property (prescribed) (Owners Corporations Regulations 2018 (Vic) reg 8A).",
    );
  });

  it("more than 20 occupiable lots: 5% of the lot owners, rounded down may be over, rounded up over (D15)", () => {
    // 21 owners: 1.05, so 2 may be over and 3 is over.
    expect(warn(VIC, facts({ lotCount: 21, held: 1 }))).toEqual([]);
    expect(warn(VIC, facts({ lotCount: 21, held: 2 }))[0]).toMatch(/^Pat Holder holds 2 proxies for the meeting on 20 November 2026, which may be over the limit of 5% of 21 lot owners recorded, which is 1\.05\. Rounded down the limit is 1 proxy, rounded up 2 proxies\. How the share is rounded is not confirmed\. The limit does not apply/);
    expect(warn(VIC, facts({ lotCount: 21, held: 3 }))[0]).toMatch(/holds 3 proxies .*over the limit of 5% of 21 lot owners recorded, which is 1\.05\. This is over it rounded either way\./);
    // 30 owners: 1.5.
    expect(warn(VIC, facts({ lotCount: 30, held: 1 }))).toEqual([]);
    expect(warn(VIC, facts({ lotCount: 30, held: 2 }))[0]).toMatch(/may be over the limit of 5% of 30 lot owners recorded, which is 1\.5\. Rounded down the limit is 1 proxy, rounded up 2 proxies/);
    expect(warn(VIC, facts({ lotCount: 30, held: 3 }))[0]).toMatch(/, over the limit of 5% of 30 lot owners recorded/);
    // 41 owners: 2.05.
    expect(warn(VIC, facts({ lotCount: 41, held: 2 }))).toEqual([]);
    expect(warn(VIC, facts({ lotCount: 41, held: 3 }))[0]).toMatch(/may be over the limit of 5% of 41 lot owners recorded, which is 2\.05\. Rounded down the limit is 2 proxies, rounded up 3 proxies/);
    expect(warn(VIC, facts({ lotCount: 41, held: 4 }))[0]).toMatch(/, over the limit of 5% of 41 lot owners recorded/);
    // 40 owners: exactly 2, so no rounding is said.
    expect(warn(VIC, facts({ lotCount: 40, held: 2 }))).toEqual([]);
    const [exact] = warn(VIC, facts({ lotCount: 40, held: 3 }));
    expect(exact).toMatch(/over the limit of 5% of 40 lot owners recorded, which is 2\. The limit does not apply/);
    expect(exact).not.toContain("rounded");
  });

  it("D16: the distinct owners recorded, or the lots where any lot has no owner, said so", () => {
    // 41 lots, but one owner holds many: 25 distinct owners, 1.25.
    expect(warn(VIC, facts({ lotCount: 41, ownerCount: 25, held: 2 }))[0]).toMatch(/may be over the limit of 5% of 25 lot owners recorded, which is 1\.25/);
    const [missing] = warn(VIC, facts({ lotCount: 41, held: 3, owners: { distinct: 30, everyLotHasOne: false } }));
    expect(missing).toMatch(/may be over the limit of 5% of 41 lots, which is 2\.05\..* The owners are not recorded for every lot, so the lots are counted in place of the lot owners\.$/);
    // Common property rows are not lots.
    const withCommon = facts({ lotCount: 41, held: 3, owners: { distinct: 0, everyLotHasOne: false } });
    withCommon.building = { scheme: { totalLots: 41 }, lots: [...lots(41), { id: "cp", lotNumber: "CP", lotType: "COMMON", occupiable: null }] };
    expect(warn(VIC, withCommon)[0]).toMatch(/5% of 41 lots/);
  });

  it("where not every lot's occupiable answer is recorded, more than 1 proxy may be over", () => {
    const f = facts({ lotCount: 30, held: 2 });
    f.building = { scheme: { totalLots: 30 }, lots: [...lots(29), { id: "x", lotNumber: "30", lotType: "RESIDENTIAL", occupiable: null }] };
    const [w] = warn(VIC, f);
    expect(w).toMatch(/which may be over the limit\. The limit is 1 proxy where there are 20 or fewer occupiable lots, and StrataVerze cannot tell how many lots are occupiable until every lot's answer is recorded\./);
    expect(warn(VIC, { ...f, held: 1 })).toEqual([]);
  });

  it("reads the limit on the day: none before 9 Sep 2026, and refused once 1 Dec 2027 passes with no commencement recorded", () => {
    const [before] = warn(VIC, facts({ day: "2026-09-08", held: 2 }));
    expect(before).toMatch(/^StrataVerze cannot tell which proxy limit applies on 8 September 2026, so Pat Holder's 2 proxies for the meeting on 8 September 2026 are not checked\. No value of "Proxy limit"/);
    const [after] = warn(VIC, facts({ day: "2027-12-01", held: 2 }));
    expect(after).toMatch(/^StrataVerze cannot tell which proxy limit applies on 1 December 2027.*"Proxy limit" may have changed/);
    // 1 proxy is within any limit, so nothing is said.
    expect(warn(VIC, facts({ day: "2027-12-01", held: 1 }))).toEqual([]);
    expect(warn(VIC, facts({ day: "2026-11-30", held: 2, lotCount: 41 }))).toEqual([]);
  });

  it("once a pack version records CLAA 2026 as commenced, 1 lot owner always, and the exceptions are not confirmed", () => {
    const rules = VIC.PROXY_RULES!;
    const commenced: StatutoryRules = {
      ...VIC,
      PROXY_RULES: {
        ...rules,
        datedLimit: {
          ...rules.datedLimit!,
          versions: rules.datedLimit!.versions.map((v) => (v.legalStatus === "ENACTED_NOT_COMMENCED" ? { ...v, commencedOn: "2027-06-01" } : v)),
        },
      },
    };
    expect(warn(commenced, facts({ day: "2027-05-31", lotCount: 41, held: 2 }))).toEqual([]);
    const [w] = warn(commenced, facts({ day: "2027-06-01", lotCount: 41, held: 2 }));
    expect(w).toMatch(/^Pat Holder holds 2 proxies for the meeting on 1 June 2027, over the limit of 1 proxy\. The limit does not apply .* Whether these exceptions still apply is not confirmed\.$/);
  });

  it("D17: a holder whose email matches an owner of a lot owing money on the day", () => {
    const out = warn(VIC, facts({ held: 1, holderOwesOn: ["3", "7"] }));
    expect(out).toEqual([
      "Pat Holder's email matches the owner of lots 3 and 7, which owe the owners corporation money on 20 November 2026. An owner in arrears may not act as a proxy (Owners Corporations Act 2006 (Vic) s 89C(10)).",
    ]);
    expect(warn(VIC, facts({ held: 1, holderOwesOn: ["3"] }))[0]).toMatch(/^Pat Holder's email matches the owner of lot 3, which owes the owners corporation money/);
    expect(warn(VIC, facts({ held: 1, holderOwesOn: [] }))).toEqual([]);
  });

  it("with no meeting date, the limit is read on today and named for one meeting", () => {
    const [w] = warn(VIC, facts({ lotCount: 10, held: 2, meetingDay: false }));
    expect(w).toMatch(/^Pat Holder holds 2 proxies for one meeting, over the limit of 1 proxy/);
  });
});

describe("the ACT (sch 3 s 3.26(3), (4)), warned only", () => {
  it("20 units or fewer: 1 proxy, naming the chair's exemption", () => {
    expect(warn(ACT, facts({ lotCount: 20, held: 1 }))).toEqual([]);
    expect(warn(ACT, facts({ lotCount: 20, held: 2 }))).toEqual([
      "Pat Holder holds 2 proxies for the meeting on 20 November 2026, over the limit of 1 proxy. The limit does not apply to the chair of the meeting, who must exercise any proxies over the limit.",
    ]);
  });

  it("more than 20 units: 5% of the units, rounded down may be over and rounded up over", () => {
    expect(warn(ACT, facts({ lotCount: 21, held: 2 }))[0]).toMatch(/may be over the limit of 5% of 21 units, which is 1\.05\. Rounded down the limit is 1 proxy, rounded up 2 proxies\. How the share is rounded is not confirmed\. The limit does not apply to the chair/);
    expect(warn(ACT, facts({ lotCount: 30, held: 3 }))[0]).toMatch(/, over the limit of 5% of 30 units, which is 1\.5\. This is over it rounded either way\./);
    expect(warn(ACT, facts({ lotCount: 41, held: 3 }))[0]).toMatch(/may be over the limit of 5% of 41 units/);
    expect(warn(ACT, facts({ lotCount: 41, held: 2 }))).toEqual([]);
    // The ACT's units, not its owners: distinct owners are not read.
    expect(warn(ACT, facts({ lotCount: 41, ownerCount: 5, held: 2 }))).toEqual([]);
  });

  it("where the band cannot be worked out, more than 1 proxy is not checked, and said so", () => {
    const f = facts({ lotCount: 30, held: 2 });
    f.building = { scheme: { totalLots: 35 }, lots: lots(30) };
    expect(warn(ACT, f)).toEqual([
      "StrataVerze cannot work out the proxy limit for this building, so Pat Holder's 2 proxies for the meeting on 20 November 2026 are not checked. The proxy limit could not be worked out from the units recorded.",
    ]);
    expect(warn(ACT, { ...f, held: 1 })).toEqual([]);
  });

  it("has no holder in arrears warning", () => {
    expect(warn(ACT, facts({ lotCount: 10, held: 1, holderOwesOn: ["3"] }))).toEqual([]);
  });
});

describe("packs without proxy caps", () => {
  it("Western Australia, NSW and Queensland warn of nothing", () => {
    for (const pack of [WA, RULE_PACKS.NSW.rules, RULE_PACKS.QLD.rules]) {
      expect(proxyCapWarnings(pack, facts({ lotCount: 5, held: 9, holderOwesOn: ["1"] }))).toEqual([]);
    }
  });
});
