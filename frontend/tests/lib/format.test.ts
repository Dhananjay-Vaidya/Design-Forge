import { describe, expect, it } from "vitest";

import { daysUntil, formatDate, parseLocalDate, toPoints } from "@/lib/format";

describe("format helpers", () => {
  it("parses calendar dates as local dates so they never shift a day", () => {
    const d = parseLocalDate("2026-03-01");
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 2, 1]);
    expect(formatDate("2026-03-01")).toContain("2026");
  });

  it("counts days until a deadline relative to today", () => {
    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    expect(daysUntil(iso)).toBe(0);
  });

  it("presents 0..1 engine totals on a 0..100 scale", () => {
    expect(toPoints("0.7222")).toBe("72.2");
    expect(toPoints(1)).toBe("100.0");
  });
});
