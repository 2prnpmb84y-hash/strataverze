import { describe, expect, it } from "vitest";
import { reminderDue } from "./reminder-days";

describe("deadline reminders", () => {
  it("go out 14, 7 and 1 days before, and 1, 7, 14 and 28 days after", () => {
    const days = Array.from({ length: 60 }, (_, i) => 30 - i);
    const sent = days.filter((d) => reminderDue(d) !== null);
    expect(sent).toEqual([14, 7, 1, -1, -7, -14, -28]);
    expect(reminderDue(7)).toBe("UPCOMING");
    expect(reminderDue(-7)).toBe("OVERDUE");
    expect(reminderDue(0)).toBeNull();
  });
});
