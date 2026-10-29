/**
 * Notice by motion (VIC, ACT and WA stage 2, PR 8b-iii, 29 Oct 2026):
 * noticeCheck is exactly validateNoticePeriod for NSW and Queensland,
 * whatever the agenda; the ACT needs 21 days where an unopposed or unanimous
 * resolution is on the agenda; a Victorian committee and a Western
 * Australian council meeting are not checked (decision D12: not compliant,
 * no period). With the agenda refusal once the notice is issued, the conduct
 * refusal on a short notice (decision D13), and the setup warning and
 * preview.
 */
import { describe, expect, it } from "vitest";
import { MEETING_RULES as NSW, PENDING_RULE_PACKS, QLD_RULE_PACK } from "@/config/statutory";
import { categoryNoticeRefusal, noticeCheck, validateNoticePeriod, type MeetingType } from "./rules";
import { categoryNoticeAgendaRefusal } from "./agenda";
import { buildSetupPreview, MEETING_TYPES, validateMeetingSetup } from "./setup";

const QLD = QLD_RULE_PACK.rules.MEETING_RULES;
const VIC = PENDING_RULE_PACKS.VIC.rules.MEETING_RULES;
const ACT = PENDING_RULE_PACKS.ACT.rules.MEETING_RULES;
const WA = PENDING_RULE_PACKS.WA.rules.MEETING_RULES;
const DAY = 24 * 60 * 60 * 1000;
const NO_DASH_OR_SEMICOLON = /[;–—]/;

/** The meeting `days` days on from `issue`, at `hours` past the same time. */
const on = (issue: string, days: number, hours = 0) => new Date(Date.parse(issue) + days * DAY + hours * 60 * 60 * 1000);

describe("noticeCheck for NSW and Queensland", () => {
  it("is exactly validateNoticePeriod, whatever categories the agenda has", () => {
    const agendas = [[], ["ORDINARY"], ["UNANIMOUS", "SPECIAL"], ["UNOPPOSED", "INTERIM_SPECIAL", null, undefined], ["WITHOUT_DISSENT", "MAJORITY", "SUSTAINABILITY_INFRASTRUCTURE"]];
    const issues = ["2026-09-20T13:30:00.000Z", "2026-10-03T13:59:00.000Z", "2026-10-04T13:00:00.000Z"];
    for (const ruleSet of [NSW, QLD]) {
      for (const zone of ["Australia/Sydney", "Australia/Brisbane"]) {
        for (const type of MEETING_TYPES) {
          for (const issue of issues) {
            for (const gap of [-1, 0, 1, 2, 3, 4, 6, 7, 8, 13, 14, 15, 20, 21, 22]) {
              for (const hours of [-1, 0, 1]) {
                const expected = validateNoticePeriod(ruleSet, type, new Date(issue), on(issue, gap, hours), zone);
                for (const agenda of agendas) {
                  expect(noticeCheck(ruleSet, type, agenda, new Date(issue), on(issue, gap, hours), zone)).toStrictEqual(expected);
                }
              }
            }
          }
        }
      }
    }
  });
});

describe("noticeCheck for the ACT (sch 3 s 3.6(2), decision D13)", () => {
  const issue = "2026-09-20T23:00:00.000Z"; // Mon 21 Sep 2026, 9 am in Canberra
  const zone = "Australia/Sydney";

  it("needs 14 days for a general meeting with neither resolution on the agenda, and 7 for an executive committee", () => {
    for (const type of ["AGM", "EGM", "FIRST_AGM"] as MeetingType[]) {
      expect(noticeCheck(ACT, type, ["ORDINARY", "SPECIAL", null], new Date(issue), on(issue, 13), zone)).toStrictEqual({ requiredDays: 14, actualDays: 13, compliant: false });
      expect(noticeCheck(ACT, type, ["ORDINARY"], new Date(issue), on(issue, 14), zone)).toStrictEqual({ requiredDays: 14, actualDays: 14, compliant: true });
    }
    expect(noticeCheck(ACT, "COMMITTEE", ["ORDINARY"], new Date(issue), on(issue, 7), zone)).toStrictEqual({ requiredDays: 7, actualDays: 7, compliant: true });
  });

  it("needs 21 days with a unanimous or unopposed resolution on the agenda, and names those short of it", () => {
    expect(noticeCheck(ACT, "AGM", ["ORDINARY", "UNANIMOUS"], new Date(issue), on(issue, 20), zone)).toStrictEqual({
      requiredDays: 21,
      actualDays: 20,
      compliant: false,
      shortFor: ["UNANIMOUS"],
    });
    expect(noticeCheck(ACT, "EGM", ["UNANIMOUS"], new Date(issue), on(issue, 21), zone)).toStrictEqual({ requiredDays: 21, actualDays: 21, compliant: true });
    expect(noticeCheck(ACT, "AGM", ["UNANIMOUS", null, "UNOPPOSED", "UNANIMOUS"], new Date(issue), on(issue, 14), zone)).toStrictEqual({
      requiredDays: 21,
      actualDays: 14,
      compliant: false,
      shortFor: ["UNOPPOSED", "UNANIMOUS"],
    });
    // Short of the meeting type's 14 days too.
    expect(noticeCheck(ACT, "AGM", ["UNANIMOUS"], new Date(issue), on(issue, 3), zone)).toMatchObject({ requiredDays: 21, compliant: false, shortFor: ["UNANIMOUS"] });
  });

  it("counts whole days in the meeting's zone, across the 4 Oct 2026 daylight saving change", () => {
    // Issued Sun 13 Sep at 11.30 pm in Canberra, the meeting Sun 4 Oct at 12.30 am (after the clocks go forward at 2 am that day, it is still 4 Oct).
    const late = "2026-09-13T13:30:00.000Z";
    const meeting = new Date("2026-10-03T14:30:00.000Z");
    const expected = validateNoticePeriod(ACT, "AGM", new Date(late), meeting, zone);
    expect(expected.actualDays).toBe(21);
    expect(noticeCheck(ACT, "AGM", ["UNANIMOUS"], new Date(late), meeting, zone)).toStrictEqual({ requiredDays: 21, actualDays: 21, compliant: true });
    // A minute earlier, the meeting is on 3 Oct in Canberra: 20 days.
    expect(noticeCheck(ACT, "AGM", ["UNANIMOUS"], new Date(late), new Date("2026-10-03T13:59:00.000Z"), zone)).toMatchObject({ actualDays: 20, compliant: false });
  });
});

describe("noticeCheck for a Victorian committee and a Western Australian council meeting (decisions D12 and D14)", () => {
  const issue = "2026-10-05T23:00:00.000Z";

  it("is not checked: not compliant, no period, with why, however far away the meeting is", () => {
    for (const [rs, zone] of [[VIC, "Australia/Melbourne"], [WA, "Australia/Perth"]] as const) {
      for (const gap of [0, 3, 7, 30]) {
        const v = noticeCheck(rs, "COMMITTEE", ["ORDINARY"], new Date(issue), on(issue, gap), zone);
        expect(v).toStrictEqual({ requiredDays: null, actualDays: gap, compliant: false, notChecked: rs.noticeNotCheckedFor?.COMMITTEE });
        expect(v.notChecked).toMatch(/^[A-Z]/);
        expect(v.notChecked).not.toMatch(NO_DASH_OR_SEMICOLON);
      }
    }
  });

  it("checks their general meetings exactly as before", () => {
    for (const [rs, zone] of [[VIC, "Australia/Melbourne"], [WA, "Australia/Perth"]] as const) {
      for (const type of ["AGM", "EGM", "FIRST_AGM"] as MeetingType[]) {
        for (const gap of [13, 14]) {
          expect(noticeCheck(rs, type, ["SPECIAL", "UNANIMOUS"], new Date(issue), on(issue, gap), zone)).toStrictEqual(
            validateNoticePeriod(rs, type, new Date(issue), on(issue, gap), zone),
          );
        }
      }
    }
  });
});

describe("categoryNoticeRefusal (conduct, decision D13)", () => {
  const notice = (compliant: boolean, noticePeriodDays: number | null) => ({ compliant, noticePeriodDays });

  it("refuses an ACT unanimous or unopposed resolution unless the latest notice issued is compliant with 21 days or more", () => {
    for (const c of ["UNANIMOUS", "UNOPPOSED"]) {
      for (const latest of [null, notice(true, 14), notice(false, 21), notice(false, null), notice(true, 20), notice(true, null)]) {
        const r = categoryNoticeRefusal(ACT, c, latest);
        expect(r, `${c} ${JSON.stringify(latest)}`).toMatch(/needs at least 21 days' notice of the meeting, and the notice issued for this meeting is not recorded as giving it, so this item cannot be recorded as resolved\. Nothing was saved\. The item can be deferred\.$/);
        expect(r).not.toMatch(NO_DASH_OR_SEMICOLON);
      }
      expect(categoryNoticeRefusal(ACT, c, notice(true, 21))).toBeNull();
      expect(categoryNoticeRefusal(ACT, c, notice(true, 28))).toBeNull();
    }
    expect(categoryNoticeRefusal(ACT, "UNANIMOUS", null)).toMatch(/^A unanimous resolution needs/);
    expect(categoryNoticeRefusal(ACT, "UNOPPOSED", null)).toMatch(/^An unopposed resolution needs/);
  });

  it("never refuses a category without a longer notice, or any NSW, Queensland, Victorian or Western Australian item", () => {
    for (const c of ["ORDINARY", "SPECIAL", null, undefined, "BOGUS"]) expect(categoryNoticeRefusal(ACT, c, null)).toBeNull();
    for (const rs of [NSW, QLD, VIC, WA]) for (const c of Object.keys(rs.resolutionCategories)) expect(categoryNoticeRefusal(rs, c, null)).toBeNull();
  });
});

describe("categoryNoticeAgendaRefusal (the agenda)", () => {
  it("refuses an ACT unanimous or unopposed item once the notice is issued, and allows it before", () => {
    for (const c of ["UNANIMOUS", "UNOPPOSED"]) {
      for (const status of ["DRAFT", "SCHEDULED"]) expect(categoryNoticeAgendaRefusal(ACT, c, status)).toBeNull();
      for (const status of ["NOTICE_ISSUED", "IN_PROGRESS", "ADJOURNED", "MINUTES_DRAFT", "PUBLISHED", "CANCELLED", ""]) {
        const r = categoryNoticeAgendaRefusal(ACT, c, status);
        expect(r).toMatch(/needs at least 21 days' notice, given with the notice of the meeting, so it cannot be added once the notice is issued\. Nothing was saved\.$/);
        expect(r).not.toMatch(NO_DASH_OR_SEMICOLON);
      }
    }
  });

  it("never refuses another category, or any NSW, Queensland, Victorian or Western Australian item", () => {
    for (const c of ["ORDINARY", "SPECIAL", null]) expect(categoryNoticeAgendaRefusal(ACT, c, "NOTICE_ISSUED")).toBeNull();
    for (const rs of [NSW, QLD, VIC, WA]) {
      for (const c of Object.keys(rs.resolutionCategories)) expect(categoryNoticeAgendaRefusal(rs, c, "NOTICE_ISSUED")).toBeNull();
    }
  });
});

describe("meeting setup", () => {
  const now = new Date("2026-10-05T23:00:00.000Z");
  const input = (meetingType: string, days: number, timezone: string) => ({
    schemeId: "s1",
    title: "Meeting",
    meetingType,
    startTime: on(now.toISOString(), days).toISOString(),
    timezone,
    format: "IN_PERSON",
    location: "Room",
  });

  it("warns that a Victorian committee or Western Australian council meeting's notice is not checked, however far away", () => {
    for (const [rs, zone] of [[VIC, "Australia/Melbourne"], [WA, "Australia/Perth"]] as const) {
      for (const days of [1, 30]) {
        const { errors, warnings } = validateMeetingSetup(input("COMMITTEE", days, zone), rs, now);
        expect(errors).toEqual({});
        expect(warnings).toEqual({ startTime: `StrataVerze does not check the notice period for this meeting type. ${rs.noticeNotCheckedFor?.COMMITTEE}.` });
      }
      // Their general meetings are warned as before.
      expect(validateMeetingSetup(input("AGM", 3, zone), rs, now).warnings.startTime).toMatch(/^This is short of the 14-day notice period/);
      expect(validateMeetingSetup(input("AGM", 14, zone), rs, now).warnings).toEqual({});
    }
  });

  it("checks only the meeting type's period for the ACT, as there is no agenda yet", () => {
    expect(validateMeetingSetup(input("AGM", 14, "Australia/Sydney"), ACT, now).warnings).toEqual({});
    expect(validateMeetingSetup(input("COMMITTEE", 6, "Australia/Sydney"), ACT, now).warnings.startTime).toMatch(/^This is short of the 7-day notice period/);
  });

  it("marks the types not checked in the preview, and nothing for NSW, Queensland or the ACT", () => {
    for (const rs of [VIC, WA]) {
      const rows = buildSetupPreview(rs, now);
      expect(rows.find((r) => r.meetingType === "COMMITTEE")).toEqual({ meetingType: "COMMITTEE", noticeDays: null, earliestDate: null, notChecked: rs.noticeNotCheckedFor?.COMMITTEE });
      for (const r of rows.filter((x) => x.meetingType !== "COMMITTEE")) expect(r).not.toHaveProperty("notChecked");
    }
    for (const rs of [NSW, QLD, ACT]) for (const r of buildSetupPreview(rs, now)) expect(r).not.toHaveProperty("notChecked");
  });
});
