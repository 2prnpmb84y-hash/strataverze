import { NextResponse } from "next/server";
import type { GeneratedPdf } from "./generate";

/** A PDF response that opens in the browser, named for saving. */
export function pdfResponse(pdf: Pick<GeneratedPdf, "bytes" | "fileName">, hash?: string | null) {
  return new NextResponse(Buffer.from(pdf.bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${pdf.fileName}"`,
      "Cache-Control": "private, no-store",
      ...(hash ? { "X-Content-SHA256": hash } : {}),
    },
  });
}

export const notFound = () => new NextResponse("Not found", { status: 404 });
export const signIn = () => new NextResponse("Sign in to view this document.", { status: 401 });
export const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
