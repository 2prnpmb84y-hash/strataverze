import { describe, expect, it } from "vitest";
import { paymentUploadPathProblem, storedPaymentFileProblem } from "./payment-upload";

const A = "aaaaaaaa-0000-0000-0000-000000000001";

describe("paymentUploadPathProblem", () => {
  it("accepts a file directly in the scheme's payments folder", () => {
    expect(paymentUploadPathProblem(A, `schemes/${A}/payments/1760000000000-ab12cd34.pdf`)).toBeNull();
  });

  it("rejects other folders, sub-folders, traversal and odd names", () => {
    for (const p of [
      `schemes/${A}/1760000000000-ab12cd34.pdf`,
      `schemes/other/payments/x.pdf`,
      `schemes/${A}/payments/`,
      `schemes/${A}/payments/owner-2/x.pdf`,
      `schemes/${A}/payments/../x.pdf`,
      `schemes/${A}/payments/.hidden.pdf`,
      `schemes/${A}/payments/x y.pdf`,
    ]) {
      expect(paymentUploadPathProblem(A, p)).not.toBeNull();
    }
    expect(paymentUploadPathProblem(A, 42)).not.toBeNull();
  });

  it("rejects a disallowed extension", () => {
    expect(paymentUploadPathProblem(A, `schemes/${A}/payments/x.html`)).toMatch(/not permitted/);
    expect(paymentUploadPathProblem(A, `schemes/${A}/payments/noext`)).toMatch(/not permitted/);
  });
});

describe("storedPaymentFileProblem", () => {
  it("uses what storage reports", () => {
    expect(storedPaymentFileProblem({ size: 1000, contentType: "application/pdf" })).toBeNull();
    expect(storedPaymentFileProblem({ size: 1000, contentType: "image/png; charset=binary" })).toBeNull();
    expect(storedPaymentFileProblem(null)).toMatch(/could not find/);
    expect(storedPaymentFileProblem({ size: 0, contentType: "application/pdf" })).toMatch(/empty/);
    expect(storedPaymentFileProblem({ size: 11 * 1024 * 1024, contentType: "application/pdf" })).toMatch(/10 MB/);
    expect(storedPaymentFileProblem({ size: 1000, contentType: "text/html" })).toMatch(/not permitted/);
    expect(storedPaymentFileProblem({ size: 1000 })).toMatch(/not permitted/);
  });
});
