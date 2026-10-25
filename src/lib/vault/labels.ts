/**
 * Plain-language vault labels (pure). Each says exactly what was checked.
 * There is deliberately no bare "Verified" label: a matching fingerprint
 * shows the file has not changed since it was captured, not who wrote it
 * or whether it is true.
 */

export type LabelTone = "good" | "neutral" | "warning" | "bad";
export interface VaultLabel { tone: LabelTone; text: string; detail: string }

const SYDNEY = "Australia/Sydney";
export function auDateTime(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-AU", { timeZone: SYDNEY, day: "2-digit", month: "2-digit", year: "numeric" });
  const time = d.toLocaleTimeString("en-AU", { timeZone: SYDNEY, hour: "numeric", minute: "2-digit" });
  return `${date} ${time}`;
}
/** A moment's Sydney date, dd/mm/yyyy. */
export function auDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", { timeZone: SYDNEY, day: "2-digit", month: "2-digit", year: "numeric" });
}
/** A plain date (yyyy-mm-dd) as dd/mm/yyyy. */
export function auDate(isoOrDate: string): string {
  const [y, m, d] = isoOrDate.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export function vaultLabels(input: {
  source: string;
  reportedDate: string | null;
  reportedBy: string | null;
  versionId: string;
  capturedAt: string;
  lastCheck: { ok: boolean; checkedAt: string; failedVersionIds: Set<string> } | null;
}): VaultLabel[] {
  const labels: VaultLabel[] = [];
  const captured = auDateTime(input.capturedAt);
  const check = input.lastCheck;
  const checkedAfterCapture = check && Date.parse(check.checkedAt) >= Date.parse(input.capturedAt);

  if (check && check.failedVersionIds.has(input.versionId)) {
    labels.push({
      tone: "bad",
      text: "Check failed",
      detail: `On ${auDateTime(check.checkedAt)} the stored file did not match the fingerprint recorded when it was captured on ${captured}.`,
    });
  } else if (checkedAfterCapture) {
    labels.push({
      tone: "good",
      text: `Unchanged since captured ${auDay(input.capturedAt)}`,
      detail: `The file's SHA-256 fingerprint was recorded when StrataVerze captured it on ${captured}, and still matched when checked on ${auDateTime(check!.checkedAt)}.`,
    });
  } else {
    labels.push({
      tone: "neutral",
      text: "Fingerprint recorded, not yet checked",
      detail: `StrataVerze recorded the file's SHA-256 fingerprint when it captured it on ${captured}. Run a check to confirm it is unchanged.`,
    });
  }

  if (input.source === "STRATAVERZE") {
    labels.push({ tone: "neutral", text: "Issued by StrataVerze", detail: "StrataVerze created this document and captured it at that moment." });
  }
  if (input.reportedDate) {
    labels.push({
      tone: "warning",
      text: `Dated ${auDate(input.reportedDate)}, as reported`,
      detail: `${input.reportedBy ? `Reported by ${input.reportedBy}.` : "Entered when it was added."} This date has not been checked independently. The capture time is StrataVerze's own record.`,
    });
  }
  return labels;
}
