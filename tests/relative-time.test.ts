import { expect, test } from "bun:test";
import { relativeTime } from "../src/format";

test("relative saved dates use an injected clock, singulars, and honest future dates", () => {
  const now = Date.parse("2026-01-02T12:00:00Z");
  for (const [seconds, label] of [[0, "just now"], [59, "just now"], [60, "1 minute ago"], [120, "2 minutes ago"], [3600, "1 hour ago"], [7200, "2 hours ago"], [86400, "1 day ago"], [172800, "2 days ago"], [-120, "in 2 minutes"]] as const) {
    expect(relativeTime(new Date(now - seconds * 1000).toISOString(), now)).toBe(label);
  }
  expect(relativeTime("invalid", now)).toBe("Date unavailable");
});
