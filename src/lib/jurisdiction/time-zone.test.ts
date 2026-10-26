import { describe, expect, it } from "vitest";
import { dayIn, defaultTimeZone, isTimeZone, offsetIn, platformToday, startOfDayIn, storedDayIn, todayIn } from "./time-zone";

describe("a building's time zone", () => {
  it("is Sydney time for NSW, except Broken Hill and Lord Howe Island", () => {
    expect(defaultTimeZone("NSW", "2000")).toBe("Australia/Sydney");
    expect(defaultTimeZone("nsw ", "2620")).toBe("Australia/Sydney");
    expect(defaultTimeZone("NSW", "2880")).toBe("Australia/Broken_Hill");
    expect(defaultTimeZone("NSW", "2898")).toBe("Australia/Lord_Howe");
  });

  it("is known for every state, and none for an unknown one", () => {
    for (const s of ["NSW", "ACT", "VIC", "QLD", "SA", "WA", "TAS", "NT"]) expect(isTimeZone(defaultTimeZone(s, "0000"))).toBe(true);
    expect(defaultTimeZone("Auckland", "1010")).toBeNull();
    expect(defaultTimeZone(null, null)).toBeNull();
  });
});

describe("today in a time zone, not in UTC", () => {
  // 8 am in Sydney on 26 Oct 2026 (daylight saving, +11) is still 25 Oct in UTC.
  const eightAmSydney = new Date("2026-10-25T21:00:00Z");

  it("gives the building's own date", () => {
    expect(eightAmSydney.toISOString().slice(0, 10)).toBe("2026-10-25");
    expect(todayIn("Australia/Sydney", eightAmSydney)).toBe("2026-10-26");
    expect(platformToday(eightAmSydney)).toBe("2026-10-26");
    // Broken Hill is half an hour behind Sydney; Perth three hours.
    expect(todayIn("Australia/Broken_Hill", new Date("2026-10-25T13:15:00Z"))).toBe("2026-10-25"); // 23:45 in Broken Hill
    expect(todayIn("Australia/Sydney", new Date("2026-10-25T13:15:00Z"))).toBe("2026-10-26"); // 00:15 Sydney
    expect(todayIn("Australia/Perth", new Date("2026-10-25T13:15:00Z"))).toBe("2026-10-25"); // 21:15 Perth
  });

  it("reads stored timestamps and plain dates", () => {
    expect(storedDayIn("Australia/Sydney", "2026-10-25T21:00:00.000Z")).toBe("2026-10-26");
    expect(storedDayIn("Australia/Sydney", "2026-10-25")).toBe("2026-10-25");
    expect(storedDayIn("Australia/Sydney", null)).toBe("");
    expect(storedDayIn("Australia/Sydney", new Date("2026-10-25T21:00:00Z"))).toBe("2026-10-26");
    expect(() => dayIn("Australia/Sydney", "not a date")).toThrow(RangeError);
  });
});

describe("midnight in a time zone", () => {
  it("uses the offset in force at midnight, including on daylight saving change days", () => {
    expect(startOfDayIn("Australia/Sydney", "2026-07-01")).toBe("2026-07-01T00:00:00+10:00");
    expect(startOfDayIn("Australia/Sydney", "2026-12-01")).toBe("2026-12-01T00:00:00+11:00");
    // Daylight saving starts at 2 am on Sunday 4 Oct 2026: midnight is still +10.
    expect(startOfDayIn("Australia/Sydney", "2026-10-04")).toBe("2026-10-04T00:00:00+10:00");
    expect(startOfDayIn("Australia/Sydney", "2026-10-05")).toBe("2026-10-05T00:00:00+11:00");
    // It ends at 3 am on Sunday 5 Apr 2026: midnight is still +11.
    expect(startOfDayIn("Australia/Sydney", "2026-04-05")).toBe("2026-04-05T00:00:00+11:00");
    expect(startOfDayIn("Australia/Brisbane", "2026-12-01")).toBe("2026-12-01T00:00:00+10:00");
    expect(startOfDayIn("Australia/Broken_Hill", "2026-12-01")).toBe("2026-12-01T00:00:00+10:30");
    for (const day of ["2026-10-04", "2026-04-05", "2026-12-01"]) {
      expect(dayIn("Australia/Sydney", startOfDayIn("Australia/Sydney", day))).toBe(day);
      expect(dayIn("Australia/Sydney", new Date(new Date(startOfDayIn("Australia/Sydney", day)).getTime() - 1))).not.toBe(day);
    }
  });

  it("gives offsets", () => {
    expect(offsetIn("Australia/Perth", new Date("2026-12-01T00:00:00Z"))).toBe("+08:00");
    expect(offsetIn("Australia/Lord_Howe", new Date("2026-07-01T00:00:00Z"))).toBe("+10:30");
  });
});

describe("a local date and time from a form", () => {
  it("is read in the given time zone, not the server's", async () => {
    const { localToInstant, instantToLocalInput } = await import("./time-zone");
    // 6 pm on 14 Nov 2026 in Sydney (daylight saving, +11) is 7 am UTC.
    expect(localToInstant("Australia/Sydney", "2026-11-14T18:00")).toBe("2026-11-14T07:00:00.000Z");
    expect(localToInstant("Australia/Sydney", "2026-07-14T18:00")).toBe("2026-07-14T08:00:00.000Z");
    expect(localToInstant("Australia/Perth", "2026-11-14T18:00")).toBe("2026-11-14T10:00:00.000Z");
    expect(localToInstant("Australia/Broken_Hill", "2026-11-14T18:00")).toBe("2026-11-14T07:30:00.000Z");
    expect(localToInstant("Australia/Sydney", "14/11/2026 6pm")).toBeNull();
    // And back again, for the edit form.
    expect(instantToLocalInput("Australia/Sydney", "2026-11-14T07:00:00.000Z")).toBe("2026-11-14T18:00");
    expect(instantToLocalInput("Australia/Sydney", "2026-11-13T13:30:00.000Z")).toBe("2026-11-14T00:30");
    expect(instantToLocalInput("Australia/Sydney", null)).toBe("");
    for (const local of ["2026-10-04T01:30", "2026-10-04T09:00", "2026-04-05T09:00", "2026-12-31T23:59"]) {
      expect(instantToLocalInput("Australia/Sydney", localToInstant("Australia/Sydney", local)!)).toBe(local);
    }
  });

  it("ends a day at 11.59 pm local time", async () => {
    const { endOfDayIn } = await import("./time-zone");
    expect(endOfDayIn("Australia/Sydney", "2026-12-01")?.toISOString()).toBe("2026-12-01T12:59:00.000Z");
    expect(endOfDayIn("Australia/Sydney", "2026-07-01")?.toISOString()).toBe("2026-07-01T13:59:00.000Z");
    // The day daylight saving starts is 23 hours long; it still ends at 11.59 pm (+11).
    expect(endOfDayIn("Australia/Sydney", "2026-10-04")?.toISOString()).toBe("2026-10-04T12:59:00.000Z");
    expect(endOfDayIn("Australia/Sydney", "2026-04-05")?.toISOString()).toBe("2026-04-05T13:59:00.000Z");
    expect(endOfDayIn("Australia/Sydney", "nope")).toBeNull();
  });
});

describe("awkward local times", () => {
  it("refuses impossible dates and times instead of throwing", async () => {
    const { localToInstant, endOfDayIn, isCalendarDay } = await import("./time-zone");
    expect(localToInstant("Australia/Sydney", "2026-13-45T25:99")).toBeNull();
    expect(localToInstant("Australia/Sydney", "2026-02-30T10:00")).toBeNull();
    expect(endOfDayIn("Australia/Sydney", "2026-02-30")).toBeNull();
    expect(isCalendarDay("2028-02-29")).toBe(true);
    expect(isCalendarDay("2026-02-29")).toBe(false);
  });

  it("reads the skipped hour forward and the repeated hour as standard time", async () => {
    const { localToInstant } = await import("./time-zone");
    // 2.30 am on 4 Oct 2026 does not exist in Sydney: read as 3.30 am daylight time (16:30 UTC on 3 Oct).
    expect(localToInstant("Australia/Sydney", "2026-10-04T02:30")).toBe("2026-10-03T16:30:00.000Z");
    // 2.30 am on 5 Apr 2026 happens twice: the later one (standard time, +10).
    expect(localToInstant("Australia/Sydney", "2026-04-05T02:30")).toBe("2026-04-04T16:30:00.000Z");
    // Lord Howe moves by half an hour: 2.15 am on 4 Oct is skipped, read as 2.45 am (+11).
    expect(localToInstant("Australia/Lord_Howe", "2026-10-04T02:15")).toBe("2026-10-03T15:45:00.000Z");
  });
});

describe("the database check on a building's time zone", () => {
  it("allows every zone a building can be given", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const sql = readFileSync(join(__dirname, "../../../prisma/migrations/20261109_scheme_time_zone.sql"), "utf8");
    const allowed = new Set([...sql.slice(sql.indexOf("schemes_time_zone_check CHECK")).matchAll(/'([A-Za-z_/]+)'/g)].map((m) => m[1]));
    const { defaultTimeZone } = await import("./time-zone");
    for (const state of ["NSW", "ACT", "VIC", "QLD", "SA", "WA", "TAS", "NT"]) {
      for (const postcode of ["2000", "2880", "2898", "3000"]) expect(allowed.has(defaultTimeZone(state, postcode)!)).toBe(true);
    }
  });
});
