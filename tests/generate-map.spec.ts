import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

test("MAP.md route table is current", () => {
  const before = readFileSync("MAP.md", "utf8");
  execFileSync("node", ["scripts/generate-map.mjs"], { stdio: "pipe" });
  const after = readFileSync("MAP.md", "utf8");
  expect(after, "MAP.md is stale — run `npm run map` and commit the result").toBe(before);
});

test("the generator is idempotent", () => {
  execFileSync("node", ["scripts/generate-map.mjs"], { stdio: "pipe" });
  const once = readFileSync("MAP.md", "utf8");
  execFileSync("node", ["scripts/generate-map.mjs"], { stdio: "pipe" });
  expect(readFileSync("MAP.md", "utf8")).toBe(once);
});
