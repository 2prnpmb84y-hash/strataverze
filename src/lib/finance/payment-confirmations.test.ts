import { describe, expect, it } from "vitest";
import { findDuplicateConfirmation, paymentConfirmationPathProblem } from "./payment-confirmations";

const first = { id: "d1", uploadedBy: "ownerA", levyNoticeId: "LN-001", lotId: "l3", amountCents: 300_000, documentDate: "2026-10-01", documentStatus: "UPLOADED" };

describe("duplicate payment confirmations (TC-001)", () => {
  it("flags the same notice, amount and date from the same owner", () => {
    expect(findDuplicateConfirmation({ uploadedBy: "ownerA", levyNoticeId: "LN-001", lotId: "l3", amountCents: 300_000, documentDate: "2026-10-01" }, [first])?.id).toBe("d1");
  });

  it("does not flag a different amount, date, notice or owner, or a rejected upload", () => {
    const next = { uploadedBy: "ownerA", levyNoticeId: "LN-001", lotId: "l3", amountCents: 300_000, documentDate: "2026-10-01" };
    expect(findDuplicateConfirmation({ ...next, amountCents: 250_000 }, [first])).toBeNull();
    expect(findDuplicateConfirmation({ ...next, documentDate: "2026-10-02" }, [first])).toBeNull();
    expect(findDuplicateConfirmation({ ...next, levyNoticeId: "LN-002" }, [first])).toBeNull();
    expect(findDuplicateConfirmation({ ...next, uploadedBy: "ownerB" }, [first])).toBeNull();
    expect(findDuplicateConfirmation(next, [{ ...first, documentStatus: "REJECTED" }])).toBeNull();
  });

  it("needs an amount and a date to match anything", () => {
    expect(findDuplicateConfirmation({ uploadedBy: "ownerA", levyNoticeId: "LN-001", lotId: "l3", amountCents: null, documentDate: "2026-10-01" }, [first])).toBeNull();
  });

  it("matches uploads with no notice by lot", () => {
    const loose = { ...first, levyNoticeId: null };
    expect(findDuplicateConfirmation({ uploadedBy: "ownerA", levyNoticeId: null, lotId: "l3", amountCents: 300_000, documentDate: "2026-10-01" }, [loose])?.id).toBe("d1");
    expect(findDuplicateConfirmation({ uploadedBy: "ownerA", levyNoticeId: null, lotId: "l7", amountCents: 300_000, documentDate: "2026-10-01" }, [loose])).toBeNull();
  });

  it("only accepts files in the scheme's payments folder", () => {
    expect(paymentConfirmationPathProblem("s1", "schemes/s1/payments/123-abc.pdf")).toBeNull();
    expect(paymentConfirmationPathProblem("s1", "schemes/s2/payments/123-abc.pdf")).not.toBeNull();
    expect(paymentConfirmationPathProblem("s1", "schemes/s1/payments/../levies/x.pdf")).not.toBeNull();
    expect(paymentConfirmationPathProblem("s1", "https://example.com/x.pdf")).not.toBeNull();
  });
});
