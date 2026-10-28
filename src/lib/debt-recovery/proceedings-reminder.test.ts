/**
 * The 2 year rule's daily reminder (QLD go-live gap, 27 Oct 2026): when each
 * stage is due and what the email says, pure.
 */
import { describe, expect, it } from "vitest";
import { QLD_RULE_PACK, statutoryRulesFor } from "@/config/statutory";
import { auDate } from "@/lib/onboarding/property-onboarding";
import { proceedingsDeadlineFlags, proceedingsDeadlineRule, type LotDebt } from "./proceedings-deadline";
import { PROCEEDINGS_REMINDER_STAGES, proceedingsReminderContent, proceedingsReminderStage, remindable, stagesBefore } from "./proceedings-reminder";

const QLD = QLD_RULE_PACK.rules;
const rule = proceedingsDeadlineRule(QLD)!;
const lot: LotDebt = { lotId: "lot-4", lotNumber: "4", oldestUnpaidDueDate: "2024-10-27", proceedingsStarted: false };
const flagOn = (today: string) => proceedingsDeadlineFlags(rule, [lot], today)[0];

describe("proceedings reminder stages", () => {
  it("is FLAGGED when first flagged, then 30, 14 and 7 days before the deadline, then PASSED", () => {
    // Flagged from 27 Oct 2026, deadline 27 Dec 2026.
    expect(proceedingsReminderStage(flagOn("2026-10-27"), "2026-10-27")).toBe("FLAGGED");
    expect(proceedingsReminderStage(flagOn("2026-11-26"), "2026-11-26")).toBe("FLAGGED");
    expect(proceedingsReminderStage(flagOn("2026-11-27"), "2026-11-27")).toBe("DAYS_30");
    expect(proceedingsReminderStage(flagOn("2026-12-12"), "2026-12-12")).toBe("DAYS_30");
    expect(proceedingsReminderStage(flagOn("2026-12-13"), "2026-12-13")).toBe("DAYS_14");
    expect(proceedingsReminderStage(flagOn("2026-12-20"), "2026-12-20")).toBe("DAYS_7");
    expect(proceedingsReminderStage(flagOn("2026-12-27"), "2026-12-27")).toBe("DAYS_7");
    expect(proceedingsReminderStage(flagOn("2026-12-28"), "2026-12-28")).toBe("PASSED");
  });

  it("is not sent once the deadline passed more than 30 days ago (no burst at go-live)", () => {
    expect(remindable(flagOn("2026-12-28"), "2026-12-28")).toBe(true);
    expect(remindable(flagOn("2027-01-26"), "2027-01-26")).toBe(true);
    expect(remindable(flagOn("2027-01-27"), "2027-01-27")).toBe(false);
    expect(remindable(flagOn("2026-12-27"), "2026-12-27")).toBe(true);
  });

  it("can be claimed only from an earlier stage", () => {
    expect(stagesBefore("FLAGGED")).toEqual([]);
    expect(stagesBefore("DAYS_14")).toEqual(["FLAGGED", "DAYS_30"]);
    expect(stagesBefore("PASSED")).toEqual(["FLAGGED", "DAYS_30", "DAYS_14", "DAYS_7"]);
    expect(PROCEEDINGS_REMINDER_STAGES).toEqual(["FLAGGED", "DAYS_30", "DAYS_14", "DAYS_7", "PASSED"]);
  });
});

describe("proceedings reminder email", () => {
  const content = (today: string, adviser: boolean) =>
    proceedingsReminderContent({ flag: flagOn(today), rule, words: QLD.DEBT_RECOVERY.proceedingsReminder, terms: QLD.TERMINOLOGY, schemeName: "Riverside", adviser, formatDate: auDate });

  it("uses the pack's words, terms, years and citation, and gives the deadline as StrataVerze's date", () => {
    const c = content("2026-10-27", true);
    expect(c.subject).toBe("StrataVerze date to start proceedings for lot 4: 27/12/2026, Riverside");
    expect(c.heading).toBe("StrataVerze date to start proceedings for lot 4");
    expect(c.lines).toEqual([
      "Lot 4: the oldest unpaid contribution (due 27/10/2024) has been outstanding for 2 years. The body corporate must start proceedings by 27/12/2026.",
      "StrataVerze counts the 2 years from the date for payment of the oldest unpaid contribution. This date is StrataVerze's reading of Standard Module s 166(2), so check it before relying on it.",
      "Once proceedings start, complete the proceedings step on the lot's debt recovery case or record the court file number. The reminders then stop.",
    ]);
    expect(c.lines.join(" ")).toContain(QLD.DEBT_RECOVERY.mustStartProceedings.citation);
    expect(c.lines.join(" ")).not.toMatch(/levy|owners corporation|interest/i);
  });

  it("tells the committee without the adviser's steps, and says when the date has passed", () => {
    const c = content("2026-12-28", false);
    expect(c.subject).toBe("Passed: StrataVerze date to start proceedings for lot 4 was 27/12/2026, Riverside");
    expect(c.heading).toBe("The StrataVerze date to start proceedings for lot 4 has passed");
    expect(c.lines[0]).toMatch(/by 27\/12\/2026\. That date has passed\.$/);
    expect(c.lines[2]).toBe("Once proceedings start and are recorded in StrataVerze, the reminders stop.");
    expect(c.buttonLabel).toBe("Open StrataVerze");
  });

  it("has no dashes or semicolons, at any stage, to advisers or the committee", () => {
    for (const today of ["2026-10-27", "2026-11-27", "2026-12-13", "2026-12-20", "2026-12-28"]) {
      for (const adviser of [true, false]) {
        const c = content(today, adviser);
        for (const text of [c.subject, c.heading, c.buttonLabel, ...c.lines]) expect(text, text).not.toMatch(/[-–—;]/);
      }
    }
  });

  it("has nothing to send for NSW, whose pack has no rule", () => {
    expect(proceedingsDeadlineRule(statutoryRulesFor("NSW"))).toBeNull();
  });
});
