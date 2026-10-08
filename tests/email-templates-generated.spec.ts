import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

/**
 * `scripts/build_email_templates.py` and `supabase/email-templates/*.html`
 * agree byte for byte.
 *
 * They once did not: the font fix and a copy change were made in the .html
 * files by hand and never ported back, so running the generator would have
 * reverted both in all six templates. The generator writes to a temp directory
 * here (`--out`), never over the tracked files.
 *
 * Needs `python3` on PATH — present on CI's `ubuntu-latest` and on macOS. A
 * machine without it fails this spec rather than skipping it: a skipped
 * drift check is the state this exists to end.
 */

const DIR = join(__dirname, "..", "supabase", "email-templates");
const SCRIPT = join(__dirname, "..", "scripts", "build_email_templates.py");
const committed = readdirSync(DIR)
  .filter((f) => f.endsWith(".html"))
  .sort();

test("the generator reproduces the committed auth templates", () => {
  const out = mkdtempSync(join(tmpdir(), "email-templates-"));
  try {
    execFileSync("python3", [SCRIPT, "--out", out], { stdio: "pipe" });
    expect(readdirSync(out).sort()).toEqual(committed);
    expect(committed).toHaveLength(6);
    for (const file of committed) {
      expect(
        readFileSync(join(out, file), "utf8"),
        `${file} differs from what scripts/build_email_templates.py emits — ` +
          "port the change into the script, or re-run it and commit the result",
      ).toBe(readFileSync(join(DIR, file), "utf8"));
    }
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
