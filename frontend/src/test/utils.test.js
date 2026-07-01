import { describe, test, expect } from "vitest";
import { money, formatDate } from "../utils";

describe("money", () => {
  test("formats with currency and 2 decimals", () => {
    expect(money(1234.5)).toBe("$1,234.50");
  });
  test("handles zero and non-numbers", () => {
    expect(money(0)).toBe("$0.00");
    expect(money("abc")).toBe("$0.00");
    expect(money(null)).toBe("$0.00");
  });
});

describe("formatDate", () => {
  test("returns em dash for empty values", () => {
    expect(formatDate("")).toBe("—");
    expect(formatDate(null)).toBe("—");
  });
  test("passes through unparseable values", () => {
    expect(formatDate("not-a-date")).toBe("not-a-date");
  });
  test("formats a valid date string", () => {
    expect(formatDate("2026-06-30 12:00:00")).toMatch(/2026/);
  });
});
