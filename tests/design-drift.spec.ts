import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";

// The design system is 2,384 lines of prose, so drift returns silently — a
// near-twin grey, a font size in a gap the scale never defined, a chart hue
// inlined instead of imported. `scripts/check-design-drift.mjs` counts those;
// this is what makes the count a gate rather than a report nobody runs.
//
// It needs no environment, so unlike the live-database specs it runs on CI's
// keyless checkout.

test("design drift matches its seeded counts", () => {
  let output: string;
  let failed = false;
  try {
    output = execFileSync("node", ["scripts/check-design-drift.mjs"], {
      encoding: "utf8",
      stdio: "pipe",
    });
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string };
    output = (e.stdout ?? "") + (e.stderr ?? "");
    failed = true;
  }

  // The checker fails in BOTH directions on purpose. Above the seed is a
  // regression; below it means work cleared drift without lowering the number,
  // which is how a burn-down quietly stops meaning anything. Its own output
  // says which happened and what to do, so surface it verbatim.
  expect(failed, `\n${output}`).toBe(false);
});
