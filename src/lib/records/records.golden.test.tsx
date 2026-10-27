/**
 * NSW golden output for certificates and the document library (stage 2,
 * step 9, 27 Oct 2026). The snapshot was recorded from the code before
 * step 9, when these screens read SALE_CERTIFICATE and RECORD_RETENTION
 * directly; the shared shapes must give the same output. Do not update it to
 * make a refactor pass.
 */
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RULE_PACKS, type NswRules } from "@/config/statutory";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/app/(portal)/adviser/schemes/[id]/documents/actions", () => ({ uploadFileAction: vi.fn(), updateDocumentMetadataAction: vi.fn(), removeDocumentAction: vi.fn(), getDocumentSignedUrlAction: vi.fn() }));

const { certificateBlocks } = await import("@/lib/pdf/certificate");
const { requesterFields } = await import("./requester-fields");
const { CertificateEditor } = await import("@/components/records/records-forms");
const { DocumentsTabContent } = await import("@/components/documents/documents-tab-content");

const NSW = RULE_PACKS.NSW.rules as NswRules;
const c = NSW.CERTIFICATE;

describe("NSW certificate (stage 2, step 9)", () => {
  it("PDF blocks are unchanged", () => {
    const blocks = certificateBlocks({
      schemeName: "Harbour View",
      planNumber: "12345",
      planLabel: NSW.TERMINOLOGY.planLabel,
      planRowLabel: c.planRowLabel,
      title: c.title,
      section: c.section,
      number: 3,
      draft: false,
      certificateDate: "2026-10-26",
      lotNumber: "Lot 7",
      requester: { type: "Person authorised by the owner, mortgagee or covenant chargee", name: "Jo Agent", address: "1 Example St" },
      authorisedBy: { type: "Owner", name: "Jo Citizen", address: "7/1 Example St" },
      ownersCorporation: NSW.TERMINOLOGY.ownersCorporation,
      items: c.items.map(([no, title]) => ({ no, title, text: `Text for ${no}` })),
      execution: c.execution,
      executionLines: c.executionLines,
      conclusiveNote: c.conclusiveNote,
      form: c.form,
      follows: c.follows,
      preparedOn: "2026-10-26",
    });
    expect(blocks).toMatchSnapshot();
  });

  it("request fields and editor are unchanged", () => {
    const fields = requesterFields({ requesterTypes: c.requesterTypes, agentType: c.agentType, today: "2026-10-27", values: { requestedOn: "2026-10-20", requesterType: "AUTHORISED_PERSON", requesterName: "Jo Agent" } });
    expect(fields).toMatchSnapshot();
    const html = renderToStaticMarkup(
      <CertificateEditor action={async () => ({})} requesterFields={fields} items={c.items.slice(0, 3).map(([no, title]) => ({ no, title, text: "Check and complete." }))} ownersCorporation={NSW.TERMINOLOGY.ownersCorporation} />,
    );
    expect(html).toMatchSnapshot();
  });
});

describe("NSW document library (stage 2, step 9)", () => {
  it("record keeping periods are unchanged", () => {
    const doc = (id: string, category: string) => ({ id, title: `Doc ${id}`, fileName: `${id}.pdf`, fileUrl: "", fileSize: null, mimeType: "application/pdf", category, documentType: null, documentDate: "2026-10-26", strataPlan: null, schedule: null, lotNumber: null, supplier: null, comments: null, description: null, createdAt: "2026-10-26T00:00:00Z" });
    const html = renderToStaticMarkup(
      <DocumentsTabContent schemeId="s1" schemePlanNumber="12345" timeZone="Australia/Sydney" retention={NSW.DOCUMENT_RETENTION} documents={[doc("a", "FINANCIAL"), doc("b", "BYLAW"), doc("c", "SOMETHING_NEW")]} />,
    );
    expect(html.match(/Removing a document[^<]*/)?.[0]).toMatchSnapshot();
    expect([...html.matchAll(/ · (?:kept|keep)[^<]*/g)].map((m) => m[0])).toMatchSnapshot();
  });
});
