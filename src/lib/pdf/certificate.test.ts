import { describe, expect, it } from "vitest";
import { CERTIFICATE, SALE_CERTIFICATE } from "@/config/statutory";
import { certificateBlocks, renderCertificatePdf, type CertificateDocument } from "./certificate";

const base: CertificateDocument = {
  schemeName: "Harbour View",
  planNumber: "12345",
  planLabel: "Strata Plan",
  planRowLabel: CERTIFICATE.planRowLabel,
  title: SALE_CERTIFICATE.title,
  section: SALE_CERTIFICATE.section,
  number: 3,
  draft: false,
  certificateDate: "2026-10-26",
  lotNumber: "Lot 7",
  requester: { type: "Owner", name: "Jo Citizen", address: "7/1 Example St" },
  authorisedBy: null,
  ownersCorporation: "owners corporation",
  items: SALE_CERTIFICATE.items.map(([no, title]) => ({ no, title, text: `Text for ${no}` })),
  execution: SALE_CERTIFICATE.execution,
  executionLines: CERTIFICATE.executionLines,
  conclusiveNote: SALE_CERTIFICATE.conclusiveNote,
  form: SALE_CERTIFICATE.form,
  follows: CERTIFICATE.follows,
  preparedOn: "2026-10-26",
};

describe("information certificate PDF", () => {
  it("has every item of the approved form, in order, and the execution block", () => {
    const t = JSON.stringify(certificateBlocks(base));
    let last = -1;
    for (const [no, title] of SALE_CERTIFICATE.items) {
      const at = t.indexOf(`${no}. ${title}`);
      expect(at).toBeGreaterThan(last);
      last = at;
    }
    expect(t).toContain("12A. Outstanding orders");
    expect(t).toContain("Common seal");
    expect(t).not.toContain("This is a draft");
  });

  it("marks a draft", () => {
    expect(JSON.stringify(certificateBlocks({ ...base, draft: true, certificateDate: null }))).toContain("This is a draft");
  });

  it("renders as a PDF", async () => {
    const bytes = await renderCertificatePdf(base);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  });
});
