/** The section 184 information certificate as a PDF, laid out by StrataVerze from the approved form's items. */
import { renderPdf, type PdfBlock } from "./document";
import { longDate } from "./documents";
import { planLine } from "@/lib/jurisdiction/wording";

export interface CertificateDocument {
  schemeName: string;
  planNumber: string | null;
  /** The building's name for its plan (`rules.TERMINOLOGY.planLabel`). */
  planLabel: string;
  title: string;
  section: string;
  number: number;
  draft: boolean;
  certificateDate: string | null;
  lotNumber: string;
  requester: { type: string; name: string; address: string };
  authorisedBy: { type: string; name: string; address: string } | null;
  ownersCorporation: string;
  items: Array<{ no: string; title: string; text: string }>;
  execution: string;
  conclusiveNote: string;
  form: string;
  preparedOn: string;
}

export function certificateBlocks(d: CertificateDocument): PdfBlock[] {
  const blocks: PdfBlock[] = [
    { kind: "heading", text: `${d.title} (${d.section})` },
  ];
  if (d.draft) blocks.push({ kind: "box", tone: "warning", title: "Draft", lines: ["This is a draft. It is not a certificate until it is issued."] });
  blocks.push(
    {
      kind: "keyValues",
      rows: [
        ["Certificate number", String(d.number)],
        ["Date of certificate", d.certificateDate ? longDate(d.certificateDate) : "Not yet issued"],
        ["Lot", d.lotNumber],
        ["Strata plan", d.planNumber ?? ""],
        ["Requested by", `${d.requester.name} (${d.requester.type}), ${d.requester.address}`],
        ...(d.authorisedBy ? ([["Authorised by", `${d.authorisedBy.name} (${d.authorisedBy.type}), ${d.authorisedBy.address}`]] as [string, string][]) : []),
      ],
    },
    { kind: "text", text: `The ${d.ownersCorporation} certifies the following for the lot.` },
  );
  for (const i of d.items) {
    blocks.push({ kind: "heading", level: 2, text: `${i.no}. ${i.title}` });
    for (const line of i.text.split(/\n+/).filter(Boolean)) blocks.push({ kind: "text", text: line });
  }
  blocks.push(
    { kind: "spacer" },
    { kind: "box", title: "Execution", lines: [d.execution, "Date affixed: ____________", "Signature: ____________   Name: ____________", "Signature: ____________   Name: ____________"] },
    { kind: "text", text: d.conclusiveNote, muted: true, size: 8 },
    { kind: "text", text: `Laid out by StrataVerze following the items of the ${d.form}.`, muted: true, size: 8 },
  );
  return blocks;
}

export function renderCertificatePdf(d: CertificateDocument) {
  return renderPdf({
    title: `${d.title} ${d.number}${d.draft ? " (draft)" : ""}`,
    schemeName: d.schemeName,
    schemeLine: planLine(d, d.planNumber),
    blocks: certificateBlocks(d),
    footerNote: `Certificate ${d.number}`,
    generatedAt: new Date(`${d.preparedOn}T00:00:00Z`),
  });
}
