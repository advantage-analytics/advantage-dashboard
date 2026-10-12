import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

/**
 * Notice strips — three colours, and the icon agrees with the strip.
 *
 * Grey (`noteStripCls`) is a wait or a fact, yellow (`warningStripCls`) a
 * caution or a question, red (`errorStripCls`) a refusal or a failure. The
 * retired register was a red `XCircle` on a GREY strip, where a refusal read
 * no louder than "nothing is uploading yet". This reads the source of the two
 * upload flows and fails if a grey strip holds an error or warning glyph, so
 * the rule cannot drift back one strip at a time.
 * (`.skills/advantage-analytics-design/reference/primitives.md` › Notice strips.)
 */

const FLOWS = [
  "src/components/dashboard/matches/new-match-wizard",
  "src/components/dashboard/matches/match-video-attachment",
];

/** Each strip's opening tag plus the element that follows it. */
function strips(source: string): { cls: string; head: string }[] {
  const found: { cls: string; head: string }[] = [];
  const pattern =
    /className=\{`?(?:\$\{)?(noteStripCls|NOTE_CLS|warningStripCls|errorStripCls)\}/g;
  for (const match of source.matchAll(pattern)) {
    const after = source.slice(match.index, match.index + 400);
    const icon = after.match(/<([A-Z][A-Za-z0-9]*)\b/);
    found.push({ cls: match[1], head: icon?.[1] ?? "" });
  }
  return found;
}

const files = FLOWS.flatMap((dir) =>
  readdirSync(dir)
    .filter((name) => name.endsWith(".tsx"))
    .map((name) => join(dir, name)),
);

test("the two upload flows are where the strips live", () => {
  const total = files.flatMap((f) => strips(readFileSync(f, "utf8"))).length;
  // Guards the parser, not a count: if this finds nothing the test below
  // passes for the wrong reason.
  expect(total).toBeGreaterThan(10);
});

for (const file of files) {
  test(`no error or warning glyph on a grey strip — ${file}`, () => {
    const offenders = strips(readFileSync(file, "utf8")).filter(
      (s) =>
        // `NOTE_CLS` is SourceStepContent's local name for the grey strip.
        (s.cls === "noteStripCls" || s.cls === "NOTE_CLS") &&
        ["XCircle", "TriangleAlert", "VideoOff"].includes(s.head),
    );
    expect(offenders).toEqual([]);
  });
}

test("a red strip's glyph takes the strip's colour, not its own", () => {
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    // `--error` is the inline field-error red; on a notice strip it is the
    // retired pairing.
    expect(source, file).not.toMatch(/noteIconCls\} text-\[var\(--error\)\]/);
  }
});
