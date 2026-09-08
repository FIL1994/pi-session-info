import { expect, test } from "bun:test";
import { discoveryText, scanWarnings } from "../src/extension/discovery";
import { PROCESS_DISCOVERY_LIMITATION } from "../src/discover";
import type { SessionPage } from "../src/extension/picker";

const page: SessionPage = {
  tab: "Running",
  summary: "2 running · 2 connected",
  warnings: [],
  rows: [],
  actions: [],
  empty: "",
  now: 1000,
  updatedAt: 1000,
};

test("only the known static limitation is moved to help; other warnings survive", () => {
  expect(scanWarnings([PROCESS_DISCOVERY_LIMITATION])).toEqual([]);
  expect(
    scanWarnings([
      PROCESS_DISCOVERY_LIMITATION,
      "Unknown warning",
      "Unknown warning",
      "Scan limit reached",
    ]),
  ).toEqual(["Unknown warning", "Scan limit reached"]);
  const text = discoveryText(page);
  expect(text).toContain("No scan warnings reported");
  expect(text).toContain("does not guarantee every session was found");
  expect(text).toContain("Node-launched instances may be missed");
  expect(text).toContain("Background agents");
  expect(text).toContain("/reload");
  expect(text).not.toContain("How Recent works");
});

test("real warnings come first, with next steps, and untrusted text is escaped", () => {
  const text = discoveryText({
    ...page,
    warnings: ["History: unreadable\u001b[31m files", "Scan limit reached"],
  });
  expect(text).not.toContain("No scan warnings");
  expect(text).not.toContain("\u001b");
  expect(text).toContain("\\u001b");
  expect(text.indexOf("Scan limit reached")).toBeLessThan(text.indexOf("How Running works"));
  expect(text).toContain("What to do");
  expect(text).toContain("press r to retry");
});

test("unloaded and failed attempts are never described as successful scans", () => {
  const { updatedAt: _updatedAt, ...unloaded } = page;
  expect(discoveryText(unloaded)).toContain("No snapshot loaded yet");
  expect(discoveryText(unloaded)).not.toContain("No scan warnings reported");
  expect(
    discoveryText({ ...page, notice: "Refresh failed · previous snapshot retained" }),
  ).toContain("Latest attempt\nRefresh failed");
});
