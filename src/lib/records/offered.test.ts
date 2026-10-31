/**
 * The certificate and records access gates (VIC, ACT and WA stage 2, PR 10a):
 * one rule in offered.ts, giving NSW and Queensland exactly what the inline
 * checks gave before, and no pack switching on the draft packs' own
 * workflows until the pack PRs that wire them (10b to 10d).
 */
import { describe, expect, it } from "vitest";
import { PENDING_RULE_PACKS, QLD_RULE_PACK, RULE_PACKS, type StatutoryRules } from "@/config/statutory";
import { capListProblems } from "./caps";
import { accessOffered, certificateOffered, certificateRulesOffered, inspectionRulesOffered } from "./offered";

const VALUES = [true, false, undefined] as const;

describe("certificateOffered", () => {
  it("is what the pages and the store checked before (any truthy switch), and what the actions checked (each switch === true)", () => {
    for (const nsw of [true, false]) {
      for (const qld of VALUES) {
        for (const kinds of [false, undefined] as const) {
          const features = { strataInformationCertificate: nsw, bodyCorporateCertificate: qld, ...(kinds === undefined ? {} : { certificateKinds: kinds }) };
          const page = !(!features.strataInformationCertificate && !features.bodyCorporateCertificate);
          const action = features.strataInformationCertificate === true || features.bodyCorporateCertificate === true;
          expect(certificateOffered(features), JSON.stringify(features)).toBe(page);
          expect(certificateOffered(features), JSON.stringify(features)).toBe(action);
        }
      }
    }
  });

  it("is on for a pack with certificate kinds", () => {
    expect(certificateOffered({ strataInformationCertificate: false, certificateKinds: true })).toBe(true);
    expect(certificateOffered({ strataInformationCertificate: false, bodyCorporateCertificate: false, certificateKinds: false })).toBe(false);
  });
});

describe("accessOffered", () => {
  it("is what every gate checked before (recordsInspections)", () => {
    for (const inspections of [true, false]) {
      for (const access of [false, undefined] as const) {
        const features = { recordsInspections: inspections, ...(access === undefined ? {} : { recordsAccess: access }) };
        expect(accessOffered(features)).toBe(features.recordsInspections === true);
        expect(accessOffered(features)).toBe(!!features.recordsInspections);
      }
    }
  });

  it("is on for a pack with records access", () => {
    expect(accessOffered({ recordsInspections: false, recordsAccess: true })).toBe(true);
  });
});

describe("certificateRulesOffered and inspectionRulesOffered (the NSW and Queensland shapes only)", () => {
  it("are the inline checks before, whatever the draft packs' switches", () => {
    for (const nsw of [true, false]) {
      for (const qld of VALUES) {
        for (const kinds of VALUES) {
          const features = { strataInformationCertificate: nsw, bodyCorporateCertificate: qld, ...(kinds === undefined ? {} : { certificateKinds: kinds }) };
          expect(certificateRulesOffered(features), JSON.stringify(features)).toBe(!(!features.strataInformationCertificate && !features.bodyCorporateCertificate));
        }
      }
      for (const access of VALUES) {
        const features = { recordsInspections: nsw, ...(access === undefined ? {} : { recordsAccess: access }) };
        expect(inspectionRulesOffered(features)).toBe(nsw);
      }
    }
  });
});

describe("the packs (10a: shapes only)", () => {
  const every = [...Object.values(RULE_PACKS), ...Object.values(PENDING_RULE_PACKS)] as unknown as { code: string; rules: StatutoryRules }[];

  it("give NSW and Queensland the same answers as before", () => {
    expect(certificateOffered(RULE_PACKS.NSW.rules.FEATURES)).toBe(true);
    expect(accessOffered(RULE_PACKS.NSW.rules.FEATURES)).toBe(true);
    expect(certificateOffered(QLD_RULE_PACK.rules.FEATURES)).toBe(true);
    expect(accessOffered(QLD_RULE_PACK.rules.FEATURES)).toBe(true);
  });

  it("leave the new switches out of the NSW and Queensland packs, so their FEATURES and versions stay as recorded", () => {
    for (const features of [RULE_PACKS.NSW.rules.FEATURES, QLD_RULE_PACK.rules.FEATURES]) {
      expect(Object.keys(features)).not.toContain("certificateKinds");
      expect(Object.keys(features)).not.toContain("recordsAccess");
    }
  });

  it("switch on certificate kinds and records access in no pack yet, and hold none of their rules", () => {
    for (const p of every) {
      expect(p.rules.FEATURES.certificateKinds, p.code).not.toBe(true);
      expect(p.rules.FEATURES.recordsAccess, p.code).not.toBe(true);
      expect(p.rules.CERTIFICATE_KINDS, p.code).toBeUndefined();
      expect(p.rules.RECORDS_ACCESS, p.code).toBeUndefined();
    }
  });

  it("offer the draft packs no certificate and no records access yet", () => {
    for (const p of every.filter((x) => x.code !== "AU-NSW" && x.code !== "AU-QLD")) {
      expect(certificateOffered(p.rules.FEATURES), p.code).toBe(false);
      expect(accessOffered(p.rules.FEATURES), p.code).toBe(false);
    }
  });

  it("hold every dated cap list in order: ISO days, from before to, no overlap, refuseFromNextYear as MM-DD (a no-op until 10b to 10d)", () => {
    const problems: string[] = [];
    for (const p of every) {
      for (const k of p.rules.CERTIFICATE_KINDS?.kinds ?? []) {
        if (k.fee.basis === "DATED_CENTS") problems.push(...capListProblems(k.fee.caps, k.fee.refuseFromNextYear).map((x) => `${p.code} ${k.key}: ${x}`));
      }
      for (const k of p.rules.RECORDS_ACCESS?.kinds ?? []) {
        if (k.inspection === "FREE") {
          if (k.refuseFromNextYear !== undefined) problems.push(...capListProblems([], k.refuseFromNextYear).map((x) => `${p.code} ${k.key}: ${x}`));
          continue;
        }
        for (const [type, caps] of Object.entries(k.inspection)) problems.push(...capListProblems(caps, k.refuseFromNextYear).map((x) => `${p.code} ${k.key} ${type}: ${x}`));
      }
    }
    expect(problems).toEqual([]);
  });
});
